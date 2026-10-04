import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { moduleUrl } from './typescript-test-loader.mjs';
const {calculateSample}=await import(await moduleUrl('src/lib/d6433-24/sample.ts'));
const {sampleFromSnapshot}=await import(await moduleUrl('src/lib/d6433-24/snapshot.ts'));
const {calculateSection}=await import(await moduleUrl('src/lib/d6433-24/section.ts'));
const {handler}=await import(await moduleUrl('supabase/functions/calculate-pci/handler.ts'));
const {ReferenceUnavailable}=await import(await moduleUrl('src/lib/d6433-24/curves.ts'));
process.on('uncaughtException',error=>{console.error(error.message);console.error(error.where ?? error.stack?.split('\n').slice(1,3).join('\n'));process.exit(1);});
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const reject=async(f,re)=>{await assert.rejects(f,re);checks++;};
const db=new PGlite();
await db.exec("create role service_role");
for(const p of ['tests/schema-fixture.sql','supabase/migrations/20260916_authenticated_workflow.sql','supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql','supabase/migrations/20261004151522_published_revisions_and_reports.sql','supabase/migrations/20261004162431_d6433_24_provisional_calculations.sql'])await db.exec(await fs.readFile(p,'utf8'));
const ids=Object.fromEntries(['admin','reviewer','encoder','viewer','other'].map((r,i)=>[r,'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
for(const [r,id]of Object.entries(ids)){await db.query('insert into auth.users(id,email)values($1,$2)',[id,r+'@fictional.test']);await db.query('insert into profiles(id,full_name,role)values($1,$2,$3)',[id,r,r==='other'?'encoder':r]);}
const as=async(r)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[r]??'']);await db.exec('set role '+(r==='service'?'service_role':'authenticated'));};
const owner=()=>db.exec('reset role');
const get=async(id)=>(await db.query('select * from sample_units where id=$1',[id])).rows[0];
const action=async(id,act,payload={})=>{const s=await get(id);return db.query('select lakad_inspection_action($1,$2,$3)',[id,act,{...payload,revision:s.input_revision,version:s.action_version}]);};
const context=async(id,kind='sample')=>(await db.query('select lakad_calculation_context($1,$2)as c',[id,kind])).rows[0].c;
const save=(c,o,actor=ids.encoder)=>db.query('select lakad_record_provisional_calculation($1,$2,$3)',[actor,c,o]);
await as('admin');
const branch=(await db.query("insert into branches(name)values('FICTIONAL')returning id")).rows[0].id;
const sec=(await db.query("insert into sections(branch_id,name,area_sqm,length_meters,width_meters)values($1,'FICTIONAL',2250,450,5)returning id",[branch])).rows[0].id;
const catalog=(await db.query('select * from distress_types where astm_code is not null order by astm_code')).rows;
eq(catalog.length,20);eq(catalog[18].allowed_severities,'{medium,high}');
await reject(()=>db.query("update distress_types set default_unit_of_measure='m' where astm_code=1"),/immutable/);
await reject(()=>db.query("insert into distress_types(code,name,astm_code,astm_edition)values('fake','fake',1,'ASTM D6433-24')"),/migration/);
await reject(()=>db.query("select lakad_save_settings($1)",[{edition:'ASTM D6433-07',priority_safety:true,priority_area:true}]),/current_edition_fixed/);
await as('reviewer');
await db.query('select lakad_plan_samples($1,$2)',[sec,{total:10,required:2,inspector:ids.encoder,reviewer:ids.reviewer,start:'0',end:'450',rationale:'fictional'}]);
let units=(await db.query('select * from sample_units order by unit_number')).rows;
await reject(()=>db.query('update sections set area_sqm=2251 where id=$1',[sec]),/layout is locked|boundaries are immutable/);
await reject(()=>db.query('update sections set homogeneous_confirmed_by=null where id=$1',[sec]),/layout is locked|boundaries are immutable/);
await db.query("update sections set description='UPDATED LIVE DESCRIPTION' where id=$1",[sec]);checks++;
eq(units.length,2);eq(units[1].unit_number-units[0].unit_number,5,'Systematic interval, not arbitrary random subset');
const sample=units[0].id;
await as('viewer');await reject(()=>context(sample),/staff/);
await reject(()=>save({},{}),/permission denied/);
eq((await db.query('select * from provisional_section_calculations')).rows,[]);
await as('other');await reject(()=>context(sample),/assignment/);
await as('encoder');await action(sample,'start');
await reject(()=>action(sample,'save',{surveyed_at:'2026-01-01',area_sqm:null}),/Measured/);
await action(sample,'save',{surveyed_at:'2026-01-01',area_sqm:225,no_distress_confirmed:true,orientation_note:'north-facing; sketch in notes',field_rules_confirmed:false});
await reject(()=>action(sample,'submit'),/field-rule/);
await action(sample,'save',{surveyed_at:'2026-01-01',area_sqm:225,no_distress_confirmed:true,orientation_note:'north-facing; sketch in notes',field_rules_confirmed:true});
const type=catalog.find(t=>t.astm_code===13);
await action(sample,'distress',{distress_type_id:type.id,severity:'medium',quantity:2.3,potholes:{small_count:1,large_holes:[{diameter_mm:900,depth_mm:25,area_sqm:0.65}]}});
await reject(()=>action(sample,'distress',{distress_type_id:catalog[18].id,severity:'low',quantity:1}),/severity/);
await action(sample,'submit');
let ctx=await context(sample);
eq(ctx.edition,'ASTM D6433-24');eq(ctx.input.report_context.distress_catalog[type.id].astm_code,13);
eq(ctx.input.report_context.surveyor_name,'encoder','Surveyor name frozen internally at submission');
const originalInput=structuredClone(ctx.input);
const fictionalReader={id:'FICTIONAL-NOT-ASTM',digest:'f'.repeat(64),deduct:()=>10.12345,corrected:t=>t/2};
let output=calculateSample(sampleFromSnapshot(ctx.input,ctx.edition),fictionalReader);
await reject(()=>save(ctx,output),/permission denied/);
await as('service');await save(ctx,output);
await reject(()=>save(ctx,output),/changed/);
await as('reviewer');await reject(()=>action(sample,'approve'),/provisional/);
await owner();
eq((await db.query('select verification from inspection_computations where id=$1',[ctx.id])).rows[0].verification,'pending');
await db.query("update distress_types set name='CHANGED LIVE NAME' where id=$1",[type.id]);
await db.query("update profiles set full_name='CHANGED LIVE INSPECTOR' where id=$1",[ids.encoder]);
eq((await db.query('select input_snapshot from inspection_computations where id=$1',[ctx.id])).rows[0].input_snapshot,originalInput,'Catalog and surveyor changes cannot change submitted input');
eq(calculateSample(sampleFromSnapshot(originalInput,ctx.edition),fictionalReader),output,'Same saved measurements yield same calculation');
// Test ONLY: a trusted validation fixture stands in for the future engineering gate.
// No such promotion function is supplied by this PR.
await db.query("update inspection_computations set verification='verified',output_snapshot=$2 where id=$1",[ctx.id,{...output,status:'validated',engineering_validation_id:'FICTIONAL-TEST-ONLY'}]);
await as('reviewer');await action(sample,'approve');await action(sample,'publish');
await as('viewer');
const published=(await db.query('select * from approved_results where id=$1',[ctx.id])).rows[0];
eq(published.report_snapshot.sample.area_sqm,225);
eq(published.report_snapshot.distresses[0].quantity,2.3);
eq(published.report_snapshot.distresses[0].name,type.name,'Approved display preserves submission catalog name');
await reject(()=>context(sec,'section'),/staff/);
// Return racing with a calculation invalidates its token.
const second=units[1].id;
await as('encoder');await action(second,'start');await action(second,'save',{surveyed_at:'2026-01-01',area_sqm:225,no_distress_confirmed:true,orientation_note:'north',field_rules_confirmed:true});await action(second,'submit');
const oldCtx=await context(second),zeroOutput=calculateSample(sampleFromSnapshot(oldCtx.input,oldCtx.edition));
await as('reviewer');await action(second,'return',{comments:'fictional return'});
await as('service');await reject(()=>save(oldCtx,zeroOutput),/pending|Submit|changed/);
await as('encoder');await action(second,'submit');const newCtx=await context(second);
await as('service');await reject(()=>save(oldCtx,zeroOutput),/changed/);await save(newCtx,zeroOutput);
await owner();await db.query("update inspection_computations set verification='verified',output_snapshot=$2 where id=$1",[newCtx.id,{...zeroOutput,status:'validated',engineering_validation_id:'FICTIONAL-TEST-ONLY'}]);
await as('reviewer');await action(second,'approve');
const sectionCtx=await context(sec,'section');
let sectionOutput=calculateSection(sectionCtx.input);
await as('encoder');await reject(()=>context(sec,'section'),/Reviewer/);
await as('service');await save(sectionCtx,sectionOutput,ids.reviewer);
await as('viewer');eq((await db.query('select * from provisional_section_calculations')).rows,[],'Provisional aggregation never exposed to Viewer');
await owner();await reject(()=>db.query("update provisional_section_calculations set output_snapshot='{}'"),/immutable/);
const savedSection=(await db.query('select * from provisional_section_calculations')).rows[0];
// A replacement changes current membership; the section CAS must reject old inputs.
await as('encoder');await action(second,'correct',{comments:'new engineering revision'});
await action(second,'submit');const replacementCtx=await context(second);
await owner();await db.query("update inspection_computations set verification='verified',reference_id='FICTIONAL',algorithm_version='FICTIONAL',output_snapshot=$2 where id=$1",[replacementCtx.id,{...zeroOutput,pci:50,status:'validated',engineering_validation_id:'FICTIONAL-TEST-ONLY'}]);
await as('reviewer');await action(second,'approve');
await as('service');await reject(()=>save(sectionCtx,sectionOutput,ids.reviewer),/cohort changed/);
await owner();eq((await db.query('select * from provisional_section_calculations')).rows[0].input_snapshot,savedSection.input_snapshot);
await as('reviewer');const currentCtx=await context(sec,'section');eq(currentCtx.input.samples.find(s=>s.id===second).computation_id,replacementCtx.id);
// Unusual random reclassification includes replacement, invalidates input/action token.
const sec2=(await db.query("insert into sections(branch_id,name,area_sqm,length_meters,width_meters)values($1,'FICTIONAL RECLASS',2250,450,5)returning id",[branch])).rows[0].id;
await db.query('select lakad_plan_samples($1,$2)',[sec2,{total:10,required:2,inspector:ids.encoder,reviewer:ids.reviewer,start:'0',end:'450',rationale:'fictional'}]);
const unusual=(await db.query('select * from sample_units where section_id=$1 order by id',[sec2])).rows[0];
await db.query('select lakad_replace_unusual_random($1,$2,$3,$4)',[unusual.id,unusual.input_revision,unusual.action_version,'FICTIONAL unusually bad unit']);
eq((await get(unusual.id)).sample_type,'additional');
eq((await db.query("select count(*)::int as n from sample_units where section_id=$1 and sample_type='random'",[sec2])).rows[0].n,2,'Replacement retains random cohort size');
await reject(()=>db.query('select lakad_replace_unusual_random($1,$2,$3,$4)',[unusual.id,unusual.input_revision,unusual.action_version,'stale']),/editable|changed/);

