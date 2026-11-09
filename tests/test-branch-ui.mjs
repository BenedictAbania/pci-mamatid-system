import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-branches' });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event'])
  globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { getByRole, queryByRole, getByLabelText, queryByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
const e = React.createElement;
function load(file, deps) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const context = { exports: {}, Error, require: name => name in deps ? deps[name] : require(name) };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
let role = 'reviewer';
let saveFailure = false;
let sectionSaveFailure = false;
let saves = [];
let sectionSaves = [];
let refreshes = 0;
const branch = { id: 'synthetic-branch', branch_code: 'SYN-B00', name: 'SYNTHETIC Road', description: 'SYNTHETIC municipal record', location: 'SYNTHETIC location', administrative_status: 'active' };
const section = { id: 'synthetic-section', branch_id: branch.id, name: 'SYNTHETIC Section', description: 'SYNTHETIC description', start_description: '0 m', end_description: '45 m', length_meters: 45, width_meters: 5, area_sqm: 225, pavement_design: 'SYNTHETIC 50 mm AC', construction_history: 'SYNTHETIC 2019 overlay', traffic_classification: 'SYNTHETIC local', pavement_condition: 'SYNTHETIC fair', latitude: null, longitude: null, notes: '', homogeneous_confirmed_by: null };
const data = { branches: [branch], sections: [section], results: [] };
const palette = { panel:'white', panelAlt:'white', border:'#ddd', blue:'#234', blueSoft:'#def', text:'#123', muted:'#456', red:'#a00', redSoft:'#fee' };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
const View = ({ children }) => e('div', null, children);
const Text = ({ children }) => e('span', null, children);
const Pressable = ({ children, onPress, accessibilityLabel }) => e('button', { onClick:onPress, 'aria-label':accessibilityLabel }, children);
const rn = { View, Text, Pressable, ScrollView:View, Modal:({visible,children}) => visible ? e('div', { role:'dialog' }, children) : null,
  StyleSheet:{ create: value => value }, useWindowDimensions:() => ({width:1024}) };
const shell = {
  useAdminPalette:() => palette,
  AdminShell:({ action, children, subtitle, title }) => e('main', null, e('h1',null,title), e('p',null,subtitle),action,children),
  AdminButton:({ label, onPress, disabled }) => e('button',{ onClick:onPress, disabled },label),
  AdminPanel:({ title, children }) => e('section',null,e('h2',null,title),children),
  AdminEmpty:({ message }) => e('p',null,message),
  AdminField:({ editable, label, value, onChangeText, multiline, placeholder }) => e('label',null,label,
    multiline ? e('textarea',{value,disabled:editable===false,onChange:event=>onChangeText(event.target.value),placeholder})
      : e('input',{value,disabled:editable===false,onChange:event=>onChangeText(event.target.value),placeholder})),
};
const deps = {
  'react-native':rn,
  '@expo/vector-icons':{ Feather:Icon, MaterialCommunityIcons:Icon },
  '@/components/workflow/pagination':{ PageControls:() => null },
  '@/lib/ui/design-system':load('src/lib/ui/design-system.ts'),
  '@/components/admin/admin-shell':shell,
  '@/components/road-network/section-plan':{ SectionPlan:({ section, onBack }) => e('section',{ 'aria-label':'Section plan' },e('h2',null,`Plan for ${section.name}`),e('button',{ onClick:onBack },'Back to branch')) },
  '@/lib/data/workflow-data':{ callWorkflow:async()=>{}, calculateProvisional:async()=>{}, loadSectionReport:async()=>null, loadSurveyRounds:async()=>null, publishSectionResult:async()=>{} },
  '@/components/summaries/section-report-modal':{ SectionReportModal:() => null },
  '@/components/summaries/sample-report-modal':{ SampleReportModal:() => null },
  '@/components/workflow/shared':{ Notice:({ children, error }) => e('p',{ role:error?'alert':undefined },children),
    useWorkflow:() => ({ data, error:'', loading:false, refresh:async()=>{refreshes++}, pagination:{}, referencesPagination:{} }) },
  '@/lib/data/admin-data':{ saveBranch:async values => { saves.push(values); if (saveFailure) throw Error('SYNTHETIC RLS denial'); return values.id ?? 'synthetic-new-branch'; },
    loadEncoderWorkload:async()=>({}),
    loadRoadNetworkCounts:async()=>({ branches:data.branches.length, sections:data.sections.length, sampleUnits:0 }),
    removeBranch:async()=>{}, saveSection:async values => { sectionSaves.push(values); if (sectionSaveFailure) throw Error('SYNTHETIC section RLS denial'); }, removeSection:async()=>{} },
  '@/lib/utils/admin-utils':{ confirmAction:async()=>false, formatNumber:value=>String(value ?? '—') },
  '@/providers/AuthProvider':{ useAuth:() => ({ role, user:{id:`synthetic-${role}`} }) },
};
const Screen = load('src/app/road-network.tsx',deps).default;
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host); const user = userEvent.setup({ document });
let checks = 0;
const check = (value, message) => { assert.ok(value,message); checks++ };
async function render(nextRole, key = nextRole) { role=nextRole; await React.act(async()=>root.render(e(Screen,{key}))); }
try {
  await render('reviewer');
  check(!!getByRole(host,'button',{name:'Add branch'}),'CE sees branch registration');
  check(!!getByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),'CE sees branch edit');
  check(!!getByRole(host,'button',{name:'Add road section to SYNTHETIC Road'}),'CE sees section registration');
  check(!!getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),'CE sees section edit');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Add branch'})));
  check(!!getByRole(host,'dialog'),'branch form opens for CE');
  check(getByLabelText(host,'Location').value === '','no invented municipality is prefilled');
  for (const label of ['Branch ID','Road Name','Classification','Length','Starts at','Ends at','Notes'])
    check(!!getByLabelText(host,label),`branch form has ${label}`);
  check(!queryByText(host,'Upload photo'),'branch form has no photo upload');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save branch'})));
  check(!!queryByRole(host,'alert'),'missing branch name is explained');
  await React.act(async()=>user.type(getByLabelText(host,'Road Name'),'SYNTHETIC Mamatid Road'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save branch'})));
  check(getByRole(host,'alert').textContent.includes('Branch ID'),'missing branch ID is explained');
  await React.act(async()=>user.type(getByLabelText(host,'Branch ID'),'SYN-B01'));
  await React.act(async()=>user.type(getByLabelText(host,'Length'),'-5'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save branch'})));
  check(getByRole(host,'alert').textContent.includes('positive'),'invalid length is explained');
  await React.act(async()=>user.clear(getByLabelText(host,'Length')));
  await React.act(async()=>user.type(getByLabelText(host,'Length'),'350'));
  await React.act(async()=>user.type(getByLabelText(host,'Notes'),'SYNTHETIC source citation'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save branch'})));
  check(saves.at(-1).name === 'SYNTHETIC Mamatid Road' && saves.at(-1).branch_code === 'SYN-B01' && saves.at(-1).length_meters === '350' && saves.at(-1).notes === 'SYNTHETIC source citation',
    'CE submits entered branch and source without fabricated measurements');
  check(refreshes === 1 && !!queryByText(host,'Road branch created successfully.'),'successful save refreshes and confirms');

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'})));
  check(getByLabelText(host,'Road Name').value === branch.name,'edit form loads existing branch');
  saveFailure=true;
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save branch'})));
  check(!!getByRole(host,'alert') && getByRole(host,'alert').textContent.includes('RLS denial'),
    'failed save stays open with server error');
  check(refreshes === 1,'failed save does not claim refreshed data');
  saveFailure=false;

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Add road section to SYNTHETIC Road'})));
  check(!!getByRole(host,'dialog'),'section form opens for CE');
  check(!queryByText(host,'Upload photo') && !!queryByText(host,'What makes this section different'),'section form matches the design without photo upload');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save section'})));
  check(getByRole(host,'alert').textContent.includes('Section ID or name') && getByRole(host,'alert').textContent.includes('Pavement condition'),
    'missing required section fields are listed');
  await React.act(async()=>user.type(getByLabelText(host,'Section ID or name'),'SYNTHETIC New Section'));
  await React.act(async()=>user.type(getByLabelText(host,'Length (m)'),'45'));
  await React.act(async()=>user.type(getByLabelText(host,'Width (m)'),'5'));
  check(getByLabelText(host,'Area (As)').value === '225','area follows length × width');
  await React.act(async()=>user.type(getByLabelText(host,'Pavement design'),'SYNTHETIC design'));
  await React.act(async()=>user.type(getByLabelText(host,'Construction history'),'SYNTHETIC history'));
  await React.act(async()=>user.type(getByLabelText(host,'Traffic classification'),'SYNTHETIC traffic'));
  await React.act(async()=>user.type(getByLabelText(host,'Pavement condition'),'SYNTHETIC condition'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save section'})));
  check(sectionSaves.at(-1).name === 'SYNTHETIC New Section' && sectionSaves.at(-1).branch_id === branch.id
    && sectionSaves.at(-1).area_sqm === '225' && sectionSaves.at(-1).pavement_condition === 'SYNTHETIC condition',
    'CE submits section details under the selected branch');
  check(refreshes === 2 && !!queryByText(host,'Road section created successfully.'),
    'successful section save refreshes and confirms');

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'})));
  check(getByLabelText(host,'Section ID or name').value === section.name && getByLabelText(host,'Pavement design').value === section.pavement_design,'section edit loads existing values');
  sectionSaveFailure=true;
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save section'})));
  check(getByRole(host,'alert').textContent.includes('section RLS denial'),
    'failed section save stays open with server error');
  check(refreshes === 2,'failed section save does not claim refreshed data');
  sectionSaveFailure=false;

  section.homogeneous_confirmed_by='synthetic-reviewer';
  await render('reviewer','reviewer-locked');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'})));
  check(getByLabelText(host,'Length (m)').disabled && getByLabelText(host,'Area (As)').disabled && !getByLabelText(host,'Notes').disabled,
    'confirmed section locks geometry but leaves notes editable');
  section.homogeneous_confirmed_by=null;

  await render('reviewer','reviewer-open-section');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Open section SYNTHETIC Section'})));
  check(!!queryByText(host,'Plan for SYNTHETIC Section') && !!getByRole(host,'button',{name:'Assign Encoder'}),
    'clicking a section opens its sampling plan with Assign Encoder');
  check(!queryByText(host,'Road Sample Unit'),'section view replaces the network totals');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Back to branch'})));
  check(!!getByRole(host,'button',{name:'Open section SYNTHETIC Section'}),'back returns to the branch');

  const savedBranches = data.branches, savedSections = data.sections;
  const emptyBranch = { ...branch, id: 'synthetic-empty-branch', name: 'SYNTHETIC Empty Road' };
  data.branches = [branch, emptyBranch];
  await render('reviewer','reviewer-select');
  check(!!getByRole(host,'button',{name:'Open branch SYNTHETIC Road'}),'branch list shows each branch');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Open branch SYNTHETIC Empty Road'})));
  check(!!queryByText(host,'No sections yet') && !!getByRole(host,'button',{name:'Edit road branch SYNTHETIC Empty Road'}),
    'selecting a branch without sections shows its empty section state');
  check(!queryByText(host,'SYNTHETIC Section'),'sections of other branches are hidden');
  data.branches = []; data.sections = [];
  await render('reviewer','reviewer-empty');
  check(!!queryByText(host,'No branches yet'),'empty network explains branches');
  check(!!getByRole(host,'button',{name:'Add your first branch'}),'empty network offers the first branch');
  check(!!queryByText(host,'Road Sample Unit'),'sample unit total is shown');
  data.branches = savedBranches; data.sections = savedSections;

  await render('admin');
  check(!queryByRole(host,'button',{name:'Add road section to SYNTHETIC Road'}),'Admin has no section creation action');
  check(!queryByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),'Admin has no section edit action');
  check(!queryByRole(host,'button',{name:'Add branch'}),'Admin has no branch creation action');
  check(!queryByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),'Admin has no branch edit action');
  for (const deniedRole of ['encoder','viewer']) {
    await render(deniedRole);
    check(!queryByRole(host,'button',{name:'Add branch'}),`${deniedRole} has no branch creation action`);
    check(!queryByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),`${deniedRole} has no branch edit action`);
    check(!queryByRole(host,'button',{name:'Add road section to SYNTHETIC Road'}),`${deniedRole} has no section creation action`);
    check(!queryByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),`${deniedRole} has no section edit action`);
  }
  console.log(`Passed ${checks} isolated branch UI checks with synthetic data.`);
} finally {
  await React.act(async()=>root.unmount()); host.remove(); dom.window.close();
}
