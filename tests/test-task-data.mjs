import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
let role = 'encoder', calls = [], rpcError = null;
const all = Array.from({length:65},(_,i)=>({id:id(i+1),section_id:id(100),workflow_state:i===60?'returned':'draft',assigned_to:id(200),reviewer_id:id(201),unit_number:i+1}));
all.push({ ...all[0], id:id(90), assigned_to:id(202) });
const client = {
  from(table) {
    const call = {table,filters:[]}; calls.push(call);
    const q = {
      select(columns) { call.columns=columns;return q; }, order() {return q;}, limit(n) {call.limit=n;return q;},
      eq(k,v) {call.filters.push(['eq',k,v]);return q;}, neq(k,v) {call.filters.push(['neq',k,v]);return q;}, gt(k,v) {call.filters.push(['gt',k,v]);return q;}, in(k,v) {call.filters.push(['in',k,v]);return q;},
      then(resolve,reject) {
        let data=table==='sample_units'?all:table==='lakad_settings'?[{active_edition:'ASTM D6433-07'}]:table==='sections'?[{id:id(100),branch_id:id(101),name:'SYNTHETIC section'}]:table==='branches'?[{id:id(101),name:'SYNTHETIC road'}]:[];
        for(const [op,k,v] of call.filters)data=data.filter(row=>op==='eq'?row[k]===v:op==='neq'?row[k]!==v:op==='gt'?row[k]>v:v.includes(row[k]));
        return Promise.resolve({data:data.slice(0,call.limit),error:null}).then(resolve,reject);
      },
    };return q;
  },
  async rpc(name,args) {calls.push({rpc:name,args});return {error:rpcError,data:name==='lakad_session_access'?{role,is_active:true}:[]};},
};
const code=ts.transpileModule(fs.readFileSync('src/lib/data/workflow-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const c={exports:{},require:n=>{if(n==='./supabase')return{ supabase:client };throw Error(n);}};
vm.runInNewContext(code,c);const {loadWorkflow,workflowAction}=c.exports;
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
const page=await loadWorkflow('samples',null,id(61),undefined,null,'draft',id(200));
check(page.samples.length===51,'Full bounded page plus selected task only');
check(page.samples.some(s=>s.id===id(61)),'Task links resolve outside the first page');
check(page.pageLastId===id(50),'Selected task cannot move register cursor');
check(page.hasNext===true,'Bounded register retains pagination');
check(page.samples.every(s=>s.assigned_to===id(200)),'Other inspectors remain outside explicit query scope');
const queries=calls.filter(c=>c.table==='sample_units');
check(queries[0].limit===50 && queries[0].filters.some(f=>f[1]==='workflow_state'&&f[2]==='draft'),'Status filter is applied by the data query before pagination');
check(queries[1].limit===1 && queries[1].filters.some(f=>f[1]==='assigned_to'),'Direct task query remains bounded and assigned');
check(calls.filter(c=>c.table).every(c=>Number.isFinite(c.limit)),'All workflow reads bounded');
calls=[];role='reviewer';await loadWorkflow('samples',null,undefined,undefined,null,'submitted',id(201));
const review=calls.find(c=>c.table==='sample_units');
check(review.filters.some(f=>f[1]==='reviewer_id'&&f[2]===id(201)),'Reviewer assignments explicit');
check(review.filters.some(f=>f[0]==='neq'&&f[1]==='assigned_to'&&f[2]===id(201)),'Self review excluded before pagination');
check(review.filters.some(f=>f[1]==='workflow_state'&&f[2]==='submitted'),'Submitted queue queried across full scope');
role='encoder';await assert.rejects(()=>loadWorkflow('samples',null,'tampered',undefined,null,undefined,id(200)),/Invalid sample link/);checks++;
await assert.rejects(()=>loadWorkflow('samples',null,undefined,undefined,null,'invented',id(200)),/supported inspection status/);checks++;
role='viewer';calls=[];await assert.rejects(()=>loadWorkflow('samples'),/active staff/);checks++;
check(!calls.some(c=>c.table==='sample_units'),'Viewer cannot enter mutable sample query');
calls=[];await workflowAction({...all[0],input_revision:4,action_version:17},'return',{comments:'SYNTHETIC'});
check(calls[0].args.payload.revision===4&&calls[0].args.payload.version===17,'UI service still sends both optimistic concurrency tokens');
rpcError={message:'SYNTHETIC outdated revision'};await assert.rejects(()=>workflowAction({...all[0],input_revision:4,action_version:17},'approve'),/outdated revision/);checks++;
console.log(JSON.stringify({checks,scope:'Local SDK query-contract execution; assignment, pagination, direct task IDs, status filters, and revision tokens. Does not establish hosted RLS.'}));
