import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require=createRequire(import.meta.url);
const evidence=process.argv.find(x=>x.startsWith('--evidence='))?.slice(11);
if(evidence){assert(evidence.startsWith('private-astm/'));fs.mkdirSync(evidence,{recursive:true});}
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/synthetic-dashboard-test',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Element','ShadowRoot','Node','MutationObserver','Event','KeyboardEvent'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};dom.window.ResizeObserver=globalThis.ResizeObserver;
const React=require('react'),{createRoot}=require('react-dom/client'),native=require('react-native-web'),e=React.createElement;
const {getByRole,getAllByRole,getByText,queryByText,queryAllByText,getByLabelText,queryByLabelText,queryByRole}=require('@testing-library/dom');
const userEvent=require('@testing-library/user-event').default;
function load(file,deps={}){
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const c={exports:{},require:n=>n in deps?deps[n]:/\.png$|\.jpg$/.test(n)?'synthetic-asset':require(n),HTMLElement,document};
  vm.runInNewContext(code,c,{filename:file});return c.exports;
}
const access=load('src/lib/auth/access.ts'),tokens=load('src/lib/ui/design-system.ts'),identity=load('src/lib/auth/account-display.ts');
let role='admin',userId='synthetic-session-a',width=1672,dark=false,paths=[],signedOut=0,reply,pages=[],calls=[],resolveOld;
const Icon=()=>e('span',{'aria-hidden':true});Icon.glyphMap={};
const icons={Feather:Icon,MaterialCommunityIcons:Icon};
const themes={useAppTheme:()=>({colorScheme:dark?'dark':'light',toggleColorScheme(){dark=!dark;}})};
const auth={useAuth:()=>({role,user:{id:userId,email:'synthetic@example.test'},profile:{full_name:'SYNTHETIC Test User'}})};
const rn={...native,useWindowDimensions:()=>({width,height:900,scale:1,fontScale:1})};
const shell=load('src/components/admin/admin-shell.tsx',{
  'react-native':rn,'@expo/vector-icons':icons,'expo-image':{Image:()=>e('span',{'aria-hidden':true})},'expo-router':{usePathname:()=>role==='admin'?'/dashboard':'/workspace',useRouter:()=>({push:p=>paths.push(p),navigate:p=>paths.push(p)})},
  '@/lib/data/supabase':{supabase:{auth:{signOut:async()=>{signedOut++;}}}},'@/providers/AuthProvider':auth,'@/providers/ThemeProvider':themes,'@/lib/auth/access':access,'@/lib/ui/design-system':tokens,'@/lib/auth/navigation': load('src/lib/auth/navigation.ts', { './access': load('src/lib/auth/access.ts') }), '@/lib/auth/account-display':identity,
});
const parts=load('src/components/dashboard/dashboard-parts.tsx',{'react-native':rn,'@expo/vector-icons':icons,'@/components/admin/admin-shell':shell,'@/lib/ui/design-system':tokens});
const approved=load('src/lib/data/approved-results.ts');
const data={
  loadDashboardData:async(r,u)=>{calls.push(['summary',r,u]);if(reply==='deferred')return new Promise(resolve=>{resolveOld=resolve;});return typeof reply==='function'?reply(r):reply;},
  loadDashboardRegister:async(r,u,after)=>{calls.push(['register',r,u,after]);return pages[after?1:0];},
  resource:async task=>{try{return{status:'ready',data:await task()};}catch{return{status:'error',message:'SYNTHETIC network failure. Retry the request.'};}},
};
const {RoleDashboard}=load('src/components/dashboard/role-dashboard.tsx',{
  'react-native':rn,'expo-router':{useRouter:()=>({push:p=>paths.push(p)})},'@/components/admin/admin-shell':shell,'@/lib/auth/access':access,
  '@/lib/utils/admin-utils':{formatDate:v=>v||'Not recorded'},'@/lib/data/approved-results':approved,'@/lib/ui/design-system':tokens,'@/lib/data/dashboard':data,
  '@/lib/pci/pci-classification':{getPciConditionCategory:()=>({rating:'SYNTHETIC fallback'})},
  '@/providers/AuthProvider':auth,'./dashboard-parts':parts,
});
const ready=data=>({status:'ready',data});
const work={sections:91,plansRequiringAttention:7,samples:125,accounts:4,pendingCalculations:2,states:{planned:100,draft:10,submitted:6,returned:3,approved:4,published:2}};
const makeRow=(id,current=true,published=true)=>({id,sample_unit_id:id,input_revision:2,is_current:current,superseded_at:current?null:'SYNTHETIC date',approved_at:'2026-10-01',published_at:published?'2026-10-02':null,report_snapshot:{road:{section_name:'SYNTHETIC frozen '+id,branch_name:'SYNTHETIC old road'},sample:{unit_number:3},output:{pci:60,condition:'SYNTHETIC saved condition'}}});
const current=makeRow('current'),superseded=makeRow('superseded',false),unpublished=makeRow('unpublished',true,false);
const emptyResults={count:0,average:null,published:0,history:0,rows:[],sections:[]};
const populated={count:107,average:51.25,published:107,history:110,rows:[current,superseded,unpublished],sections:[{id:'ranked',rank:1,road_snapshot:{section_name:'SYNTHETIC frozen priority',branch_name:'SYNTHETIC saved road'},pci:44,condition:'SYNTHETIC condition',published_at:'2026-10-02'}]};
const registerRow={id:'page-a',section_name:'SYNTHETIC section a',unit_number:1,input_revision:2,workflow_state:'returned',updated_at:'2026-10-01'};
pages=[{rows:[registerRow],next:'cursor-b'},{rows:[{...registerRow,id:'page-b',section_name:'SYNTHETIC section b'}],next:null}];
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};const results=[];
async function test(id,scenario,task){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);paths=[];calls=[];dark=false;userId='synthetic-session-a';
  const user=userEvent.setup({document});
  try{await task(host,root,user);results.push({id,scenario,status:'PASS'});}catch(error){results.push({id,scenario,status:'FAIL',actual:error.message});}
  finally{await React.act(async()=>root.unmount());host.remove();}
}
for(const r of ['admin','encoder','reviewer','viewer'])for(const w of [1672,820,390])for(const theme of ['light','dark']){
  await test(`${r}-${w}-${theme}`,'Actual React/RN Web role tree, responsive branch and authorized action delivery',async(host,root,user)=>{
    role=r;width=w;dark=theme==='dark';reply={work:r==='viewer'?{status:'unavailable',message:'Viewer scope'}:ready(work),results:r==='encoder'?{status:'unavailable',message:'Encoder role scope'}:ready(populated)};
    await React.act(async()=>root.render(e(RoleDashboard)));
    check(getByRole(host,'heading',{name:r==='viewer'?'Overview':'Home'}),'One page title');check(!queryByText(host,/Welcome back/),'No duplicate welcome heading');
    check(!queryByText(host,'DEMO DATA'),'No implicit demo banner');
    const print=document.getElementById('lakad-print-styles')?.textContent ?? '';
    check(print.includes('lakad-action')&&!print.includes('[role="button"]'),'Print hides controls without hiding report data rows');if(r!=='viewer')check(queryByText(host,'Provisional calculations'),'Provisional notice retained');
    check(getByLabelText(host,'SYNTHETIC Test User, '+access.roleLabels[r]),'Account identity from auth');
    if(w<980)await React.act(async()=>user.click(getByRole(host,'button',{name:'Open navigation'})));
    const nav=host.querySelector('[data-testid="lakad-navigation"]');
    const expected={admin:['Home','Roads','Results & Reports','Users','Settings'],reviewer:['Home','Sampling Plans','Inspections to Review','Results'],encoder:['Home','My Inspections'],viewer:['Overview','Published Results','Maintenance Priorities']}[r];
    check(expected.every(name=>queryByRole(nav,'button',{name,exact:true})),'Exact role navigation labels');
    check(r==='encoder'?!queryByText(host,'Maintenance priorities'):!!queryByText(host,'Maintenance priorities'),'Eligible roles have a dashboard priorities panel; Encoder does not');
    check(getAllByRole(nav,'button').length===expected.length+(w<980?2:1),'No duplicate or unauthorized navigation');
    if(w<980)await React.act(async()=>user.click(getByRole(host,'button',{name:'Close navigation'})));
    const buttons=getAllByRole(host,'button');
    const action=r==='admin'?'View roads':r==='encoder'?'Correct returned inspections':r==='reviewer'?'Review submitted inspections':'Browse published results';
    await React.act(async()=>user.click(getByRole(host,'button',{name:action,exact:true})));
    check(paths.length===1&&access.canAccess(r,paths[0].split('?')[0]),'Role action routes to an authorized live screen');
    check(buttons.every(b=>!/^approve$|^return$|^publish$/i.test(b.textContent)),'No engineering authority added by dashboard');
    if(r==='viewer'){check(!queryByText(host,'Inspection register'),'Viewer never renders work register');check(!queryByText(host,'SYNTHETIC frozen superseded')&&!queryByText(host,'SYNTHETIC frozen unpublished'),'Viewer display rejects superseded/unpublished preview rows');}
    if(r==='encoder')check(!queryByText(host,'SYNTHETIC frozen current'),'Encoder never renders approved result rows');
    if(evidence)fs.writeFileSync(`${evidence}/dom-${r}-${w}-${theme}.html`,host.outerHTML);
  });
}
await test('state-transitions','Initial failure, populated success, failed refresh clears totals, retry, empty and unavailable',async(host,root,user)=>{
  role='admin';width=1672;const failed={status:'error',message:'SYNTHETIC connection failure'};reply={work:failed,results:failed};
  await React.act(async()=>root.render(e(RoleDashboard)));
  check(getAllByRole(host,'alert').length>0,'Initial failure announced');check(!queryByText(host,'No current approved results yet'),'Failure is not successful empty');
  reply={work:ready(work),results:ready(populated)};await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(getByText(host,'91'),'Exact inventory total shown');check(getByText(host,'107'),'Approved summary shown');
  reply={work:failed,results:failed};await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(!queryByText(host,'91')&&!queryByText(host,'107'),'Failed refresh clears old metrics and summary');
  check(!queryByText(host,'No current approved results yet'),'Failed refresh has no false empty result');
  reply={work:ready(work),results:ready(emptyResults)};await React.act(async()=>user.click(getAllByRole(host,'button',{name:'Retry dashboard'})[0]));
  check(getByText(host,'0'),'Successful zero-result metric is distinct');
  check(getByText(host,'No eligible priorities yet'),'Successful empty ranking retains the dashboard container');
  reply={work:{status:'unavailable',message:'Missing prerequisite'},results:{status:'unavailable',message:'Missing prerequisite'}};await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(queryByText(host,'Tasks unavailable'),'Missing prerequisite is unavailable');check(!queryByText(host,'No current approved results yet'),'Prerequisite failure never pretends empty');
});
await test('pagination','Actual next/previous controls, bounded register and disabled last page',async(host,root,user)=>{
  role='encoder';width=820;reply={work:ready(work),results:{status:'unavailable',message:'Role scope'}};
  await React.act(async()=>root.render(e(RoleDashboard)));check(getByText(host,'SYNTHETIC section a'),'First page loaded');
  check(getByRole(host,'button',{name:'Previous inspections'}).getAttribute('aria-disabled')==='true','Previous disabled initially');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Next inspections'})));
  check(getByText(host,'SYNTHETIC section b')&&!queryByText(host,'SYNTHETIC section a'),'Next replaces page');
  check(getByRole(host,'button',{name:'Next inspections'}).getAttribute('aria-disabled')==='true','Final next disabled');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Previous inspections'})));check(getByText(host,'SYNTHETIC section a'),'Previous reloads cursor');
});
await test('keyboard','Mobile drawer focus containment, Escape restoration, theme and sign-out',async(host,root,user)=>{
  role='reviewer';width=390;reply={work:ready(work),results:ready(emptyResults)};
  await React.act(async()=>root.render(e(RoleDashboard)));
  const opener=getByRole(host,'button',{name:'Open navigation'});await React.act(async()=>user.click(opener));
  if(evidence)fs.writeFileSync(evidence+'/dom-mobile-drawer.html',host.outerHTML);
  check(document.activeElement===getByRole(host,'button',{name:'Close navigation'}),'Drawer focuses close');
  await React.act(async()=>user.tab({shift:true}));check(document.activeElement===getByRole(host,'button',{name:'Sign out'}),'Reverse Tab contained');
  await React.act(async()=>user.tab());check(document.activeElement===getByRole(host,'button',{name:'Close navigation'}),'Tab wraps to first');
  await React.act(async()=>user.keyboard('{Escape}'));check(!queryByRole(host,'button',{name:'Close navigation'})&&document.activeElement===opener,'Escape closes and restores opener focus');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Switch to dark mode'})));check(dark,'Theme callback delivered');
  await React.act(async()=>user.click(opener));await React.act(async()=>user.click(getByRole(host,'button',{name:'Sign out'})));check(signedOut>0,'Sign-out delivered to auth');
});
await test('session-race','Role change while previous session request is outstanding',async(host,root)=>{
  role='admin';width=1672;reply='deferred';await React.act(async()=>root.render(e(RoleDashboard)));const finishOld=resolveOld;
  check(getByLabelText(host,'Loading Road sections'),'Loading is explicit');
  role='viewer';userId='synthetic-session-b';reply={work:{status:'unavailable',message:'Viewer scope'},results:ready(emptyResults)};
  await React.act(async()=>root.render(e(RoleDashboard)));
  await React.act(async()=>finishOld({work:ready(work),results:ready(populated)}));
  check(getByText(host,'No published results yet')&&!queryByText(host,'91')&&!queryByText(host,'SYNTHETIC frozen current'),'Old identity cannot paint new role');
  check(!calls.some(c=>c[0]==='register'&&c[1]==='viewer'),'Viewer requests no raw register');
});
await test('refresh-race','Older refresh cannot overwrite latest successful refresh',async(host,root,user)=>{
  role='admin';width=1672;reply='deferred';await React.act(async()=>root.render(e(RoleDashboard)));const finishOld=resolveOld;
  reply={work:ready(work),results:ready(emptyResults)};await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  await React.act(async()=>finishOld({work:ready({...work,sections:777}),results:ready(populated)}));
  check(getByText(host,'91')&&!queryByText(host,'777')&&!queryByText(host,'107'),'Latest request wins');
});
await test('no-page-remount','The shared shell keeps loaded content mounted while refreshing',async(host,root,user)=>{
  role='admin';width=1672;
  const ShellProbe=({loading})=>e(shell.AdminShell,{title:'SYNTHETIC page',subtitle:'Refresh check',loading},e(native.Text,null,'SYNTHETIC persistent content'));
  await React.act(async()=>root.render(e(ShellProbe,{loading:false})));
  const content=getByText(host,'SYNTHETIC persistent content');
  await React.act(async()=>root.render(e(ShellProbe,{loading:true})));
  check(getByText(host,'SYNTHETIC persistent content')===content,'Previously loaded content node survives loading');
  check(getByText(host,'Updating this page…'),'Refreshing has an inline status');
  check(!queryByText(host,'Loading live data...'),'Refresh does not return to initial spinner');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Home'})));
  check(paths.length===0,'Active navigation does not navigate or remount');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Roads'})));
  check(paths[0]==='/road-network','Other navigation still works');
  await React.act(async()=>root.render(e(ShellProbe,{loading:false})));
  check(getByText(host,'SYNTHETIC persistent content')===content,'Content stays mounted after completion');
});
await test('overview-refresh','Dashboard retains loaded totals while a new request is pending',async(host,root,user)=>{
  role='admin';width=1672;reply={work:ready(work),results:ready(populated)};
  await React.act(async()=>root.render(e(RoleDashboard)));
  check(getByText(host,'91'),'Initial data loaded');
  reply='deferred';
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(getByText(host,'91'),'Previous total remains visible during pending refresh');
  check(getByText(host,'Updating overview…'),'Pending data is identified as updating');
  await React.act(async()=>resolveOld({work:ready({...work,sections:92}),results:ready(populated)}));
  check(getByText(host,'92')&&!queryByText(host,'Updating overview…'),'Completed refresh replaces total without remount');
});
await test('access-recheck','Resolved role keeps the route mounted during a session access recheck',async(host,root)=>{
  let authState={session:{user:{id:'SYNTHETIC-user'}},role:'admin',isLoading:true,error:'',refreshProfile:async()=>{}};
  const Stack=({children})=>e('div',{'data-testid':'authenticated-stack'},children);
  Stack.Screen=()=>null;
  const passthrough=({children})=>children;
  const Root=load('src/app/_layout.tsx',{
    'expo-router':{DarkTheme:{},DefaultTheme:{},ThemeProvider:passthrough,Stack,usePathname:()=>'/dashboard',useRouter:()=>({replace(){}})},
    'expo-splash-screen':{preventAutoHideAsync(){}},'react-native':rn,
    'react-native-safe-area-context':{SafeAreaProvider:passthrough,SafeAreaView:passthrough},
    '@/components/animated-icon':{AnimatedSplashOverlay:()=>null},'@/lib/auth/access':access,
    '@/lib/data/supabase':{supabase:{auth:{signOut:async()=>{}}}},
    '@/providers/AuthProvider':{AuthProvider:passthrough,useAuth:()=>authState},
    '@/providers/ThemeProvider':{AppThemeProvider:passthrough,useAppTheme:()=>({colorScheme:'light'})},
  }).default;
  await React.act(async()=>root.render(e(Root)));
  const stack=host.querySelector('[data-testid="authenticated-stack"]');
  check(stack,'Known role retains its authenticated route during recheck');
  authState={...authState,isLoading:false};
  await React.act(async()=>root.render(e(Root)));
  check(host.querySelector('[data-testid="authenticated-stack"]')===stack,'Access recheck completion does not remount route');
  authState={...authState,role:null,isLoading:true};
  await React.act(async()=>root.render(e(Root)));
  check(!host.querySelector('[data-testid="authenticated-stack"]'),'Unknown role remains blocked while access loads');
});
for(const r of ['admin','encoder','reviewer','viewer'])await test(`${r}-resource-states`,'Each role: loading, empty, failure, prerequisite unavailable and retry',async(host,root,user)=>{
  role=r;width=390;reply='deferred';await React.act(async()=>root.render(e(RoleDashboard)));const finishOld=resolveOld;
  const metric=r==='admin'?'Road sections':r==='reviewer'?'Plans needing attention':r==='encoder'?'Assigned inspections':'Published results';
  check(getByLabelText(host,'Loading '+metric),'Role-specific loading metric');
  const none={...work,sections:0,plansRequiringAttention:0,samples:0,accounts:r==='admin'?0:null,pendingCalculations:0,states:{planned:0,draft:0,submitted:0,returned:0,approved:0,published:0}};
  const loaded={work:r==='viewer'?{status:'unavailable',message:'Viewer scope'}:ready(none),results:r==='encoder'?{status:'unavailable',message:'Encoder scope'}:ready(emptyResults)};
  reply=loaded;await React.act(async()=>finishOld(loaded));
  check(!queryByLabelText(host,'Loading '+metric),'Successful zero metric leaves loading');
  if(r==='viewer')check(getByText(host,'No published results yet'),'Viewer successful empty');
  else check(getByText(host,/No assignments yet|No review assignments yet|No inspections have been planned yet/),'Staff successful empty');
  const fail={status:'error',message:'SYNTHETIC network failure'};reply={work:r==='viewer'?loaded.work:fail,results:r==='encoder'?loaded.results:fail};
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(getAllByRole(host,'alert').length>0,'Role failure announced');
  check(!queryByText(host,'No published results yet')&&!queryByText(host,/No assignments yet|No review assignments yet|No inspections have been planned yet/),'Role failure is not successful zero');
  const missing={status:'unavailable',message:'SYNTHETIC missing prerequisite'};reply={work:r==='viewer'?loaded.work:missing,results:r==='encoder'?loaded.results:missing};
  await React.act(async()=>user.click(getAllByRole(host,'button',{name:'Retry dashboard'})[0]));
  check(queryAllByText(host,/SYNTHETIC missing prerequisite/).length>0,'Missing prerequisite remains distinct');
  reply=loaded;await React.act(async()=>user.click(getByRole(host,'button',{name:'Refresh data'})));
  check(queryAllByText(host,/SYNTHETIC missing prerequisite/).length===0,'Successful retry clears prerequisite message');
});
const result={checks,results,scope:'Actual React/RN Web markup and effect/event execution in JSDOM with explicitly synthetic API data. Icons/images stubbed. Not visual browser, screen-reader or physical-device validation.'};
if(evidence)fs.writeFileSync(evidence+'/dashboard-dom.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
dom.window.close();if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
