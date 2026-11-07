import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-section-plan' });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event'])
  globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { getByRole, queryByRole, getByLabelText, queryByText, getAllByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
const e = React.createElement;
function load(file, deps = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const context = { exports: {}, Error, Math, Array, Number, String, Object, Infinity, Date, require: name => name in deps ? deps[name] : require(name) };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
// Real ASTM sampling math, loaded through its own import chain.
const catalog = load('supabase/functions/_shared/d6433-07/catalog.ts');
const section = load('supabase/functions/_shared/d6433-07/section.ts', { './catalog.ts': catalog });
const pciService = load('src/lib/pci/pci-service.ts');
const samplingPlan = load('src/lib/d6433-07/sampling-plan.ts', { '../pci/pci-service': pciService, './section': section });

const palette = { panel:'white', panelAlt:'#eee', border:'#ddd', blue:'#234', blueSoft:'#def', text:'#123', muted:'#456', red:'#a00', redSoft:'#fee', input:'white' };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
const View = ({ children, accessibilityLabel }) => e('div', accessibilityLabel ? { 'aria-label': accessibilityLabel } : null, children);
const Text = ({ children, accessibilityLabel }) => e('span', accessibilityLabel ? { 'aria-label': accessibilityLabel } : null, children);
const Pressable = ({ children, onPress, accessibilityLabel, accessibilityRole, accessibilityState, disabled }) => e('button', {
  onClick: onPress, 'aria-label': accessibilityLabel, role: accessibilityRole === 'radio' ? 'radio' : accessibilityRole === 'tab' ? 'tab' : undefined,
  'aria-checked': accessibilityRole === 'radio' ? !!accessibilityState?.checked : undefined, disabled }, children);
const rn = { View, Text, Pressable, StyleSheet:{ create: value => value } };
const shell = {
  AdminButton:({ label, onPress, disabled }) => e('button',{ onClick:onPress, disabled },label),
  AdminPanel:({ children }) => e('section',null,children),
  AdminField:({ editable, label, value, onChangeText }) => e('label',null,label,e('input',{ value, disabled:editable===false, onChange:event=>onChangeText(event.target.value) })),
};
const { SectionPlan } = load('src/components/road-network/section-plan.tsx', {
  'react-native': rn,
  '@expo/vector-icons': { Feather: Icon },
  '@/components/admin/admin-shell': shell,
  '@/components/workflow/shared': { Notice:({ children, error }) => e('p',{ role:error?'alert':undefined },children) },
  '@/lib/d6433-07/sampling-plan': samplingPlan,
  '@/lib/utils/admin-utils': { formatNumber:(value, suffix = '') => value === null || value === undefined ? '—' : `${value}${suffix}` },
});

const baseSection = { id:'synthetic-section', branch_id:'b', name:'SYNTHETIC Section 01', length_meters:40, width_meters:6, area_sqm:240,
  pavement_design:'SYNTHETIC design', construction_history:'SYNTHETIC history', traffic_classification:'SYNTHETIC traffic', pavement_condition:'SYNTHETIC condition',
  sampling_method:null, sampling_interval:null, sampling_start_unit:null, total_sample_units:null, homogeneous_confirmed_by:null, homogeneous_confirmed_at:null };
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host); const user = userEvent.setup({ document });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
let confirms = [], additions = [];
async function render(sectionProps = {}, samples = [], key = 'a') {
  const props = { branchName:'SYNTHETIC Branch 01', busy:false, canEdit:true, isPhone:false, palette, samples,
    section:{ ...baseSection, ...sectionProps }, onBack:()=>{}, onEditDetails:()=>{},
    onConfirm:async payload => { confirms.push(payload); return true; },
    onAddAdditional:async payload => { additions.push(payload); return true; } };
  await React.act(async()=>root.render(e(SectionPlan,{ key, ...props })));
}
try {
  // Mockup section: As 240 m², Au 225 m², N 1.
  await render();
  check(!!getByLabelText(host,'Section Area (As): 240 m²') && !!getByLabelText(host,'Target Unit Area (Au): 225 m²') && !!getByLabelText(host,'Sample Unit (N): 1'),
    'As, Au and N follow §2.1.7');
  check(!!queryByText(host,'SYNTHETIC design') && !!queryByText(host,'SYNTHETIC traffic') && !!queryByText(host,'40 m'),'section details come from the saved section');
  check(!!queryByText(host,'0+000') && !!queryByText(host,'0+040'),'preview shows section chainage');
  check(getByRole(host,'button',{ name:'Confirm' }).disabled,'confirm waits for an option');
  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 1/ })));
  check(!queryByText(host,'Additional Sample Unit'),'Option 1 has no additional sample unit');
  check(!!queryByText(host,/All 1 sample unit will be inspected/),'Option 1 inspects every unit');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(confirms.at(-1).method === 'all' && confirms.at(-1).total === 1 && confirms.at(-1).first === 1,'Option 1 confirm payload');

  // 25 units (5625 m²): Option 2 and Option 3.
  await render({ length_meters:937.5, area_sqm:5625 }, [], 'b');
  check(!!getByLabelText(host,'Sample Unit (N): 25'),'N = 25 for 5625 m²');
  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 2/ })));
  const n2 = section.minimumRandomSamples(25), i2 = Math.floor(25 / n2);
  check(!!queryByText(host,'Minimum sample units to inspect, n') && getAllByText(host,String(n2)).length > 0,'Option 2 shows Eq. 1 n');
  check(!!queryByText(host,'Additional Sample Unit'),'Option 2 offers additional sample units');
  check(!!getByRole(host,'button',{ name:'Randomize starting sample unit' }),'Option 2 can randomize the start');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  const p2 = confirms.at(-1);
  check(p2.method === 'confidence' && p2.total === 25 && p2.first >= 1 && p2.first <= i2,'Option 2 confirm payload uses a start within 1..i');

  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 3/ })));
  check(!!queryByText(host,'Total Sample Units (N)') && !!queryByText(host,'16-40'),'Option 3 shows the reduced sampling table');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  const p3 = confirms.at(-1);
  check(p3.method === 'reduced' && p3.first >= 1 && p3.first <= 6,'Option 3: n = 4, i = 6');
  check(getByLabelText(host,'Sample Unit Number').disabled,'additional unit waits for a confirmed plan');

  // Confirmed Option 3 plan with saved units: locked options, additional unit enabled and prefilled.
  const samples = [2, 8, 14, 20].map(unit => ({ id:'s'+unit, section_id:'synthetic-section', unit_number:unit, sample_type:'random', start_m:(unit-1)*37.5, end_m:unit*37.5, inspection_notes:null }));
  await render({ length_meters:937.5, area_sqm:5625, sampling_method:'reduced', sampling_interval:6, sampling_start_unit:2, total_sample_units:25, homogeneous_confirmed_by:'r', homogeneous_confirmed_at:'2026-11-07T00:00:00Z' }, samples, 'c');
  check(getByRole(host,'radio',{ name:/Option 3/ }).getAttribute('aria-checked') === 'true' && getByRole(host,'radio',{ name:/Option 1/ }).disabled,'confirmed plan locks the chosen option');
  check(!queryByRole(host,'button',{ name:'Confirm' }) && !!queryByText(host,/Sampling plan confirmed/),'confirmed plan shows its status instead of Confirm');
  check(!!getByLabelText(host,'U8, selected for inspection'),'preview marks saved units');
  await React.act(async()=>user.type(getByLabelText(host,'Sample Unit Number'),'5'));
  check(getByLabelText(host,'Starts at').value === '150' && getByLabelText(host,'Ends at').value === '187.5','unit number prefills its planned slot');
  check(getByRole(host,'button',{ name:'Mark as an additional' }).disabled,'reason is required');
  await React.act(async()=>user.type(getByLabelText(host,'Reasons'),'SYNTHETIC severe rutting'));
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Mark as an additional' })));
  check(additions.at(-1).unit === 5 && additions.at(-1).start_m === 150 && additions.at(-1).reason === 'SYNTHETIC severe rutting','additional unit payload');
  check(getByLabelText(host,'Sample Unit Number').value === '','form resets after marking');

  // Section too small to divide.
  await render({ area_sqm:100 }, [], 'd');
  check(!!getByRole(host,'alert') && getByRole(host,'alert').textContent.includes('135–315'),'undividable section is explained');

  // Round 2 tab.
  await React.act(async()=>user.click(getByRole(host,'tab',{ name:'Round 2 and later' })));
  check(!!queryByText(host,/previous survey/),'round 2 explains the measured standard deviation');

  console.log(`Passed ${checks} section sampling plan UI checks with synthetic data.`);
} finally {
  await React.act(async()=>root.unmount()); host.remove(); dom.window.close();
}
