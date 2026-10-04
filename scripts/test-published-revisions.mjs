import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

process.on('uncaughtException', error => { console.error(error.message); console.error(error.where ?? error.stack?.split('\n').slice(1,4).join('\n')); process.exit(1); });

let checks=0;
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message); checks++;};
const reject=async(task,pattern)=>{await assert.rejects(task,pattern); checks++;};
const db=new PGlite();
for(const path of ['tests/schema-fixture.sql','supabase/migrations/20260916_authenticated_workflow.sql',
  'supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql',
  'supabase/migrations/20261004151522_published_revisions_and_reports.sql']) await db.exec(await fs.readFile(path,'utf8'));
const ids=Object.fromEntries(['admin','reviewer','encoder','viewer','other'].map((role,index)=>[role,'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0')]));
for(const [role,id] of Object.entries(ids)) {
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,role+'@example.test']);
  await db.query('insert into profiles(id,full_name,role) values($1,$2,$3)',[id,role,role==='other'?'encoder':role]);
}
const as=async role=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]??'']);
  await db.exec('set role '+(role==='anon'?'anon':'authenticated'));
};
const owner=()=>db.exec('reset role');
const get=async sample=>(await db.query('select * from sample_units where id=$1',[sample])).rows[0];
const token=async sample=>{const s=await get(sample);return {revision:s.input_revision,version:s.action_version};};
const action=(sample,act,payload={})=>db.query('select lakad_inspection_action($1,$2,$3)',[sample,act,payload]);
const currentAction=async(sample,act,payload={})=>action(sample,act,{...payload,...await token(sample)});
const trustedOutput=pci=>({pci,condition:'FICTIONAL TEST ONLY',iterations:[],total_deduct_value:100-pci,
  max_corrected_deduct_value:100-pci,reviewer_comments:'MUST NOT ENTER REPORT'});
async function verifyFixture(sample,pci) {
  await owner();
  await db.query("update inspection_computations set verification='verified',reference_id='TEST-NOT-ASTM',algorithm_version='fixture-only',output_snapshot=$2 where id=(select computation_id from sample_units where id=$1)",[sample,trustedOutput(pci)]);
}
async function deniedViewerInternals() {
  for(const table of ['sample_units','inspection_computations','inspection_history','lakad_audit','profiles',
    'branches','sections','distress_records','distress_photos','distress_types','deduct_value_points','lakad_settings','section_results'])
    equal((await db.query('select * from '+table)).rows,[], 'Viewer cannot SELECT '+table);
  await reject(()=>db.query('select * from lakad_accounts_page()'),/Administrator/);
  await reject(()=>db.query('select * from lakad_accounts()'),/Administrator/);
}
await as('admin');
const branch=(await db.query("insert into branches(name) values('ORIGINAL ROAD') returning id")).rows[0].id;
const section=(await db.query("insert into sections(branch_id,name,length_meters,width_meters,area_sqm) values($1,'ORIGINAL SECTION',92,5,460) returning id",[branch])).rows[0].id;
const type=(await db.query("select lakad_save_distress_type(null,$1) as id",[{code:'TEST',name:'ORIGINAL DISTRESS',default_unit_of_measure:'m\u00b2',severity_required:true,allowed_severities:['low','medium','high'],is_active:true}])).rows[0].id;
await as('reviewer');
await db.query('select lakad_plan_samples($1,$2)',[section,{total:2,required:2,inspector:ids.encoder,reviewer:ids.reviewer,start:'0 m',end:'92 m',rationale:'FICTIONAL TEST ONLY'}]);
const sample=(await db.query('select id from sample_units order by unit_number')).rows[0].id;

await as('viewer');
equal((await db.query('select lakad_session_access() as access')).rows[0].access,{role:'viewer',is_active:true},'Minimal session bootstrap');
await deniedViewerInternals();
equal((await db.query('select * from approved_results')).rows,[],'Drafts have no approved reports');
await reject(()=>action(sample,'approve',{revision:1,version:0}),/outside your assignment/);
await reject(()=>db.query("insert into approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at) values(gen_random_uuid(),$1,1,'{}',now())",[sample]),/permission denied/);

