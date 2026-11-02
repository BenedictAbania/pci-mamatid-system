import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-task-test', pretendToBeVisual: true });
for (const name of ['window','document','HTMLElement','Element','Node','MutationObserver','Event','KeyboardEvent','ShadowRoot']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
const React = require('react'), { createRoot } = require('react-dom/client'), native = require('react-native-web'), e = React.createElement;
const { getByRole, queryByRole, getByLabelText, getByText, queryByText, getAllByRole } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : require(n), document, HTMLElement, Response, fetch };
  vm.runInNewContext(code, context, { filename: file }); return context.exports;
}
let role = 'encoder', width = 390, requests = [], serverError = '', update, uploadFailure = false, uploads = 0;
const rn = { ...native, useWindowDimensions: () => ({ width, height: 844, scale: 1, fontScale: 1 }) };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
const auth = { useAuth: () => ({ role, user: { id: 'synthetic-' + role }, profile: { full_name: 'SYNTHETIC Tester' } }) };
const access = load('src/lib/access.ts'), tokens = load('src/lib/design-system.ts');
const navigation = load('src/lib/navigation.ts', { './access': access });
const shell = load('src/components/admin/admin-shell.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon, MaterialCommunityIcons: Icon }, 'expo-router': { useRouter: () => ({ push() {} }), usePathname: () => '/field-inspections' },
  '@/lib/supabase': {}, '@/providers/AuthProvider': auth, '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  '@/lib/access': access, '@/lib/design-system': tokens, '@/lib/account-display': load('src/lib/account-display.ts'), '@/lib/navigation': navigation,
});
const shared = load('src/components/workflow/shared.tsx', { 'react-native': rn, 'expo-router': {}, '@/providers/AuthProvider': auth, '@/components/admin/admin-shell': shell, '@/lib/workflow-data': {} });
const tabs = load('src/components/workflow/task-tabs.tsx', { 'react-native': rn, '@/components/admin/admin-shell': shell });
const presentation = load('src/lib/inspection-presentation.ts');
const catalogType = { id: 'synthetic-type', name: 'SYNTHETIC distress', is_active: true, astm_edition: 'D6433-24', astm_code: 1, default_unit_of_measure: 'm²', severity_required: true, allowed_severities: ['low','medium','high'], severity_descriptions: { low: 'SYNTHETIC low observation', medium: 'SYNTHETIC medium observation', high: 'SYNTHETIC high observation' } };
const catalog = { EDITION: 'D6433-24', ASPHALT_CATALOG: [], PROVISIONAL_LABEL: 'Provisional — synthetic UI fixture', potholeQuantity() { throw Error('Not used'); } };
const inspectionDeps = {
  'react-native': rn, 'expo-image': { Image: props => e('span', { 'aria-label': props.accessibilityLabel }) },
  'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled:false, assets:[{ uri:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', fileSize:68 }] }) }, 'expo-router': {},
  '@/components/workflow/photo-card': { PhotoCard: () => e('span', null, 'SYNTHETIC photo') }, '@/components/workflow/pagination': { PageControls: () => null },
  '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared, '@/components/workflow/task-tabs': tabs,
  '@/components/dashboard/dashboard-parts': { StatusBadge: ({ state }) => e('span', null, state) },
  '@/lib/inspection-presentation': presentation, '@/lib/pci-service': load('src/lib/pci-service.ts'), '@/lib/severity-colors': load('src/lib/severity-colors.ts'),
  '@/lib/supabase': { supabase: { storage: { from: () => ({ upload: async () => { uploads++; return { error: uploadFailure ? { message:'SYNTHETIC upload failure' } : null }; }, remove: async () => ({error:null}) }) } } }, '@/providers/AuthProvider': auth, '@/lib/inspection-photo': load('src/lib/inspection-photo.ts'), '@/lib/demo-preview': { DEMO_PREVIEW_ENABLED: false }, '@/lib/d6433-24/catalog': catalog,
  '@/lib/workflow-data': { workflowAction: async (sample, action, payload) => {
    requests.push({ sample: sample.id, revision: sample.input_revision, version: sample.action_version, action, payload });
    if (serverError) throw new Error(serverError);
    update(action, payload);
  } },
};
const { InspectionEditor } = load('src/app/field-inspections.tsx', inspectionDeps);
const baseline = { id: 'synthetic-sample', assigned_to: 'synthetic-encoder', reviewer_id: 'synthetic-reviewer', unit_number: 1, input_revision: 3, action_version: 9, workflow_state: 'draft', surveyed_at: '2026-01-02', area_sqm: 225, orientation_note: 'SYNTHETIC orientation', field_rules_confirmed: true, no_distress_confirmed: true, inspection_notes: '', latitude: null, longitude: null, start_m: 0, end_m: 15, computation_id: null };
let checks = 0; const results = [];
const check = (v, message) => { assert(v, message); checks++; };
async function test(id, task) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  requests = []; serverError = ''; uploadFailure = false; uploads = 0;
  const user = userEvent.setup({ document });
  function Form({ initial = baseline, initialStep = 'details', description = true, Editor = InspectionEditor }) {
    const [sample, setSample] = React.useState(initial), [step, setStep] = React.useState(initialStep), [error, setError] = React.useState(''), [measurements, setMeasurements] = React.useState([]);
    update = (action, payload) => {
      if (action === 'distress') setMeasurements([{ ...payload, id: 'synthetic-measurement', sample_unit_id: sample.id, measurement_details: {} }]);
      if (action === 'remove_distress') setMeasurements([]);
      setSample(s => ({ ...s, ...(action === 'save' ? { ...payload, surveyed_at: payload.surveyed_at, inspection_notes: payload.notes } : {}), action_version: s.action_version + 1, ...(action === 'submit' ? { workflow_state: 'submitted' } : {}), ...(action === 'return' ? { workflow_state: 'returned', input_revision: s.input_revision + 1 } : {}) }));
    };
    const data = { profiles: [], types: [{ ...catalogType, severity_descriptions: description ? catalogType.severity_descriptions : undefined }], distresses: measurements, computations: [], photos: [], history: [], settings: { active_edition: 'D6433-24' } };
    const run = async task => { try { await task(); setError(''); return true; } catch (ex) { setError(ex.message); return false; } };
    return e(Editor, { key: `${sample.id}-${sample.input_revision}-${sample.workflow_state}`, sample, data, step, setStep, error, run, busy: false, referencePagination: { page: 1, hasNext: false, busy: false, next() {}, previous() {} } });
  }
  try { await task({ host, root, user, Form }); results.push({ id, status: 'PASS' }); }
  catch (ex) { results.push({ id, status: 'FAIL', error: ex.message }); }
  finally { await React.act(async () => root.unmount()); host.remove(); }
}
for (const w of [390, 820, 1440]) await test('inspector-flow-' + w, async ({ host, root, user, Form }) => {
  width = w; role = 'encoder'; await React.act(async () => root.render(e(Form)));
  check(getAllByRole(host,'tab').length === 4, 'Four labeled task steps');
  check(!queryByRole(host,'button',{ name:'Show calculation details' }), 'Calculation trace is not ahead of the field task');
  await React.act(async()=>getByRole(host,'tab',{ name:'1. Sample details' }).focus());
  await React.act(async()=>user.keyboard('{ArrowRight}'));
  check(getByRole(host,'tab',{ name:'2. Distress measurements' }).getAttribute('aria-selected')==='true','Arrow key advances the selected task tab');
  await React.act(async()=>user.keyboard('{Home}'));
  check(queryByRole(host,'textbox',{ name:'Inspection date (YYYY-MM-DD) *' }),'Home key returns to details');
  const primary = [...host.querySelectorAll('[data-testid="lakad-action"]')].filter(node=>node.style.backgroundColor==='rgb(41, 73, 95)');
  check(primary.length===1,'One primary task action');
  const date = getByLabelText(host, 'Inspection date (YYYY-MM-DD) *');
  const steps = getByRole(host, 'tablist', { name: 'Inspection steps' });
  await React.act(async () => { await user.clear(date); await user.type(date, 'bad-date'); });
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Save details and continue' })));
  check(getByRole(host,'alert').textContent.includes('valid inspection date'), 'Validation error announced');
  check(date.value === 'bad-date', 'Invalid draft retained for correction');
  check(getByRole(host,'tab',{ name:'2. Distress measurements' }).getAttribute('aria-disabled') === 'true', 'Cannot skip unsaved details');
  await React.act(async () => { await user.clear(date); await user.type(date, '2026-01-02'); });
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Save details and continue' })));
  check(getByRole(host, 'tablist', { name: 'Inspection steps' }) === steps, 'Save keeps the inspection editor mounted');
  check(getByRole(host,'tab',{ name:'2. Distress measurements' }).getAttribute('aria-selected') === 'true', 'Successful save advances');
  await React.act(async () => user.click(getByRole(host,'radio',{ name:'SYNTHETIC distress' })));
  await React.act(async () => user.click(getByRole(host,'radio',{ name:'L — Low: SYNTHETIC low observation' })));
  await React.act(async () => user.type(getByLabelText(host,'Measured quantity (m²) *'), '1'));
  check(getByRole(host,'button',{ name:'Continue to photos' }).getAttribute('aria-disabled') === 'true', 'Unsaved measurement cannot be skipped');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Add distress' })));
  check(getByRole(host, 'tablist', { name: 'Inspection steps' }) === steps, 'Measurement save keeps the editor mounted');
  check(!queryByText(host, 'Measurement draft: add this distress or discard it before continuing.'), 'Successful save clears the local measurement draft');
  check(requests.at(-1).payload.severity === 'low', 'Description selection persists canonical low code');
  check(requests.at(-1).payload.unit_of_measure === 'm²', 'Configured unit retained');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Remove', exact:true })));
  check(getByRole(host,'button',{ name:'Confirm' }), 'Removal confirmation visible on the distress step');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(requests.at(-1).action === 'remove_distress', 'Remove action delivered');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Continue to photos' })));
  check(getByText(host,'Photographs are optional. You can submit an inspection without one.'), 'Optional evidence explained');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Continue to review and submit' })));
  check(queryByRole(host,'button',{ name:'Show calculation details' }), 'Detailed trace available on final step');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Submit for engineer review' })));
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(requests.at(-1).action === 'submit' && requests.at(-1).revision === 3, 'Submit carries selected revision');
  check(!queryByRole(host,'button',{ name:'Submit for engineer review' }), 'Submitted input is locked');
});
await test('reviewer-return-and-provisional-gate', async ({ host, root, user, Form }) => {
  role = 'reviewer'; await React.act(async () => root.render(e(Form,{ initial:{ ...baseline, workflow_state:'submitted' }, initialStep:'submit' })));
  check(!queryByRole(host,'textbox',{ name:'Measured sample area (m², 135–315) *' }), 'Reviewer does not edit field measurements');
  check(getByRole(host,'button',{ name:'Approve reference result' }).getAttribute('aria-disabled') === 'true', 'No verified result means approval disabled');
  check(getByRole(host,'button',{ name:'Return for correction' }).getAttribute('aria-disabled') === 'true', 'Return requires comments');
  await React.act(async () => user.type(getByLabelText(host,'Engineer review comments (required when returning)'), 'SYNTHETIC correction request'));
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Return for correction' })));
  serverError = 'SYNTHETIC outdated revision. Refresh before reviewing.';
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(getByRole(host,'alert').textContent.includes('outdated revision'), 'Stale review failure is explicit');
  check(queryByText(host,'submitted'), 'Failed action does not invent a returned state');
  serverError = ''; await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(queryByText(host,'returned'), 'Successful response updates workflow status');
  check(!queryByRole(host,'button',{ name:'Publish approved reference result' }), 'Return never publishes');
});
await test('synthetic-approval-simulation-keeps-backend-locked', async ({ host, root, user, Form }) => {
  role = 'reviewer';
  const DemoEditor = load('src/app/field-inspections.tsx', { ...inspectionDeps, '@/lib/demo-preview': { DEMO_PREVIEW_ENABLED: true } }).InspectionEditor;
  await React.act(async () => root.render(e(Form, { initial: { ...baseline, workflow_state: 'submitted' }, initialStep: 'submit', Editor: DemoEditor })));
  check(getByRole(host, 'button', { name: 'Approve reference result' }).getAttribute('aria-disabled') === 'true', 'Trusted approval remains disabled');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Simulate approval (demo only)' })));
  check(getByText(host, /approval simulated on this screen only/), 'Simulation is explicitly local and provisional');
  check(requests.length === 0, 'Simulation does not call the workflow RPC');
  check(getByText(host, 'submitted'), 'Sample remains submitted');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Clear simulated approval' })));
  check(!queryByText(host, /approval simulated on this screen only/), 'Simulation can be cleared');
});
await test('missing-fields-and-description-fallback', async ({ host, root, user, Form }) => {
  role = 'encoder'; await React.act(async () => root.render(e(Form,{ initial:{ ...baseline, orientation_note:'', field_rules_confirmed:false, no_distress_confirmed:false }, initialStep:'submit', description:false })));
  check(getByRole(host,'button',{ name:'Submit for engineer review' }).getAttribute('aria-disabled') === 'true', 'Incomplete saved inspection cannot submit');
  check(getByRole(host,'alert').textContent.includes('orientation'), 'Missing requirements explain next correction');
  await React.act(async () => user.click(getByRole(host,'tab',{ name:'2. Distress measurements' })));
  await React.act(async () => user.click(getByRole(host,'radio',{ name:'SYNTHETIC distress' })));
  check(getByText(host,/Some distress-specific descriptions are unavailable/), 'Missing descriptions do not become invented ASTM text');
});
await test('navigation-and-permissions', async () => {
  for (const r of ['admin','reviewer','encoder','viewer']) check(navigation.navigationForRole(r).every(item => access.canAccess(r,item.route)), 'Navigation respects existing permission table');
  check(!access.canAccess('admin','/field-inspections'), 'Admin does not gain approval route');
  check(!access.canAccess('viewer','/users') && !access.canAccess('viewer','/field-inspections'), 'Viewer staff routes remain denied');
  check(access.canAccess('reviewer','/demo-priorities') && access.canAccess('admin','/demo-priorities') && !access.canAccess('viewer','/demo-priorities') && !access.canAccess('encoder','/demo-priorities'), 'Preview route stays staff-only');
  check(navigation.navigationRoute('admin','/reports') === '/pci-results', 'Legacy reports activate consolidated destination');
});
await test('status-filter-no-remount', async ({ host, root, user }) => {
  role = 'encoder'; width = 1440;
  const route = { status: 'all' };
  const filterData = {
    samples: [baseline, { ...baseline, id: 'synthetic-returned', unit_number: 2, workflow_state: 'returned' }],
    sections: [{ id: 'synthetic-section', name: 'SYNTHETIC road' }],
  };
  filterData.samples.forEach(sample => { sample.section_id = 'synthetic-section'; });
  const FieldInspections = load('src/app/field-inspections.tsx', {
    ...inspectionDeps,
    'expo-router': { useLocalSearchParams: () => route, useRouter: () => ({ setParams: params => Object.assign(route, params) }) },
    '@/components/workflow/shared': { ...shared, useWorkflow: () => ({ data: filterData, loading: false, scopeChanging: false, busy: false, error: '', message: '', refresh: async () => {}, pagination: { page: 1, hasNext: false, busy: false, next() {}, previous() {} } }) },
  }).default;
  await React.act(async () => root.render(e(FieldInspections)));
  const content = host.querySelector('[data-testid="lakad-content"]');
  const search = getByLabelText(host, 'Search inspections on this page');
  check(getByRole(host, 'button', { name: 'Open sample 1' }) && getByRole(host, 'button', { name: 'Open sample 2' }), 'Both assignments shown before filtering');
  await React.act(async () => user.click(getByRole(host, 'tab', { name: 'Returned' })));
  await React.act(async () => root.render(e(FieldInspections)));
  check(host.querySelector('[data-testid="lakad-content"]') === content, 'Status filter retains the workspace container');
  check(getByLabelText(host, 'Search inspections on this page') === search, 'Search input stays mounted');
  check(!queryByRole(host, 'button', { name: 'Open sample 1' }) && getByRole(host, 'button', { name: 'Open sample 2' }), 'New status selects only matching work');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Open sample 2' })));
  check(getByText(host, 'Loading inspection details…'), 'Editor waits for the selected sample’s full evidence fetch');
  check(!queryByRole(host, 'tablist', { name: 'Inspection steps' }), 'Incomplete register data does not mount the editor');
});
await test('photo-preview-failure-retry-and-discard', async ({ host, root, user, Form }) => {
  role = 'encoder'; await React.act(async () => root.render(e(Form,{initialStep:'photos'})));
  await React.act(async () => user.click(getByRole(host,'button',{name:'Choose photograph'})));
  check(getByLabelText(host,'Selected photograph preview'),'Picker selection has a preview');
  check(getByRole(host,'button',{name:'Continue to review and submit'}).getAttribute('aria-disabled')==='true','Unuploaded selection blocks advance');
  uploadFailure = true;
  await React.act(async () => user.click(getByRole(host,'button',{name:'Upload photograph'})));
  check(getByRole(host,'alert').textContent.includes('upload failure'),'Upload failure announced');
  check(getByLabelText(host,'Selected photograph preview'),'Failed upload retains the selected image');
  check(!requests.some(r=>r.action==='photo'),'Failed upload never saves photo metadata');
  uploadFailure = false;
  await React.act(async () => user.click(getByRole(host,'button',{name:'Upload photograph'})));
  check(uploads===2 && requests.at(-1).action==='photo','Retry delivers the authorized metadata action after mock Storage success');
  await React.act(async () => user.click(getByRole(host,'button',{name:'Choose photograph'})));
  await React.act(async () => user.click(getByRole(host,'button',{name:'Discard selected photo'})));
  check(getByRole(host,'button',{name:'Continue to review and submit'}).getAttribute('aria-disabled')!=='true','Discard restores optional-photo continuation');
});
const evidence = process.argv.find(x => x.startsWith('--evidence='))?.slice(11);
if (evidence) { assert(evidence.startsWith('private-astm/')); fs.mkdirSync(evidence,{recursive:true}); fs.writeFileSync(evidence+'/task-flow-dom.json',JSON.stringify({ checks, results },null,2)); }
console.log(JSON.stringify({ checks, results, scope:'Synthetic React Native Web DOM interactions at phone/tablet/desktop branches. No browser geometry, screen-reader, physical device, or hosted approval claim.' }));
dom.window.close(); if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