await as('reviewer');
for(const [area,allowed] of [[134.99,false],[135,true],[225,true],[315,true],[315.01,false]]) {
  await db.exec('begin');
  try {
    const id=(await db.query("insert into sections(branch_id,name,area_sqm,length_meters,width_meters)values($1,$2,$3,$3,1)returning id",[branch,'BOUNDARY '+area,area])).rows[0].id;
    const plan=()=>db.query('select lakad_plan_samples($1,$2)',[id,{total:1,required:1,inspector:ids.encoder,reviewer:ids.reviewer,start:'0',end:String(area),rationale:'FICTIONAL D24 BOUNDARY'}]);
    if(allowed) {await plan();checks++;} else await reject(plan,/135–315/);
  }finally {await db.exec('rollback');}
}
const replacementBefore=(await db.query('select report_snapshot from approved_results where id=$1',[replacementCtx.id])).rows[0].report_snapshot;
await as('encoder');await action(second,'correct',{comments:'FICTIONAL unusual-unit correction'});
const editable=await get(second);
await as('reviewer');
await db.query('select lakad_replace_unusual_random($1,$2,$3,$4)',[second,editable.input_revision,editable.action_version,'FICTIONAL correction classification']);
await reject(()=>context(sec,'section'),/Complete selected cohort/);
eq((await get(second)).current_approved_computation_id,replacementCtx.id,'Reclassification in new correction preserves previous current approval');
await owner();
eq((await db.query('select report_snapshot from approved_results where id=$1',[replacementCtx.id])).rows[0].report_snapshot,replacementBefore,'Classification correction cannot change previously approved snapshot');
eq((await db.query('select is_current from approved_results where id=$1',[replacementCtx.id])).rows[0].is_current,true);
await db.query('update profiles set is_active=false where id=$1',[ids.encoder]);
await as('service');await reject(()=>save(newCtx,zeroOutput),/staff/);
await owner();await db.query('update profiles set is_active=true where id=$1',[ids.encoder]);
// Even an accidentally permissive legacy Storage policy cannot reveal the private reference object.
await db.exec('create policy unsafe_test_storage_read on storage.objects for select to authenticated using(true)');
await db.query("insert into storage.objects(bucket_id,name)values('pci-reference-data','FICTIONAL-no-chart.json')");
for(const role of ['viewer','encoder','reviewer','admin']) {
  await as(role);eq((await db.query("select name from storage.objects where bucket_id='pci-reference-data'")).rows,[],role+' cannot download private curves');
}