await as('encoder');
await currentAction(sample,'start');
await currentAction(sample,'save',{surveyed_at:'2026-01-01',notes:'ORIGINAL INSPECTION NOTE',latitude:'14',longitude:'121'});
await currentAction(sample,'distress',{distress_type_id:type,severity:'low',quantity:10});
const photoPath=sample+'/original.jpg';
await db.query("insert into storage.objects(bucket_id,name) values('sample-unit-photos',$1)",[photoPath]);
await currentAction(sample,'photo',{path:photoPath,caption:'ORIGINAL CAPTION'});
await currentAction(sample,'submit');
const originalPending=(await get(sample)).computation_id;
await as('viewer');
equal((await db.query('select * from approved_results')).rows,[],'Pending inputs have no approved reports');
await deniedViewerInternals();
await as('reviewer');
const stale=await token(sample);
await reject(()=>action(sample,'return',{revision:stale.revision,comments:'Missing version'}),/changed/);
await reject(()=>action(sample,'return',{...stale,revision:stale.revision-1,comments:'Wrong revision'}),/changed/);
await reject(()=>currentAction(sample,'approve'),/pending verification/);
// Two sessions have taken the same token. PGlite queues these calls on one
// connection: real independent connections and lock waits are a hosted gate.
const concurrent=await Promise.allSettled([
  action(sample,'return',{...stale,comments:'SESSION A'}),
  action(sample,'return',{...stale,comments:'SESSION B'}),
]);
equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'Exactly one concurrent review request succeeds');
equal(concurrent.filter(r=>r.status==='rejected').length,1,'The second session token is rejected');
equal((await get(sample)).input_revision,stale.revision+1,'Return creates a new resubmission revision');
await reject(()=>action(sample,'approve',stale),/changed/);
await as('viewer');
await deniedViewerInternals();
equal((await db.query('select * from approved_results')).rows,[],'Returned inspections remain private');

await as('encoder');
await currentAction(sample,'submit'); // no measurement edits; still a new revision
const approvedComputation=(await get(sample)).computation_id;
equal(approvedComputation===originalPending,false,'Resubmission has a separate immutable computation');
await verifyFixture(sample,60);
await reject(()=>db.query("update inspection_computations set input_snapshot='{}' where id=$1",[approvedComputation]),/immutable/);
await as('reviewer');
await currentAction(sample,'approve');
const initialApproval=(await db.query('select * from approved_results where id=$1',[approvedComputation])).rows[0];
equal(initialApproval.is_current,true,'Approved calculation becomes current');
equal(initialApproval.report_snapshot.output.reviewer_comments,undefined,'Report allowlist excludes review comments');
equal(Object.hasOwn(initialApproval.report_snapshot.sample,'surveyed_by'),false,'Report excludes account identifiers');
await owner();
await reject(()=>db.query("update sample_units set inspection_notes='ALTERED' where id=$1",[sample]),/locked/);
await reject(()=>db.query("update inspection_computations set output_snapshot=$2 where id=$1",[approvedComputation,trustedOutput(99)]),/locked/);
await reject(()=>db.query("update approved_results set report_snapshot='{}' where id=$1",[approvedComputation]),/immutable/);
await reject(()=>db.query('delete from approved_results where id=$1',[approvedComputation]),/cannot be deleted/);
await reject(()=>db.query("update distress_records set quantity=99 where sample_unit_id=$1",[sample]),/locked/);
await reject(()=>db.query('delete from distress_records where sample_unit_id=$1',[sample]),/locked/);
await reject(()=>db.query("insert into distress_records(sample_unit_id,distress_type_id,severity,quantity,unit_of_measure) values($1,$2,'low',1,'m²')",[sample,type]),/locked/);
await reject(()=>db.query("update distress_photos set caption='CHANGED' where sample_unit_id=$1",[sample]),/locked/);
await as('encoder');
await reject(()=>db.query("update sample_units set inspection_notes='ALTERED' where id=$1",[sample]),/permission denied/);
await as('viewer');
equal((await db.query('select * from approved_results')).rows,[],'Approval without publication is private');
equal((await db.query('select lakad_private.approved_photo($1) as visible',[photoPath])).rows[0].visible,false,'Viewer helper cannot reveal unpublished evidence');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s.count,0,'Viewer summary excludes unpublished approvals');
await as('reviewer');
await currentAction(sample,'publish');
await as('viewer');
equal((await db.query('select * from approved_results')).rows.length,1,'Published approval is readable');
await deniedViewerInternals();
equal((await db.query('select lakad_report_summary() as s')).rows[0].s,{count:1,average:60},'Viewer current summary');
equal((await db.query('select name from storage.objects')).rows.map(p=>p.name),[photoPath],'Viewer reads only approved published evidence');
await owner();
await db.exec('create policy unsafe_legacy_read on storage.objects for select to authenticated using(true)');
await db.query("insert into storage.objects(bucket_id,name) values('sample-unit-photos',$1)",[sample+'/DRAFT-ONLY.jpg']);
await as('viewer');
equal((await db.query('select name from storage.objects')).rows.map(p=>p.name),[photoPath],'Restrictive storage rule defeats a permissive legacy policy');

