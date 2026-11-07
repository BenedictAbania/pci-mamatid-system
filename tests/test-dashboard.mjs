import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const evidence = process.argv.find(x => x.startsWith('--evidence='))?.slice(11);
if (evidence) { assert(evidence.startsWith('private-astm/')); fs.mkdirSync(evidence, { recursive: true }); }
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : require(n) };
  vm.runInNewContext(code, context, { filename: file }); return context.exports;
}
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const cases = [];
const userId = '00000000-0000-4000-8000-000000000001';
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
let failure = null, noCount = false, calls = [];
const mock = {
  from(table) {
    const call = { table, filters: [], orders: [] }; calls.push(call);
    const q = {
      select(columns, opts) { call.columns = columns; call.head = opts?.head; call.exact = opts?.count; return q; },
      neq(k,v) {call.filters.push(['neq',k,v]);return q;}, eq(k,v) {call.filters.push(['eq',k,v]);return q;}, is(k,v) {call.filters.push(['is',k,v]);return q;},
      not(k,op,v) {call.filters.push(['not',k,op,v]);return q;}, in(k,v) {call.filters.push(['in',k,v]);return q;},
      gt(k,v) {call.filters.push(['gt',k,v]);return q;}, order(k,opts) {call.orders.push([k,opts]);return q;},
      limit(v) {call.limit=v;return q;},
      then(resolve,reject) {
        let result = { error: null, data: [], count: null };
        if (failure?.table === table) result.error = failure.error;
        else if (call.head) {
          const state = call.filters.find(x => x[1] === 'workflow_state')?.[2];
          const byState = { planned:100,draft:10,submitted:6,returned:3,approved:4,published:2 };
          result.count = noCount ? null : state ? byState[state] : table === 'sample_units' ? 125 : table === 'sections' ? 91 : table === 'profiles' ? 4 : table === 'inspection_computations' ? 10 : call.filters.some(x => x[1] === 'is_current') ? 107 : 110;
        } else if (table === 'sample_units') {
          const after = call.filters.find(x => x[0] === 'gt')?.[2];
          result.data = Array.from({length:9}, (_,i)=>({id:id(i+2),section_id:id(20+i),unit_number:i+1,workflow_state:'draft',input_revision:2,updated_at:'2026-10-01T00:00:00Z'})).filter(x=>!after || x.id>after).slice(0,call.limit);
        } else if (table === 'sections') result.data = call.filters.find(x=>x[0]==='in')[2].map(id=>({id,name:'SYNTHETIC joined '+id}));
        return Promise.resolve(result).then(resolve,reject);
      },
    }; return q;
  },
  async rpc(name,args) { calls.push({rpc:name,args}); return {error:null,data:name==='lakad_report_summary'?{count:107,average:51.25}:[]}; },
};
const {loadDashboardData,loadDashboardRegister,resource,DASHBOARD_PAGE_SIZE} = load('src/lib/data/dashboard.ts',{'./supabase':{supabase:mock}});
for(const role of ['admin','reviewer','encoder','viewer']) {
  calls=[];const data=await loadDashboardData(role,userId);
  if(role==='viewer') {
    check(data.work.status==='unavailable','Viewer work remains unavailable');
    check(calls.every(c=>c.rpc||c.table==='approved_results'),'Viewer never queries mutable/private tables');
    for(const c of calls.filter(c=>c.table)) check(c.filters.some(x=>x[0]==='not'&&x[1]==='published_at'),'Every Viewer result query has explicit publication filter');
    check(data.results.data.count===107 && data.results.data.history===110,'Full published summary, not three-row preview');
  } else {
    check(data.work.status==='ready','Staff work ready');check(data.work.data.samples===125,'Sample count covers beyond register page');
    check(data.work.data.states.planned===100&&data.work.data.states.submitted===6,'Full workflow state counts');
    if(role!=='admin') for(const c of calls.filter(c=>c.table==='sample_units')) check(c.filters.some(x=>x[1]===(role==='encoder'?'assigned_to':'reviewer_id')&&x[2]===userId),'Staff summary carries explicit assignment filter');
    check(role==='admin'||!calls.some(c=>c.table==='profiles'),'Non-admin has no account query');
    if(role==='encoder') check(data.results.status==='unavailable' && !calls.some(c=>c.rpc||c.table==='approved_results'),'Encoder does not query reports');
    if(role==='admin') check(data.results.status==='unavailable' && !calls.some(c=>c.rpc||c.table==='approved_results'),'Admin home does not query reports');
    if(role==='admin') check(Number.isInteger(data.work.data.activeAccounts) && ['admin','reviewer','encoder','viewer'].every(r=>Number.isInteger(data.work.data.roles[r])),'Admin home has active and per-role account totals');
    if(role!=='admin') check(data.work.data.activeAccounts===null && data.work.data.roles===null,'Non-admin has no account totals');
  }
  check(calls.filter(c=>c.table&&c.head).every(c=>c.exact==='exact'&&!c.limit),'All totals are exact/head, not client pages');
  check(calls.filter(c=>c.table&&!c.head).every(c=>c.limit===3),'Summary previews bounded to three');
  if(role==='reviewer'||role==='viewer') check(calls.some(c=>c.rpc==='lakad_section_reports'&&c.args.page_size===3),'Authorized priorities use bounded eligible server ranking');
  cases.push({role,scenario:'Authorized summary query contract',status:'PASS'});
}
for(const role of ['admin','encoder','reviewer']) {
  calls=[];const first=await loadDashboardRegister(role,userId);
  check(first.rows.length===8 && first.next===id(9),'Register reads one lookahead and retains eight rows');
  check(first.rows[7].section_name.includes(id(27)),'Register resolves actual page section beyond unrelated inventory preview');
  check(calls[0].limit===DASHBOARD_PAGE_SIZE+1 && calls[1].limit===DASHBOARD_PAGE_SIZE,'Register and joined labels bounded');
  if(role!=='admin') check(calls[0].filters.some(x=>x[1]===(role==='encoder'?'assigned_to':'reviewer_id')),'Register carries assignment filter');
  const second=await loadDashboardRegister(role,userId,first.next);
  check(second.rows.length===1 && second.next===null,'Stable cursor continues without duplicates');
  check(!second.rows.some(x=>first.rows.some(y=>y.id===x.id)),'Page IDs disjoint');
}
calls=[];await assert.rejects(()=>loadDashboardRegister('viewer',userId));checks++;check(calls.length===0,'Viewer register rejects before a backend query');
await assert.rejects(()=>loadDashboardRegister('admin',userId,'tampered,or'));checks++;check(calls.length===0,'Malformed cursor rejects before query');
for(const code of ['42P01','42703','42883','PGRST202','PGRST205']) {const r=await resource(()=>Promise.reject(Object.assign(new Error('PRIVATE details'),{code})));check(r.status==='unavailable'&&!r.message.includes('PRIVATE'),'Missing prerequisite classified, redacted');}
check((await resource(()=>Promise.reject(new Error('network')))).status==='error','Transport failure is error, not empty');
noCount=true;check((await loadDashboardData('admin',userId)).work.status==='error','Missing exact count never becomes zero');noCount=false;
failure={table:'sample_units',error:{code:'503',message:'PRIVATE failure'}};
const partial=await loadDashboardData('reviewer',userId);check(partial.work.status==='error'&&partial.results.status==='ready','Independent authorized result group survives work failure');failure=null;
const {accountDisplayName}=load('src/lib/auth/account-display.ts');
check(accountDisplayName('  SYNTHETIC User  ','x@example.test')==='SYNTHETIC User','Real account name trimmed');
check(accountDisplayName(17,'synthetic@example.test')==='synthetic','Malformed metadata has email fallback');
const {createPalette,dashboardLayout}=load('src/lib/ui/design-system.ts');
const luminance=h=>{const a=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
for(const dark of [false,true]) {
  const p=createPalette(dark);
  for(const surface of ['background','panel','panelAlt','input','blueSoft','amberSoft']) for(const text of ['text','muted']) check(contrast(p[text],p[surface])>=4.5,`${dark?'dark':'light'} ${text}/${surface} contrast`);
  for(const color of ['blue','amber','green','red','teal']) check(contrast(p[color],p[color+'Soft'])>=4.5,'Status label contrast '+color);
  check(contrast('#FFFFFF',p.action)>=4.5,'White action text contrast');
}
for(const [width,columns,two] of [[1672,4,true],[1366,4,true],[1180,2,true],[1024,2,false],[820,2,false],[650,2,false],[390,2,false],[320,2,false]]) {
  const d=dashboardLayout(width);check(d.metricColumns===columns&&d.twoColumns===two,'Responsive branch '+width);
}
const result={checks,cases,scope:'Local synthetic query-contract, identity, token contrast and responsive-branch checks. No hosted access or visual geometry proof.'};
if(evidence)fs.writeFileSync(evidence+'/dashboard-unit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
