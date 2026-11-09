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
let confirms = [], additions = [], starts = [];
async function render(sectionProps = {}, samples = [], key = 'a', extra = {}) {
  const props = { branchName:'SYNTHETIC Branch 01', busy:false, canEdit:true, isPhone:false, palette, samples,
    section:{ ...baseSection, ...sectionProps }, onBack:()=>{}, onEditDetails:()=>{},
    onConfirm:async payload => { confirms.push(payload); return true; },
    onAddAdditional:async payload => { additions.push(payload); return true; },
    onStartRound:async payload => { starts.push(payload); return true; }, ...extra };
  await React.act(async()=>root.render(e(SectionPlan,{ key, ...props })));
}
try {
  // Mockup section: As 240 m², Au 225 m², N 1.
  await render();
  check(!!getByLabelText(host,'Section Area (As): 240 m²') && !!getByLabelText(host,'Target Unit Area (Au): 225 m²') && !!getByLabelText(host,'Sample Unit (N): 1'),
    'As, Au and N follow §2.1.7');
  check(!!queryByText(host,'SYNTHETIC design') && !!queryByText(host,'SYNTHETIC traffic') && !!queryByText(host,'40 m'),'section details come from the saved section');
  check(!!queryByText(host,'0+000–0+040'),'preview shows the unit station range');
  check(getByRole(host,'button',{ name:'Confirm' }).disabled,'confirm waits for an option');
  check(!!queryByText(host,'Plan Summary'),'third panel waits for an option');
  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 1/ })));
  check(!queryByText(host,'Additional Sample Unit'),'Option 1 has no additional sample unit');
  check(!!queryByText(host,'Census Coverage') && !!queryByText(host,'1 of 1'),'Option 1 third panel shows census coverage');
  check(!!queryByText(host,/All 1 sample unit will be inspected/),'Option 1 inspects every unit');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(confirms.at(-1).method === 'all' && confirms.at(-1).total === 1 && confirms.at(-1).first === 1,'Option 1 confirm payload');

  // 25 units (5625 m²): Option 2 and Option 3.
  await render({ length_meters:937.5, area_sqm:5625 }, [], 'b');
  check(!!getByLabelText(host,'Sample Unit (N): 25'),'N = 25 for 5625 m²');
  check(!queryByText(host,'Allowed: 135 to 315 m²') && !queryByText(host,/Stations are in km\+m/),'no formula notes under the cards or preview');
  check(!!queryByText(host,'0+000–0+037.5') && !!queryByText(host,'0+112.5–0+150') && !!queryByText(host,'0+900–0+937.5'),'each unit box shows its own station range');
  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 2/ })));
  const n2 = section.minimumRandomSamples(25), i2 = Math.floor(25 / n2);
  check(!!queryByText(host,'Minimum sample units to inspect, n') && getAllByText(host,String(n2)).length > 0,'Option 2 shows Eq. 1 n');
  { const picked = section.systematicRandomUnits(25, n2, Number(getByLabelText(host,/^Starting sample unit: /).textContent)).units.length;
    check(!!getByLabelText(host,`Sample units to inspect: ${picked}`) && (picked > n2) === !!queryByText(host,/is only the minimum/),'Option 2 shows how many units the interval selects'); }
  check(!!queryByText(host,'Additional Sample Unit'),'Option 2 offers additional sample units');
  check(!!getByRole(host,'button',{ name:'Randomize starting sample unit' }),'Option 2 can randomize the start');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  const p2 = confirms.at(-1);
  check(p2.method === 'confidence' && p2.total === 25 && p2.first >= 1 && p2.first <= i2,'Option 2 confirm payload uses a start within 1..i');

  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 3/ })));
  check(!queryByText(host,'Total Sample Units (N)'),'Option 3 shows no reduced sampling table');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Confirm' })));
  const p3 = confirms.at(-1);
  check(p3.method === 'reduced' && p3.first >= 1 && p3.first <= 6,'Option 3: n = 4, i = 6');
  check(getByLabelText(host,'Sample Unit Number').disabled,'additional unit waits for a confirmed plan');

  // Confirmed Option 3 plan with saved units: locked options, additional unit enabled and prefilled.
  const samples = [2, 8, 14, 20].map(unit => ({ id:'s'+unit, section_id:'synthetic-section', unit_number:unit, sample_type:'random', start_m:(unit-1)*37.5, end_m:unit*37.5, inspection_notes:null }));
  await render({ length_meters:937.5, area_sqm:5625, sampling_method:'reduced', sampling_interval:6, sampling_start_unit:2, total_sample_units:25, homogeneous_confirmed_by:'r', homogeneous_confirmed_at:'2026-11-07T00:00:00Z' }, samples, 'c');
  check(getByRole(host,'radio',{ name:/Option 3/ }).getAttribute('aria-checked') === 'true' && getByRole(host,'radio',{ name:/Option 1/ }).disabled,'confirmed plan locks the chosen option');
  check(!queryByRole(host,'button',{ name:'Confirm' }) && !!queryByText(host,/Sampling plan confirmed/),'confirmed plan shows its status instead of Confirm');
  check(!!queryByText(host,/This plan is locked\./),'confirmed plan explains why the options are locked');
  check(!!getByLabelText(host,'SU8, selected for inspection'),'preview marks saved units');
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
  check(!!queryByText(host,/Confirm the round-1 sampling plan first/),'round 2 waits for a confirmed round 1');
  check(!!queryByText(host,'Previous Survey Data') && !!queryByText(host,'± 5 PCI points'),'round 2 third panel lists the previous survey inputs');

  // Round 1 complete (25 units, Option 3 saved SU2/8/14/20, all published): plan round 2 with measured s.
  const confirmedReduced = { length_meters:937.5, area_sqm:5625, sampling_method:'reduced', sampling_interval:6, sampling_start_unit:2, total_sample_units:25, homogeneous_confirmed_by:'r', homogeneous_confirmed_at:'2026-11-07T00:00:00Z' };
  const published = [2, 8, 14, 20].map(unit => ({ id:'p'+unit, section_id:'synthetic-section', unit_number:unit, sample_type:'random', start_m:(unit-1)*37.5, end_m:unit*37.5, inspection_notes:null, workflow_state:'published', survey_round:1 }));
  const ready = { current_round:1, units:4, published:4, ready:true, random_count:4, mean:75, deviation:6, rounds:[] };
  await render(confirmedReduced, published, 'r1', { rounds:ready });
  check(!!queryByText(host,/This plan is locked\./) && !queryByText(host,'Round 2 plan'),'round 1 is open while it is current');
  await React.act(async()=>user.click(getByRole(host,'tab',{ name:'Round 2 and later' })));
  check(!!queryByText(host,/Round 1 is complete\. Choose how to sample round 2/),'complete round 1 opens round-2 planning');
  check(!!getByLabelText(host,'Standard deviation, s: 6.00') && !!getByLabelText(host,'Random units with PCI: 4') && !!getByLabelText(host,'Round 1 results published: 4 of 4'),'previous survey data shows the measured s');
  check(getByRole(host,'button',{ name:'Start round 2' }).disabled,'start waits for an option');
  await React.act(async()=>user.click(getByRole(host,'radio',{ name:/Option 2/ })));
  const n2r = section.minimumRandomSamples(25, 6), i2r = Math.floor(25 / n2r);
  check(n2r === 5 && !!getByLabelText(host,`Minimum sample units to inspect, n: ${n2r}`) && !!getByLabelText(host,`Sampling interval, i: ${i2r}`),'round 2 Option 2 uses Eq. 1 with s = 6');
  check(!!queryByText(host,'Round 2 plan'),'round-2 plan is labelled');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Start round 2' })));
  check(starts.at(-1).method === 'confidence' && starts.at(-1).first >= 1 && starts.at(-1).first <= i2r,'start round 2 payload');

  // Fewer than two random PCIs: Option 2 cannot measure s.
  await render(confirmedReduced, published, 'r1b', { rounds:{ ...ready, random_count:1, deviation:null } });
  await React.act(async()=>user.click(getByRole(host,'tab',{ name:'Round 2 and later' })));
  check(getByRole(host,'radio',{ name:/Option 2/ }).disabled && !getByRole(host,'radio',{ name:/Option 1/ }).disabled,'Option 2 needs a measured s');
  check(!!getByLabelText(host,'Standard deviation, s: Needs 2+ units'),'missing s is explained');

  // Round 2 in progress: its plan, additional units and section PCI use round 2.
  const round2Units = [3, 8, 13, 18, 23].map(unit => ({ id:'q'+unit, section_id:'synthetic-section', unit_number:unit, sample_type:'random', start_m:(unit-1)*37.5, end_m:unit*37.5, inspection_notes:null, workflow_state:'planned', survey_round:2 }));
  const inProgress = { current_round:2, units:5, published:0, ready:false, random_count:5, mean:null, deviation:null,
    rounds:[{ round:2, method:'confidence', total:25, required:5, interval:5, first:3, deviation:6, previous_count:4, confirmed_at:'2026-11-08T00:00:00Z' }] };
  await render(confirmedReduced, [...published, ...round2Units], 'r2', { rounds:inProgress });
  check(!!queryByText(host,'Round 2 plan') && !queryByText(host,/This plan is locked\./),'current round 2 opens its tab');
  check(!!queryByText(host,/Round 2 is in progress \(0 of 5 published\)/) && getByRole(host,'radio',{ name:/Option 2/ }).getAttribute('aria-checked') === 'true','round-2 plan is locked while in progress');
  check(!!getByLabelText(host,'Sampling interval, i: 5') && !!getByLabelText(host,'SU13, selected for inspection'),'round-2 units on the preview');
  check(!!queryByText(host,'Additional Sample Unit') && !getByLabelText(host,'Sample Unit Number').disabled,'round-2 additional units are editable');
  check(!!queryByText(host,'Section PCI · Round 2') && !!getByLabelText(host,'Approved sample units: 0 of 5, published 0'),'section PCI follows round 2');
  await React.act(async()=>user.click(getByRole(host,'tab',{ name:'Round 1: first inspection' })));
  check(!!queryByText(host,/Round 1 is closed/) && getByLabelText(host,'Sample Unit Number').disabled,'round 1 is history once round 2 starts');

  // Section PCI: compute once every unit is approved (not yet published), view the report, publish later.
  const approvedUnits = published.map(unit => ({ ...unit, workflow_state:'approved' }));
  let computes = 0, publishes = 0, views = 0;
  const sectionActions = { rounds:ready, onComputeSection:async () => { computes++; return true; }, onPublishSection:async () => { publishes++; return true; }, onViewReport:() => { views++; } };
  await render(confirmedReduced, approvedUnits, 's1', { ...sectionActions, report:null });
  check(!!getByLabelText(host,'Approved sample units: 4 of 4, published 0'),'approved units count toward the section PCI');
  check(getByRole(host,'button',{ name:'Compute section PCI' }).disabled === false,'section PCI can be computed before publication');
  check(getByRole(host,'button',{ name:'Publish section PCI' }).disabled && !queryByText(host,'View section PCI report'),'nothing to publish or view before computing');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'Compute section PCI' })));
  check(computes === 1 && publishes === 0,'computing does not publish');
  const result = (unit, published_at) => ({ id:'r'+unit, sample_unit_id:'p'+unit, is_current:true, superseded_at:null, published_at });
  const report = (published_at, sectionPublished = false) => ({ calculationId:'calc', computedAt:'2026-11-09T00:00:00Z', published:sectionPublished,
    output:{ pci:72.5, condition:'Satisfactory', method:'D6433-07 §11.1' },
    samples:[2,8,14,20].map(unit => ({ id:'r'+unit, unit_number:unit, sample_type:'random', area_sqm:225, pci:72.5, condition:'Satisfactory' })),
    results:[2,8,14,20].map(unit => result(unit, published_at)) });
  await render(confirmedReduced, approvedUnits, 's2', { ...sectionActions, report:report(null) });
  check(!!getByLabelText(host,'Computed section PCI 72.50, Satisfactory'),'computed section PCI is shown');
  await React.act(async()=>user.click(getByRole(host,'button',{ name:'View section PCI report' })));
  check(views === 1,'the report opens from the section');
  check(getByRole(host,'button',{ name:'Publish section PCI' }).disabled,'publishing waits for every unit to be published');
  await render(confirmedReduced, published, 's3', { ...sectionActions, report:report('2026-11-09T01:00:00Z') });
  check(getByRole(host,'button',{ name:'Publish section PCI' }).disabled === false,'publish once every unit is published');
  await render(confirmedReduced, published, 's4', { ...sectionActions, report:report('2026-11-09T01:00:00Z', true) });
  check(getByRole(host,'button',{ name:'Published' }).disabled,'a published section PCI is not published twice');
  const outdated = report(null); outdated.results[0].is_current = false;
  await render(confirmedReduced, approvedUnits, 's5', { ...sectionActions, report:outdated });
  check(!!queryByText(host,/changed since the last computation/) && !queryByText(host,'View section PCI report'),'a superseded result asks for a new computation');

  console.log(`Passed ${checks} section sampling plan UI checks with synthetic data.`);
} finally {
  await React.act(async()=>root.unmount()); host.remove(); dom.window.close();
}