await owner();
const oldSectionResult=(await db.query("insert into section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,approved_by) values($1,'TEST ONLY','TEST-NOT-ASTM','fixture-only',$2,'{}',60,'TEST ONLY',$3) returning id",[section,[approvedComputation],ids.reviewer])).rows[0].id;
await as('viewer');
equal((await db.query('select lakad_section_reports() as r')).rows[0].r.length,1,'Published current section result can be ranked');
await as('encoder');
await reject(()=>currentAction(sample,'correct'),/reason required/);
await currentAction(sample,'correct',{comments:'Correction request'});
equal((await get(sample)).current_approved_computation_id,approvedComputation,'Draft correction keeps previous approved calculation current');
await currentAction(sample,'save',{surveyed_at:'2026-01-02',notes:'CORRECTION PRIVATE',latitude:'',longitude:''});
const distress=(await db.query('select id from distress_records where sample_unit_id=$1',[sample])).rows[0].id;
await currentAction(sample,'distress',{id:distress,distress_type_id:type,severity:'high',quantity:25});
const photo=(await db.query('select id from distress_photos where sample_unit_id=$1',[sample])).rows[0].id;
await currentAction(sample,'remove_photo',{id:photo});
equal((await db.query('delete from storage.objects where name=$1 returning name',[photoPath])).rows,[],'Approved historical evidence cannot be deleted during correction');
await as('admin');
await db.query("update branches set name='RENAMED ROAD' where id=$1",[branch]);
await db.query("update distress_types set name='RENAMED DISTRESS' where id=$1",[type]);
await as('viewer');
const duringCorrection=(await db.query('select * from approved_results')).rows[0];
equal(duringCorrection.report_snapshot,initialApproval.report_snapshot,'Unapproved edits cannot alter visible approved evidence');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s,{count:1,average:60},'Correction draft does not replace current result');
equal((await db.query('select lakad_section_reports() as r')).rows[0].r[0].id,oldSectionResult,'Ranking remains current during correction');