// HTTP boundaries: real algorithm, injected I/O; hosted JWT/storage/bundling remain separate gates.
const target='11111111-1111-4111-8111-111111111111';
const request=(body,auth=true)=>new Request('https://fictional.test/calculate',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:JSON.stringify(body)});
let writes=0;
const api=handler({authenticate:async()=>ids.encoder,context:async()=>newCtx,reference:async()=>{throw new ReferenceUnavailable('missing private package');},save:async()=>{writes++;}});
eq((await api(request({kind:'sample',target},false))).status,401);
eq((await api(request({kind:'sample',target,output:{pci:99}}))).status,409,'Reject browser output injection');
eq((await api(request({kind:'sample',target}))).status,200,'Confirmed no-distress snapshot can calculate without references');
eq(writes,1);
const missing=handler({authenticate:async()=>ids.encoder,context:async()=>ctx,reference:async()=>{throw new ReferenceUnavailable('missing private package');},save:async()=>{writes++;}});
eq((await missing(request({kind:'sample',target}))).status,503);eq(writes,1,'Missing data never writes prototype output');
const viewerApi=handler({authenticate:async()=>ids.viewer,context:async()=>{throw new Error('Active staff required');},reference:async()=>fictionalReader,save:async()=>{writes++;}});
eq((await viewerApi(request({kind:'sample',target}))).status,403);eq(writes,1);
const staleApi=handler({authenticate:async()=>ids.encoder,context:async()=>newCtx,reference:async()=>fictionalReader,save:async()=>{throw new Error('Inspection changed');}});
eq((await staleApi(request({kind:'sample',target}))).status,409);
await db.close();
console.log('Passed '+checks+' D6433-24 database and HTTP boundary checks (fictional local fixtures).');
