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
const branch = { id: 'synthetic-branch', name: 'SYNTHETIC Road', description: 'SYNTHETIC municipal record', location: 'SYNTHETIC location', administrative_status: 'active' };
const section = { id: 'synthetic-section', branch_id: branch.id, name: 'SYNTHETIC Section', description: 'SYNTHETIC description', start_description: '0 m', end_description: '45 m', length_meters: 45, width_meters: 5, latitude: null, longitude: null, notes: '', homogeneous_confirmed_by: null };
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
  '@expo/vector-icons':{ Feather:Icon },
  '@/components/workflow/pagination':{ PageControls:() => null },
  '@/components/admin/admin-shell':shell,
  '@/components/workflow/shared':{ Notice:({ children, error }) => e('p',{ role:error?'alert':undefined },children),
    useWorkflow:() => ({ data, error:'', loading:false, refresh:async()=>{refreshes++}, pagination:{}, referencesPagination:{} }) },
  '@/lib/data/admin-data':{ saveBranch:async values => { saves.push(values); if (saveFailure) throw Error('SYNTHETIC RLS denial'); },
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
  check(!!getByRole(host,'button',{name:'Add road branch'}),'CE sees branch registration');
  check(!!getByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),'CE sees branch edit');
  check(!!getByRole(host,'button',{name:'Add road section'}),'CE sees section registration');
  check(!!getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),'CE sees section edit');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Add road branch'})));
  check(!!getByRole(host,'dialog'),'branch form opens for CE');
  check(getByLabelText(host,'Barangay / location').value === '','no invented municipality is prefilled');
  check(!!getByLabelText(host,'Description and verified source record'),'source reference has a visible label');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(!!queryByRole(host,'alert'),'missing branch name is explained');
  await React.act(async()=>user.type(getByLabelText(host,'Branch name'),'SYNTHETIC Mamatid Road'));
  await React.act(async()=>user.type(getByLabelText(host,'Description and verified source record'),'SYNTHETIC source citation'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(saves.at(-1).name === 'SYNTHETIC Mamatid Road' && saves.at(-1).description === 'SYNTHETIC source citation',
    'CE submits entered branch and source without fabricated measurements');
  check(refreshes === 1 && !!queryByText(host,'Road branch created successfully.'),'successful save refreshes and confirms');

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'})));
  check(getByLabelText(host,'Branch name').value === branch.name,'edit form loads existing branch');
  saveFailure=true;
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(!!getByRole(host,'alert') && getByRole(host,'alert').textContent.includes('RLS denial'),
    'failed save stays open with server error');
  check(refreshes === 1,'failed save does not claim refreshed data');
  saveFailure=false;

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Add road section'})));
  check(!!getByRole(host,'dialog'),'section form opens for CE');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(getByRole(host,'alert').textContent.includes('section name'), 'missing section name is explained');
  await React.act(async()=>user.type(getByLabelText(host,'Section code and name'),'SYNTHETIC New Section'));
  await React.act(async()=>user.type(getByLabelText(host,'Length (meters)'),'45'));
  await React.act(async()=>user.type(getByLabelText(host,'Width (meters)'),'5'));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(sectionSaves.at(-1).name === 'SYNTHETIC New Section' && sectionSaves.at(-1).branch_id === branch.id,
    'CE submits section details under the selected branch');
  check(refreshes === 2 && !!queryByText(host,'Road section created successfully.'),
    'successful section save refreshes and confirms');

  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'})));
  check(getByLabelText(host,'Section code and name').value === section.name,'section edit loads existing values');
  sectionSaveFailure=true;
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Save'})));
  check(getByRole(host,'alert').textContent.includes('section RLS denial'),
    'failed section save stays open with server error');
  check(refreshes === 2,'failed section save does not claim refreshed data');
  sectionSaveFailure=false;

  section.homogeneous_confirmed_by='synthetic-reviewer';
  await render('reviewer','reviewer-locked');
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Edit road section SYNTHETIC Section'})));
  check(getByLabelText(host,'Length (meters)').disabled && !getByLabelText(host,'Description').disabled,
    'confirmed section locks geometry but leaves description editable');
  section.homogeneous_confirmed_by=null;

  await render('admin');
  check(!queryByRole(host,'button',{name:'Add road section'}),'Admin has no section creation action');
  check(!queryByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),'Admin has no section edit action');
  check(!queryByRole(host,'button',{name:'Add road branch'}),'Admin has no branch creation action');
  check(!queryByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),'Admin has no branch edit action');
  for (const deniedRole of ['encoder','viewer']) {
    await render(deniedRole);
    check(!queryByRole(host,'button',{name:'Add road branch'}),`${deniedRole} has no branch creation action`);
    check(!queryByRole(host,'button',{name:'Edit road branch SYNTHETIC Road'}),`${deniedRole} has no branch edit action`);
    check(!queryByRole(host,'button',{name:'Add road section'}),`${deniedRole} has no section creation action`);
    check(!queryByRole(host,'button',{name:'Edit road section SYNTHETIC Section'}),`${deniedRole} has no section edit action`);
  }
  console.log(`Passed ${checks} isolated branch UI checks with synthetic data.`);
} finally {
  await React.act(async()=>root.unmount()); host.remove(); dom.window.close();
}