await as('encoder');
await currentAction(sample,'submit');
const replacement=(await get(sample)).computation_id;
await verifyFixture(sample,80);
await as('reviewer');
const replacementToken=await token(sample);
await reject(()=>action(sample,'approve',stale),/changed/);
const approvalRace=await Promise.allSettled([action(sample,'approve',replacementToken),action(sample,'return',{...replacementToken,comments:'SESSION B'})]);
equal(approvalRace[0].status,'fulfilled','First current review succeeds');
equal(approvalRace[1].status,'rejected','Concurrent return cannot undo approval');
const oldApproval=(await db.query('select * from approved_results where id=$1',[approvedComputation])).rows[0];
equal(oldApproval.is_current,false,'Previous approval is superseded atomically');
equal(!!oldApproval.superseded_at,true,'Superseded timestamp is recorded');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s,{count:1,average:80},'Staff current aggregation counts only replacement');
await as('viewer');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s,{count:0,average:null},'Unpublished replacement does not enter Viewer current reports');
equal((await db.query('select * from approved_results')).rows.length,1,'Previously published history remains accessible');
equal((await db.query('select lakad_section_reports() as r')).rows[0].r,[],'Ranking using a superseded calculation is excluded');
await as('reviewer');
await currentAction(sample,'publish');
await as('viewer');
const allHistory=(await db.query('select * from approved_results')).rows;
equal(allHistory.length,2,'Both published approvals are preserved');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s,{count:1,average:80},'Viewer current aggregation counts only published replacement');
const originalHistory=allHistory.find(r=>r.id===approvedComputation);
equal(originalHistory.report_snapshot,initialApproval.report_snapshot,'Historical snapshot survives road and catalog changes');
equal(originalHistory.report_snapshot.road.branch_name,'ORIGINAL ROAD','Historical road labels are saved');
equal(originalHistory.report_snapshot.distresses[0].name,'ORIGINAL DISTRESS','Historical distress labels are saved');
await deniedViewerInternals();
await owner();
equal((await db.query('select input_snapshot from inspection_computations where id=$1',[originalPending])).rows[0].input_snapshot.sample.inspection_notes,'ORIGINAL INSPECTION NOTE','Unapproved historical inputs are retained internally');
await reject(()=>db.query('delete from inspection_computations where id=$1',[approvedComputation]),/locked/);
await reject(()=>db.query('delete from section_results where id=$1',[oldSectionResult]),/immutable/);

// Paginated feed and global aggregate: all fixtures are explicitly fictional.
const canonical=allHistory.find(r=>r.id===replacement).report_snapshot;
for(let i=3;i<108;i++) {
  const rankedSection=(await db.query("insert into sections(branch_id,name,length_meters,width_meters,area_sqm) values($1,$2,46,5,230) returning id",[branch,'FICTIONAL SECTION '+i])).rows[0].id;
  const u=(await db.query("insert into sample_units(section_id,unit_number,area_sqm) values($1,$2,230) returning id",[rankedSection,i])).rows[0].id;
  const c=(await db.query("insert into inspection_computations(sample_unit_id,input_revision,edition,input_snapshot,verification,reference_id,algorithm_version,output_snapshot) values($1,1,'TEST ONLY',$2,'verified','TEST-NOT-ASTM','fixture-only',$3) returning id",[u,{sample:{id:u,section_id:rankedSection},distresses:[],photos:[]},trustedOutput(30)])).rows[0].id;
  await db.query("insert into approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at) values($1,$2,1,$3,now(),now())",[c,u,{...canonical,road:{...canonical.road,section_id:rankedSection,section_name:'FICTIONAL SECTION '+i},sample:{...canonical.sample,id:u,unit_number:i},output:trustedOutput(30)}]);
  await db.query("insert into section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,approved_by,affected_area) values($1,'TEST ONLY','TEST-NOT-ASTM','fixture-only',$2,'{}',30,'TEST ONLY',$3,$4)",[rankedSection,[c],ids.reviewer,i]);
  const account='10000000-0000-4000-8000-'+String(i).padStart(12,'0');
  await db.query('insert into auth.users(id,email) values($1,$2)',[account,'fixture'+i+'@example.test']);
  await db.query("insert into profiles(id,full_name,role) values($1,'FICTIONAL ACCOUNT','encoder')",[account]);
}
// A newly approved sample invalidates an incomplete section cohort too.
const completeSection=(await db.query("insert into section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,approved_by) values($1,'TEST ONLY','TEST-NOT-ASTM','fixture-only',$2,'{}',80,'TEST ONLY',$3) returning id",[section,[replacement],ids.reviewer])).rows[0].id;
equal((await db.query('select lakad_private.valid_section_result($1,true) as valid',[completeSection])).rows[0].valid,true,'Section references its full current cohort');
const extraUnit=(await db.query('select id from sample_units where section_id=$1 and id<>$2',[section,sample])).rows[0].id;
const extraCalculation=(await db.query("insert into inspection_computations(sample_unit_id,input_revision,edition,input_snapshot,verification,reference_id,algorithm_version,output_snapshot) values($1,1,'TEST ONLY',$2,'verified','TEST-NOT-ASTM','fixture-only',$3) returning id",[extraUnit,{sample:{id:extraUnit,section_id:section},distresses:[],photos:[]},trustedOutput(80)])).rows[0].id;
await db.query("insert into approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at) values($1,$2,1,$3,now(),now())",[extraCalculation,extraUnit,{...canonical,sample:{...canonical.sample,id:extraUnit,unit_number:2},output:trustedOutput(80)}]);
equal((await db.query('select lakad_private.valid_section_result($1,true) as valid',[completeSection])).rows[0].valid,false,'New current approval invalidates incomplete section aggregation');
const duplicateSection=(await db.query("insert into section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,approved_by) values($1,'TEST ONLY','TEST-NOT-ASTM','fixture-only',$2,'{}',80,'TEST ONLY',$3) returning id",[section,[replacement,extraCalculation,replacement],ids.reviewer])).rows[0].id;
equal((await db.query('select lakad_private.valid_section_result($1,true) as valid',[duplicateSection])).rows[0].valid,false,'Section cannot count a current sample twice');
await as('viewer');
const page1=(await db.query('select * from approved_results where is_current order by id limit 50')).rows;
const page2=(await db.query('select * from approved_results where is_current and id>$1 order by id limit 50',[page1.at(-1).id])).rows;
equal(page1.length,50,'First page is bounded');
const page3=(await db.query('select * from approved_results where is_current and id>$1 order by id limit 50',[page2.at(-1).id])).rows;
equal(page2.length,50,'Second page stays bounded');
equal(page3.length,7,'Final page contains remaining samples');
equal(new Set([...page1,...page2,...page3].map(r=>r.sample_unit_id)).size,107,'Cursor pagination has no duplicate current samples');
equal((await db.query('select lakad_report_summary() as s')).rows[0].s.count,107,'Summary counts all current rows beyond one page');
const rank1=(await db.query('select lakad_section_reports(null,50) as r')).rows[0].r;
const rank2=(await db.query('select lakad_section_reports($1,50) as r',[rank1.at(-1).id])).rows[0].r;
equal(rank1.length,50,'Rank page bounded');equal(rank2[0].rank,51,'Server rank continues across pages');
equal(rank1[0].affected_area,107,'Server ranks area ties across all rows, not one page');
const scoped=(await db.query('select lakad_section_reports(null,50,$1) as r',[[rank2[0].section_id]])).rows[0].r;
equal(scoped.length,1,'Inventory fetches only the loaded section results');equal(scoped[0].rank,51,'Scoped inventory retains global rank beyond the first page');
equal(new Set([...rank1,...rank2].map(r=>r.section_id)).size,100,'Ranking pages do not duplicate sections');
equal((await db.query('select lakad_section_reports(null,1000) as r')).rows[0].r.length,100,'Section RPC clamps oversize requests');
equal(Object.hasOwn(rank1[0],'approved_by'),false,'Section report excludes Reviewer account');
await as('admin');equal((await db.query('select * from lakad_accounts_page(null,1000)')).rows.length,100,'Account RPC clamps oversize requests');
const accounts1=(await db.query('select * from lakad_accounts_page(null,50)')).rows;
const accounts2=(await db.query('select * from lakad_accounts_page($1,50)',[accounts1.at(-1).id])).rows;
equal(new Set([...accounts1,...accounts2].map(r=>r.id)).size,100,'Account pages have no duplicates');
await as('anon');
await reject(()=>db.query('select * from approved_results'),/permission denied/);
await reject(()=>db.query('select lakad_section_reports()'),/permission denied/);
await as('admin');
await db.query('select lakad_manage_account($1,$2,$3)',[ids.viewer,'viewer',false]);
await as('viewer');
equal((await db.query('select * from approved_results')).rows,[],'Deactivated Viewer loses access immediately');
await reject(()=>db.query('select lakad_section_reports()'),/Active authenticated/);

// Test the actual CSV and current-selection helpers against saved history.
const source=await fs.readFile('src/lib/approved-results.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const reports=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
equal(reports.currentApprovedResults(allHistory,true).map(r=>r.id),[replacement],'Client current selector excludes historical revisions');
const csv=reports.approvedReportCsv([originalHistory]);
equal(csv[1][0],'ORIGINAL ROAD','CSV historical road name');
equal(csv[1][6],60,'CSV historical PCI');
equal(csv[1].at(-1).includes('ORIGINAL DISTRESS'),true,'CSV historical distress name');
equal(csv[1].at(-1).includes('RENAMED DISTRESS'),false,'CSV never joins live distress names');
// Exercise the real client loader: Viewers query only the curated published feed.
const calls=[];
globalThis.__lakadLoaderClient={
  from(table) {
    calls.push(['from',table]);
    const query={then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
    for(const name of ['select','order','limit','gt','eq','not']) query[name]=(...args)=>{calls.push([name,...args]);return query;};
    return query;
  },
  async rpc(name,args){calls.push(['rpc',name,args]);return {data:name==='lakad_report_summary'?{count:107,average:30}:[],error:null};}
};
const loaderSource=await fs.readFile('src/lib/approved-data.ts','utf8');
const loaderJs=ts.transpileModule(loaderSource,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText
  .replace(/import\s*\{\s*supabase\s*\}\s*from\s*['"]\.\/supabase['"];?/, 'const supabase=globalThis.__lakadLoaderClient;');
const loader=await import('data:text/javascript;base64,'+Buffer.from(loaderJs).toString('base64'));
await loader.loadApprovedPage(null,false,true);
equal(calls.filter(c=>c[0]==='from'),[['from','approved_results']],'Viewer loader never queries internal tables');
equal(calls.some(c=>c[0]==='not'&&c[1]==='published_at'&&c[2]==='is'&&c[3]===null),true,'Viewer loader explicitly filters publication');
equal(calls.some(c=>c[0]==='eq'&&c[1]==='is_current'&&c[2]===true),true,'Current loader excludes historical revisions');
equal(calls.some(c=>c[0]==='limit'&&c[1]===50),true,'Client page is bounded to 50');
calls.length=0;
await loader.loadApprovedPage(replacement,true,true);
equal(calls.some(c=>c[0]==='gt'&&c[1]==='id'&&c[2]===replacement),true,'Client sends cursor to database');
equal(calls.some(c=>c[0]==='eq'&&c[1]==='is_current'),false,'History loader includes superseded published snapshots');
calls.length=0;
await loader.loadApprovedSummary();await loader.loadSectionReportPage(replacement);
equal(calls.map(c=>c[1]),['lakad_report_summary','lakad_section_reports'],'Summaries and ranks use server queries');
equal(calls[1][2],{page_after:replacement,page_size:50},'Ranking loader sends bounded cursor request');
delete globalThis.__lakadLoaderClient;
await db.close();
console.log('Passed '+checks+' published-access, stale-review, revision, snapshot and pagination checks. No hosted writes.');
