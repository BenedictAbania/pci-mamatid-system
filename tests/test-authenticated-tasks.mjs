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
const { getByRole, queryByRole, getByLabelText, queryByLabelText, getByText, queryByText, getAllByRole } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : /\.png$|\.jpg$/.test(n) ? 'synthetic-asset' : require(n), document, HTMLElement, Response, fetch };
  vm.runInNewContext(code, context, { filename: file }); return context.exports;
}
let compressed = 0, role = 'encoder', width = 390, requests = [], serverError = '', update, uploadFailure = false, uploads = 0;
const rn = { ...native, useWindowDimensions: () => ({ width, height: 844, scale: 1, fontScale: 1 }) };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
const auth = { useAuth: () => ({ role, user: { id: 'synthetic-' + role }, profile: { full_name: 'SYNTHETIC Tester' } }) };
const access = load('src/lib/auth/access.ts'), tokens = load('src/lib/ui/design-system.ts');
const navigation = load('src/lib/auth/navigation.ts', { './access': access });
const shell = load('src/components/admin/admin-shell.tsx', {'@/lib/data/profile-data': { profilePhotoUrl: async () => '', saveOwnProfile: async () => {}, PROFILE_PHOTO_MAX_BYTES: 2097152, PROFILE_PHOTO_MESSAGE: '' }, 'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: true, assets: null }) }, 
  'react-native': rn, '@expo/vector-icons': { Feather: Icon, MaterialCommunityIcons: Icon }, 'expo-router': { useRouter: () => ({ push() {} }), usePathname: () => '/field-inspections' },
  '@/lib/data/supabase': {}, '@/providers/AuthProvider': auth, '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  '@/lib/auth/access': access, '@/lib/ui/design-system': tokens, '@/lib/auth/account-display': load('src/lib/auth/account-display.ts'), '@/lib/auth/navigation': navigation,
});
const shared = load('src/components/workflow/shared.tsx', { 'react-native': rn, 'expo-router': {}, '@/providers/AuthProvider': auth, '@/components/admin/admin-shell': shell, '@/lib/data/workflow-data': {}, '@/lib/ui/design-system': tokens });
const tabs = load('src/components/workflow/task-tabs.tsx', { 'react-native': rn, '@/components/admin/admin-shell': shell });
const guidance = load('src/lib/d6433-07/severity-guidance.ts');
const presentation = load('src/lib/ui/inspection-presentation.ts', { '../d6433-07/severity-guidance': guidance });
const catalogType = { id: 'synthetic-type', name: 'SYNTHETIC distress', is_active: true, astm_edition: 'ASTM D6433-07', astm_code: 1, default_unit_of_measure: 'm²', severity_required: true, allowed_severities: ['low','medium','high'] };
const catalog = load('supabase/functions/_shared/d6433-07/catalog.ts');
const measurementParts = load('src/lib/d6433-07/measurement-parts.ts', { './catalog.ts': catalog });
const inspectionDeps = {
  'react-native': rn, 'expo-image': { Image: props => e('span', { 'aria-label': props.accessibilityLabel }) },
  '@/lib/utils/compress-image': { INSPECTION_PHOTO_COMPRESSION: { maxSize: 1600, quality: 0.72 }, compressImage: async uri => { compressed++; return uri; } },
  'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled:false, assets:[{ uri:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', fileSize:68 }] }) }, 'expo-router': {}, '@expo/vector-icons': { Feather: Icon, MaterialCommunityIcons: Icon },
  '@/components/workflow/photo-card': { PhotoCard: () => e('span', null, 'SYNTHETIC photo') }, '@/components/workflow/pagination': { PageControls: () => null },
  '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared, '@/components/workflow/task-tabs': tabs,
  '@/components/dashboard/dashboard-parts': { StatusBadge: ({ state }) => e('span', null, state) },
  '@/lib/ui/inspection-presentation': presentation, '@/lib/d6433-07/severity-guidance': guidance, '@/lib/d6433-07/measurement-parts': measurementParts, '@/lib/pci/pci-service': load('src/lib/pci/pci-service.ts'), '@/lib/pci/severity-colors': load('src/lib/pci/severity-colors.ts'),
  '@/lib/data/supabase': { supabase: { storage: { from: () => ({ upload: async () => { uploads++; return { error: uploadFailure ? { message:'SYNTHETIC upload failure' } : null }; }, remove: async () => ({error:null}) }) } } }, '@/providers/AuthProvider': auth, '@/lib/utils/inspection-photo': load('src/lib/utils/inspection-photo.ts'), '@/lib/ui/demo-preview': { DEMO_PREVIEW_ENABLED: false }, '@/lib/d6433-07/catalog': catalog,
  '@/lib/data/workflow-data': { workflowAction: async (sample, action, payload) => {
    requests.push({ sample: sample.id, revision: sample.input_revision, version: sample.action_version, action, payload });
    if (serverError) throw new Error(serverError);
    update(action, payload);
  }, startInspection: async sample => {
    requests.push({ sample: sample.id, revision: sample.input_revision, version: sample.action_version, action: 'start', payload: {} });
    return { ...sample, workflow_state: 'draft', action_version: sample.action_version + 1 };
  }, finishInspection: async (sample, details) => {
    requests.push({ sample: sample.id, action: 'finish', payload: details });
    if (serverError) throw new Error(serverError);
    return { revision: sample.input_revision, output: syntheticOutput };
  }, submitReport: async sample => {
    requests.push({ sample: sample.id, action: 'submit-report' });
    update('submit-report', {});
  }, calculateProvisional: async () => { requests.push({ action: 'calculate' }); } },
};
inspectionDeps['@/lib/data/inspection-photos'] = load('src/lib/data/inspection-photos.ts', inspectionDeps);
inspectionDeps['@/components/workflow/distress-photos'] = load('src/components/workflow/distress-photos.tsx', inspectionDeps);
const syntheticOutput = { status: 'provisional', provisional_notes: ['SYNTHETIC policy note'], groups: [{ code: 1, severity: 'low', quantity: 13, unit: 'm²', density: 5.7778, deduct_value: 30 }], deduct_values: [30], total_deduct_value: 30, q: 1, iterations: [], allowable_deducts: 0, max_corrected_deduct_value: 30, pci: 70, condition: 'Satisfactory' };
const resultDeps = { ...inspectionDeps, '@/lib/ui/design-system': tokens, '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light' }) }, '@/lib/pci/pci-classification': load('src/lib/pci/pci-classification.ts') };
const { InspectionResults } = load('src/components/workflow/inspection-results.tsx', resultDeps);
const resultsModule = { InspectionResults, currentOutput: load('src/components/workflow/inspection-results.tsx', resultDeps).currentOutput };
const entryModule = load('src/components/workflow/distress-entry.tsx', { ...resultDeps, '@/components/workflow/inspection-results': resultsModule });
const { DistressEntry } = entryModule;
inspectionDeps['@/components/workflow/distress-entry'] = entryModule;
const { ReviewWorkspace } = load('src/components/workflow/review-workspace.tsx', { ...resultDeps, '@/components/workflow/inspection-results': resultsModule, '@/components/workflow/distress-entry': entryModule });
inspectionDeps['@/components/workflow/review-workspace'] = { ReviewWorkspace };
const { InspectionEditor } = load('src/app/field-inspections.tsx', inspectionDeps);
const baseline = { id: 'synthetic-sample', assigned_to: 'synthetic-encoder', reviewer_id: 'synthetic-reviewer', unit_number: 1, input_revision: 3, action_version: 9, workflow_state: 'draft', surveyed_at: '2026-01-02', area_sqm: 225, orientation_note: 'SYNTHETIC orientation', field_rules_confirmed: true, no_distress_confirmed: true, inspection_notes: '', latitude: null, longitude: null, start_m: 0, end_m: 15, computation_id: null };
let checks = 0; const results = [];
const check = (v, message) => { assert(v, message); checks++; };
async function test(id, task) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  requests = []; serverError = ''; uploadFailure = false; uploads = 0; compressed = 0;
  const user = userEvent.setup({ document });
  function Form({ initial = baseline, initialStep = 'details', type = catalogType, types = [type], computations = [], Editor = InspectionEditor }) {
    const [sample, setSample] = React.useState(initial), [step, setStep] = React.useState(initialStep), [error, setError] = React.useState(''), [measurements, setMeasurements] = React.useState([]);
    update = (action, payload) => {
      if (action === 'distress') setMeasurements([{ ...payload, id: 'synthetic-measurement', sample_unit_id: sample.id, measurement_details: { severity_guidance: payload.severity_guidance, measurement_parts: payload.measurement_parts, severity_evidence: payload.severity_evidence } }]);
      if (action === 'remove_distress') setMeasurements([]);
      setSample(s => ({ ...s, ...(action === 'save' ? { ...payload, surveyed_at: payload.surveyed_at, inspection_notes: payload.notes } : {}), action_version: s.action_version + 1, ...(action === 'submit' ? { workflow_state: 'submitted' } : {}), ...(action === 'return' ? { workflow_state: 'returned', input_revision: s.input_revision + 1 } : {}) }));
    };
    const data = { profiles: [], types, distresses: measurements, computations, photos: [], history: [], settings: { active_edition: 'ASTM D6433-07' } };
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
  const primary = [...host.querySelectorAll('[data-testid="lakad-action"]')].filter(node=>node.style.backgroundColor==='rgb(24, 80, 224)');
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
  await React.act(async () => user.selectOptions(getByLabelText(host,'Asphalt distress type *'), 'synthetic-type'));
  await React.act(async () => user.click(getByRole(host,'radio',{ name:/L.*Fine parallel hairline cracks/ })));
  await React.act(async () => user.type(getByLabelText(host,'Part 1 length (m) *'), '1'));
  await React.act(async () => user.type(getByLabelText(host,'Part 1 width (m) *'), '1'));
  check(getByRole(host,'button',{ name:'Continue to photos' }).getAttribute('aria-disabled') === 'true', 'Unsaved measurement cannot be skipped');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Add distress' })));
  check(getByRole(host, 'tablist', { name: 'Inspection steps' }) === steps, 'Measurement save keeps the editor mounted');
  check(!queryByText(host, 'Measurement draft: add this distress or discard it before continuing.'), 'Successful save clears the local measurement draft');
  check(requests.at(-1).payload.severity === 'low', 'Description selection persists canonical low code');
  check(requests.at(-1).payload.severity_guidance.version === guidance.D07_GUIDANCE_VERSION, 'Saved measurement carries the draft guidance version');
  check(getByText(host,/Saved cue/), 'Reopened measurement shows its captured draft cue');
  check(requests.at(-1).payload.unit_of_measure === 'm²', 'Configured unit retained');
  check(requests.at(-1).payload.measurement_parts[0].length_m === 1, 'Individual measured part saved');
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Edit measurement' })));
  check(getByLabelText(host,'Part 1 length (m) *').value === '1', 'Saved measured part reopens for editing');
  await React.act(async () => { await user.clear(getByLabelText(host,'Part 1 length (m) *')); await user.type(getByLabelText(host,'Part 1 length (m) *'),'2'); });
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Save measurement changes' })));
  check(requests.at(-1).payload.quantity === 2, 'Corrected total Q is computed from the reopened part');
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
await test('all-19-type-selection-and-reset', async ({ host, root, user, Form }) => {
  role = 'encoder';
  const types = Array.from({ length: 19 }, (_, index) => ({ ...catalogType, id:`synthetic-d07-${index + 1}`, name:index === 11 ? 'Polished Aggregate' : `SYNTHETIC D07 type ${index + 1}`, astm_code:index + 1, severity_required:index !== 11, allowed_severities:index === 11 ? [] : ['low','medium','high'] }));
  await React.act(async () => root.render(e(Form,{ initialStep:'distress', types })));
  const dropdown = getByLabelText(host,'Asphalt distress type *');
  check([...dropdown.options].slice(1).map(option => option.text).join('|') === [...types].sort((a,b) => a.name.localeCompare(b.name,'en',{sensitivity:'base'})).map(type => type.name).join('|'), 'Active type names are alphabetically sorted');
  for (const type of types) {
    await React.act(async () => user.selectOptions(dropdown,type.id));
    if (type.astm_code === 12) {
      check(getByText(host,/No severity level for Polished Aggregate/), 'Type 12 has a visible no-severity explanation');
    } else {
      const low = guidance.D07_SEVERITY_GUIDANCE[type.astm_code].low;
      check(getByRole(host,'radio',{ name:new RegExp(`L.*${low.slice(0, 12)}`) }), `Type ${type.astm_code} shows its own cue`);
      const severityStates = getAllByRole(host,'radio').filter(node => /^(L|M|H) — /.test(node.getAttribute('aria-label') ?? '')).map(node => node.style.backgroundColor);
      assert(severityStates.every(state => state === 'rgb(255, 255, 255)'), `Switching types clears prior severity: ${JSON.stringify(severityStates)}`); checks++;
      await React.act(async () => user.click(getByRole(host,'radio',{ name:new RegExp(`L.*${low.slice(0, 12)}`) })));
    }
  }
});
await test('type-switch-clears-measurements-and-invalid-parts', async ({ host, root, user, Form }) => {
  role='encoder';
  const types=[catalogType,{...catalogType,id:'synthetic-length',name:'SYNTHETIC edge',astm_code:7,default_unit_of_measure:'m'}];
  await React.act(async()=>root.render(e(Form,{initialStep:'distress',types})));
  const dropdown=getByLabelText(host,'Asphalt distress type *');
  await React.act(async()=>user.selectOptions(dropdown,'synthetic-type'));
  await React.act(async()=>user.type(getByLabelText(host,'Part 1 length (m) *'),'2'));
  await React.act(async()=>user.type(getByLabelText(host,'Part 1 width (m) *'),'3'));
  check(getByText(host,/Total quantity \(Q\): 6 m²/),'Rectangle Q preview is computed');
  await React.act(async()=>user.selectOptions(dropdown,'synthetic-length'));
  check(getByLabelText(host,'Part 1 affected length (m) *').value==='','Switching distress clears previous dimensions');
  await React.act(async()=>user.click(getByRole(host,'radio',{name:/L.*Low or medium edge cracks/})));
  await React.act(async()=>user.click(getByRole(host,'button',{name:'Add distress'})));
  check(getByRole(host,'alert').textContent.includes('Affected length must be a positive number'),'Incomplete part rejected without save');
  check(!requests.some(request=>request.action==='distress'),'Invalid part never reaches backend');
});
await test('polished-aggregate-has-no-severity-choice', async ({ host, root, user, Form }) => {
  role = 'encoder';
  await React.act(async () => root.render(e(Form,{ initialStep:'distress', type:{ ...catalogType, name:'Polished Aggregate', astm_code:12, severity_required:false, allowed_severities:[] } })));
  await React.act(async () => user.selectOptions(getByLabelText(host,'Asphalt distress type *'),'synthetic-type'));
  check(getByText(host,/No severity level for Polished Aggregate/), 'No L/M/H selector is shown for polished aggregate');
  check(!queryByText(host,'Observed distress severity *'), 'No required severity prompt for polished aggregate');
  await React.act(async () => user.type(getByLabelText(host,'Part 1 length (m) *'), '2'));
  await React.act(async () => user.type(getByLabelText(host,'Part 1 width (m) *'), '1'));
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Add distress' })));
  check(requests.at(-1).payload.severity === null, 'Polished aggregate saves a null severity');
  check(requests.at(-1).payload.severity_guidance.version === guidance.D07_GUIDANCE_VERSION, 'No-severity explanation is versioned');
});
await test('historical-cues-use-frozen-input-not-live-catalog', async ({ host, root, user, Form }) => {
  role = 'reviewer';
  const old = { id:'synthetic-old', sample_unit_id:baseline.id, input_revision:2, edition:'ASTM D6433-24', input_snapshot:{ distresses:[{ id:'old-distress', distress_type_id:catalogType.id, severity:'high' }] }, output_snapshot:null };
  const current = { id:'synthetic-current', sample_unit_id:baseline.id, input_revision:3, edition:'ASTM D6433-07', input_snapshot:{ distresses:[{ id:'new-distress', distress_type_id:catalogType.id, severity:'low', measurement_details:{ severity_guidance:guidance.d07GuidanceSnapshot(1,'low') } }], report_context:{ distress_names:{ [catalogType.id]:'SYNTHETIC frozen name' } } }, output_snapshot:null };
  await React.act(async () => root.render(e(Form,{ initial:{ ...baseline, workflow_state:'submitted', computation_id:current.id }, initialStep:'submit', computations:[old,current] })));
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Show calculation details' })));
  check(getByText(host,'Saved ASTM D6433-07 input · Revision 3'), 'Reviewer sees frozen D07 revision');
  check(getByText(host,/SYNTHETIC frozen name.*D07-X1-draft-2026-11-03/), 'Reviewer sees the cue and version saved with D07 input');
  const d24 = getByText(host,'Saved ASTM D6433-24 input · Revision 2');
  check(!d24.parentElement.textContent.includes(guidance.D07_GUIDANCE_VERSION), 'Historical D24 input does not inherit D07 guidance');
});
await test('reviewer-return-and-provisional-gate', async ({ host, root, user, Form }) => {
  role = 'reviewer'; await React.act(async () => root.render(e(Form,{ initial:{ ...baseline, workflow_state:'submitted' }, initialStep:'submit' })));
  check(!queryByRole(host,'textbox',{ name:'Measured sample area (m², 135–315) *' }), 'Reviewer does not edit field measurements');
  check(getByRole(host,'button',{ name:'Approve result' }).getAttribute('aria-disabled') === 'true', 'No saved PCI means approval disabled');
  check(getByRole(host,'button',{ name:'Return for correction' }).getAttribute('aria-disabled') === 'true', 'Return requires comments');
  await React.act(async () => user.type(getByLabelText(host,'Engineer review comments (required when returning)'), 'SYNTHETIC correction request'));
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Return for correction' })));
  serverError = 'SYNTHETIC outdated revision. Refresh before reviewing.';
  await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(getByRole(host,'alert').textContent.includes('outdated revision'), 'Stale review failure is explicit');
  check(queryByText(host,'submitted'), 'Failed action does not invent a returned state');
  serverError = ''; await React.act(async () => user.click(getByRole(host,'button',{ name:'Confirm' })));
  check(queryByText(host,'returned'), 'Successful response updates workflow status');
  check(!queryByRole(host,'button',{ name:'Publish approved result' }), 'Return never publishes');
});
await test('reviewer-can-approve-provisional-result', async ({ host, root, user, Form }) => {
  role = 'reviewer';
  const computation = { id: 'synthetic-computation', sample_unit_id: baseline.id, input_revision: 3, edition: 'ASTM D6433-07', verification: 'pending', output_snapshot: { status: 'provisional', pci: 70, condition: 'Satisfactory', iterations: [], groups: [], deduct_values: [], total_deduct_value: 30, max_corrected_deduct_value: 30, allowable_deducts: 0, q: 0 }, created_at: '2026-11-08' };
  await React.act(async () => root.render(e(Form, { initial: { ...baseline, workflow_state: 'submitted', computation_id: computation.id }, initialStep: 'submit', computations: [computation] })));
  check(!queryByText(host, /This PCI is provisional/), 'No provisional disclaimer in the review step');
  check(getByRole(host, 'button', { name: 'Approve result' }).getAttribute('aria-disabled') !== 'true', 'A saved provisional PCI can be approved');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Approve result' })));
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Confirm' })));
  check(requests.at(-1).action === 'approve', 'Approval is delivered to the server, which applies the provisional switch');
});
await test('reviewer-workspace-read-only-decision', async ({ host, root, user, Form }) => {
  role = 'reviewer'; width = 1440;
  const computation = { id: 'synthetic-computation', sample_unit_id: baseline.id, input_revision: 3, edition: 'ASTM D6433-07', verification: 'pending', output_snapshot: syntheticOutput, created_at: '2026-11-08' };
  await React.act(async () => root.render(e(Form, { Editor: ReviewWorkspace, initial: { ...baseline, workflow_state: 'submitted', computation_id: computation.id }, computations: [computation] })));
  check(getByRole(host, 'heading', { name: '1. Sample Unit Information' }) && getByRole(host, 'heading', { name: '2. Distress Data' }) && getByRole(host, 'heading', { name: '3. Deduct Values' }), 'Reviewer sees the encoder workspace layout');
  check(!queryByRole(host, 'button', { name: 'Add distress' }) && !queryByLabelText(host, 'Distress length (m)') && !queryByText(host, 'Action'), 'Review workspace has no editing controls');
  check(getByText(host, 'SYNTHETIC orientation'), 'Saved orientation is shown read-only');
  check(getByRole(host, 'button', { name: 'Return for correction' }).getAttribute('aria-disabled') === 'true', 'Return requires comments');
  check(!queryByRole(host, 'button', { name: 'Publish result' }), 'Publish waits for approval');
  await React.act(async () => user.type(getByLabelText(host, 'Comments to the encoder (required to return)'), 'SYNTHETIC recheck width'));
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Return for correction' })));
  check(getByText(host, 'Return this inspection to the encoder?'), 'Return asks for confirmation');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Confirm return' })));
  check(requests.at(-1).action === 'return' && requests.at(-1).payload.comments === 'SYNTHETIC recheck width', 'Return sends the comments');
});
await test('reviewer-workspace-approve', async ({ host, root, user, Form }) => {
  role = 'reviewer'; width = 390;
  const computation = { id: 'synthetic-computation', sample_unit_id: baseline.id, input_revision: 3, edition: 'ASTM D6433-07', verification: 'pending', output_snapshot: syntheticOutput, created_at: '2026-11-08' };
  await React.act(async () => root.render(e(Form, { Editor: ReviewWorkspace, initial: { ...baseline, workflow_state: 'submitted', computation_id: computation.id }, computations: [computation] })));
  check(!queryByText(host, /This PCI is provisional/), 'No provisional disclaimer in the decision card');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Approve result' })));
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Confirm approval' })));
  check(requests.at(-1).action === 'approve', 'Approval is delivered to the server');
});
await test('synthetic-approval-simulation-keeps-backend-locked', async ({ host, root, user, Form }) => {
  role = 'reviewer';
  const DemoEditor = load('src/app/field-inspections.tsx', { ...inspectionDeps, '@/lib/ui/demo-preview': { DEMO_PREVIEW_ENABLED: true } }).InspectionEditor;
  await React.act(async () => root.render(e(Form, { initial: { ...baseline, workflow_state: 'submitted' }, initialStep: 'submit', Editor: DemoEditor })));
  check(getByRole(host, 'button', { name: 'Approve result' }).getAttribute('aria-disabled') === 'true', 'Approval without a saved PCI remains disabled');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Simulate approval (demo only)' })));
  check(getByText(host, /approval simulated on this screen only/), 'Simulation is explicitly local and provisional');
  check(requests.length === 0, 'Simulation does not call the workflow RPC');
  check(getByText(host, 'submitted'), 'Sample remains submitted');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Clear simulated approval' })));
  check(!queryByText(host, /approval simulated on this screen only/), 'Simulation can be cleared');
});
await test('missing-fields-and-description-fallback', async ({ host, root, user, Form }) => {
  role = 'encoder'; await React.act(async () => root.render(e(Form,{ initial:{ ...baseline, orientation_note:'', field_rules_confirmed:false, no_distress_confirmed:false }, initialStep:'submit', type:{ ...catalogType, astm_code:99 } })));
  check(getByRole(host,'button',{ name:'Submit for engineer review' }).getAttribute('aria-disabled') === 'true', 'Incomplete saved inspection cannot submit');
  check(getByRole(host,'alert').textContent.includes('orientation'), 'Missing requirements explain next correction');
  await React.act(async () => user.click(getByRole(host,'tab',{ name:'2. Distress measurements' })));
  await React.act(async () => user.selectOptions(getByLabelText(host,'Asphalt distress type *'),'synthetic-type'));
  check(getByText(host,/Distress-specific descriptions are unavailable/), 'Missing descriptions do not become invented ASTM text');
});
await test('navigation-and-permissions', async () => {
  for (const r of ['admin','reviewer','encoder','viewer']) check(navigation.navigationForRole(r).every(item => access.canAccess(r,item.route)), 'Navigation respects existing permission table');
  check(!access.canAccess('admin','/field-inspections'), 'Admin does not gain approval route');
  check(!access.canAccess('viewer','/users') && !access.canAccess('viewer','/field-inspections'), 'Viewer staff routes remain denied');
  check(access.canAccess('reviewer','/demo-priorities') && !access.canAccess('admin','/demo-priorities') && !access.canAccess('viewer','/demo-priorities') && !access.canAccess('encoder','/demo-priorities'), 'Preview route stays staff-only');
  check(navigation.navigationRoute('reviewer','/reports') === '/pci-results', 'Legacy reports activate consolidated destination');
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
  check(getByRole(host, 'button', { name: 'Open sample 1' }) && getByRole(host, 'button', { name: 'Open sample 2' }), 'Both assignments shown before filtering');
  await React.act(async () => user.click(getByRole(host, 'tab', { name: 'Returned' })));
  await React.act(async () => root.render(e(FieldInspections)));
  check(host.querySelector('[data-testid="lakad-content"]') === content, 'Status filter retains the workspace container');
  check(getByRole(host, 'tab', { name: 'Returned' }).getAttribute('aria-selected') === 'true', 'Selected status tab is marked');
  check(!queryByRole(host, 'button', { name: 'Open sample 1' }) && getByRole(host, 'button', { name: 'Open sample 2' }), 'New status selects only matching work');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Open sample 2' })));
  check(getByText(host, 'Loading inspection details…'), 'Editor waits for the selected sample’s full evidence fetch');
  check(!queryByRole(host, 'tablist', { name: 'Inspection steps' }), 'Incomplete register data does not mount the editor');
});
await test('distress-entry-adds-measured-parts', async ({ host, root, user }) => {
  role = 'encoder'; width = 1440;
  const alligator = { ...catalogType, id: 'synthetic-alligator', name: 'SYNTHETIC Alligator', astm_code: 1 };
  const linear = { ...catalogType, id: 'synthetic-linear', name: 'SYNTHETIC Linear', astm_code: 10, default_unit_of_measure: 'm' };
  function Entry() {
    const [sample, setSample] = React.useState({ ...baseline, workflow_state: 'planned', section_id: 'synthetic-section', orientation_note: '', field_rules_confirmed: false });
    const [records, setRecords] = React.useState([]), [error, setError] = React.useState(''), [computations, setComputations] = React.useState([]), [photos, setPhotos] = React.useState([]);
    update = (action, payload) => {
      if (action === 'photo') { setPhotos(list => [...list, { id: 'synthetic-photo-' + (list.length + 1), sample_unit_id: sample.id, photo_path: payload.path, caption: payload.caption, distress_record_id: payload.distress_record_id ?? null }]); return; }
      if (action === 'submit-report') {
        setComputations([{ id: 'synthetic-computation', edition: 'ASTM D6433-07', input_revision: sample.input_revision, verification: 'pending', output_snapshot: syntheticOutput }]);
        setSample(s => ({ ...s, workflow_state: 'submitted', computation_id: 'synthetic-computation' }));
        return;
      }
      if (action !== 'distress') return;
      setRecords(rows => [...rows.filter(r => r.id !== payload.id), { ...payload, id: payload.id ?? 'synthetic-record-' + (rows.length + 1), sample_unit_id: sample.id, measurement_details: { measurement_parts: payload.measurement_parts, severity_guidance: payload.severity_guidance } }]);
      setSample(s => ({ ...s, workflow_state: 'draft', input_revision: s.input_revision + 1 }));
    };
    const data = { types: [alligator, linear], distresses: records, sections: [{ id: 'synthetic-section', name: 'SYNTHETIC Section 01', branch_id: 'synthetic-branch' }], branches: [{ id: 'synthetic-branch', name: 'SYNTHETIC Branch 01' }], profiles: [], computations, photos, history: [], settings: {} };
    const run = async task => { try { await task(); setError(''); return true; } catch (ex) { setError(ex.message); return false; } };
    return e(DistressEntry, { sample, data, run, busy: false, error });
  }
  await React.act(async () => root.render(e(Entry)));
  check(getByText(host, 'SYNTHETIC Branch 01') && getByText(host, 'SYNTHETIC Section 01') && getByText(host, 'Sample Unit 1'), 'Branch, section and sample unit headings');
  check(getByLabelText(host, 'Sample unit length (m)') && getByLabelText(host, 'Sample unit width (m)') && getByRole(host, 'heading', { name: 'Sample Unit Area' }) && getByRole(host, 'heading', { name: 'Distress Measurement' }), 'Sample unit area and distress measurement are separate');
  check(!queryByText(host, 'Severity level'), 'Old severity readout is gone');
  check(['Sample Unit', 'Distress Data', 'Deduct Values', 'MDV', 'PCI Computation', 'PCI Rating'].every(label => getByLabelText(host, label + ': not done')), 'Inspection progress labels');
  await React.act(async () => { await user.type(getByLabelText(host, 'Distress length (m)'), '5'); await user.type(getByLabelText(host, 'Distress width (m)'), '2'); });
  check(getByLabelText(host, 'Computed area: 10 m²'), 'Area computes from length and width');
  await React.act(async () => user.selectOptions(getByLabelText(host, 'Distress type'), 'synthetic-alligator'));
  check(getByLabelText(host, 'Distress length (m)').value === '5', 'Choosing a distress type keeps the entered dimensions');
  const criteria = getAllByRole(host, 'radio');
  check(criteria.length === 3 && criteria.every(node => !/^(L|M|H|Low|Medium|High)/.test(node.textContent)), 'Criteria list descriptions only, without L/M/H labels');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add distress' })));
  check(getByRole(host, 'alert').textContent.includes('Choose the description'), 'Missing criterion is explained');
  await React.act(async () => user.click(getByRole(host, 'radio', { name: guidance.D07_SEVERITY_GUIDANCE[1].low })));
  check(getByRole(host, 'radio', { name: guidance.D07_SEVERITY_GUIDANCE[1].low }).getAttribute('aria-checked') === 'true', 'Chosen criterion is selected');
  check(getByLabelText(host, 'Severity level: Low'), 'Severity Level shows the chosen level under the choices');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add distress' })));
  check(requests[0].action === 'start' && requests[1].action === 'distress', 'Planned unit starts before its first distress');
  check(requests[1].version === baseline.action_version + 1, 'Distress uses the started revision tokens');
  check(requests[1].payload.severity === 'low' && requests[1].payload.id === null && requests[1].payload.quantity === 10, 'First part creates a low-severity record');
  check(requests[1].payload.measurement_parts[0].length_m === 5 && requests[1].payload.measurement_parts[0].width_m === 2, 'Rectangle part saved');
  check(getByLabelText(host, 'Row 1: SYNTHETIC Alligator, severity L, length 5 m, width 2 m, 10 m²'), 'Added distress appears in the table');
  check(getByLabelText(host, 'Distress length (m)').value === '' && getAllByRole(host, 'radio').every(node => node.getAttribute('aria-checked') !== 'true'), 'Entry clears after adding');
  check(getByRole(host, 'button', { name: 'Edit row 1, SYNTHETIC Alligator' }) && getByRole(host, 'button', { name: 'Delete row 1, SYNTHETIC Alligator' }), 'Each table row has Edit and Delete');
  check(getByRole(host, 'heading', { name: 'Distress photos' }) && getByLabelText(host, 'SYNTHETIC Alligator · Low: 0 photos'), 'Each distress gets its own photo group');
  const uploadsBefore = uploads;
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add photo' })));
  const photoRequest = requests.findLast(r => r.action === 'photo');
  check(uploads === uploadsBefore + 1 && photoRequest?.payload.distress_record_id === 'synthetic-record-1' && photoRequest.payload.caption === 'SYNTHETIC Alligator · Low', 'Add photo uploads a compressed photo linked to that distress');
  check(getByLabelText(host, 'SYNTHETIC Alligator · Low: 1 photo'), 'The photo appears under its distress');
  await React.act(async () => { await user.type(getByLabelText(host, 'Distress length (m)'), '3'); await user.type(getByLabelText(host, 'Distress width (m)'), '1'); });
  await React.act(async () => user.click(getByRole(host, 'radio', { name: guidance.D07_SEVERITY_GUIDANCE[1].low })));
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add distress' })));
  check(requests.length === 4 && requests[3].action === 'distress' && requests[3].payload.id === 'synthetic-record-1' && requests[3].payload.measurement_parts.length === 2 && requests[3].payload.quantity === 13, 'Same type and severity adds a part to the saved record (after the photo request)');
  check(getByLabelText(host, 'Row 2: SYNTHETIC Alligator, severity L, length 3 m, width 1 m, 3 m²'), 'Each measured part is its own table row');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Edit row 2, SYNTHETIC Alligator' })));
  check(getByLabelText(host, 'Distress length (m)').value === '3' && getByLabelText(host, 'Distress width (m)').value === '1' && getByRole(host, 'button', { name: 'Update distress' }), 'Edit loads the row into the form');
  await React.act(async () => { await user.clear(getByLabelText(host, 'Distress width (m)')); await user.type(getByLabelText(host, 'Distress width (m)'), '2'); });
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Update distress' })));
  const updated = requests.at(-1);
  check(updated.action === 'distress' && updated.payload.id === 'synthetic-record-1' && updated.payload.measurement_parts.length === 2 && updated.payload.measurement_parts[1].width_m === 2 && updated.payload.quantity === 16, 'Update replaces the edited part in its record');
  check(getByRole(host, 'button', { name: 'Add distress' }), 'Form returns to Add after updating');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Delete row 2, SYNTHETIC Alligator' })));
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Delete' })));
  const deleted = requests.at(-1);
  check(deleted.action === 'distress' && deleted.payload.id === 'synthetic-record-1' && deleted.payload.measurement_parts.length === 1 && deleted.payload.quantity === 10, 'Delete removes one part and keeps the record');
  await React.act(async () => user.selectOptions(getByLabelText(host, 'Distress type'), 'synthetic-linear'));
  check(!host.querySelector('[aria-label="Distress width (m)"]'), 'Linear distress needs no width');
  await React.act(async () => user.type(getByLabelText(host, 'Distress length (m)'), '4'));
  check(getByLabelText(host, 'Computed quantity: 4 m'), 'Linear quantity is the length');
  check(getByText(host, '3. Deduct Values') && getByLabelText(host, 'PCI rating not computed yet'), 'Results are visible before finishing, without data');
  check(getByLabelText(host, 'Deduct row 1: SYNTHETIC Alligator, Low, quantity not computed, density not computed, deduct value not computed'), 'Deduct table lists entered distress before computation');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Finish inspection' })));
  check(getByRole(host, 'button', { name: 'Finish and compute PCI' }).getAttribute('aria-disabled') === 'true', 'Finish needs orientation and the field-rule check');
  await React.act(async () => { await user.type(getByLabelText(host, 'Sample orientation / sketch description'), 'SYNTHETIC north to south'); await user.click(getByRole(host, 'checkbox', { name: /I checked severity/ })); });
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Finish and compute PCI' })));
  check(requests.at(-1).action === 'finish' && requests.at(-1).payload.orientation_note === 'SYNTHETIC north to south' && requests.at(-1).payload.no_distress_confirmed === false, 'Finish delivers the required details');
  check(getByLabelText(host, 'Total deduct value: 30.00') && getByLabelText(host, 'q: 1'), 'q of 1 or less uses the total deduct value');
  check(!queryByText(host, 'CDV Correction Details'), 'No CDV iteration table when q is 1 or less');
  check(getByLabelText(host, 'PCI 70.00 out of 100, condition Satisfactory') && getByLabelText(host, 'Pavement condition index: 70.00'), 'PCI and rating appear after finishing');
  check(getByLabelText(host, 'Deduct row 1: Alligator Cracking, Low, quantity 13 m², density 5.78, deduct value 30.00'), 'Saved deduct values fill the table');
  check(!queryByText(host, /SYNTHETIC policy note/) && !queryByText(host, /awaiting civil-engineering validation/), 'No provisional notice above the results');
  check(getByRole(host, 'button', { name: 'Add distress' }), 'Distress entry stays open until the report is submitted');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Submit Report' })));
  check(requests.at(-1).action === 'finish', 'Submit Report asks for confirmation first');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'Confirm and submit' })));
  check(requests.at(-1).action === 'submit-report', 'Submit Report delivers the submission');
  check(getByLabelText(host, 'PCI 70.00 out of 100, condition Satisfactory'), 'Saved results stay after submitting');
  check(!queryByRole(host, 'button', { name: 'Add distress' }) && !queryByRole(host, 'button', { name: 'Finish inspection' }) && !queryByRole(host, 'button', { name: 'Submit Report' }), 'Submitted report is locked');
});
await test('results-cdv-iteration-layout', async ({ host, root }) => {
  role = 'encoder'; width = 1440;
  const output = { status: 'provisional', groups: [{ code: 1, severity: 'medium', quantity: 40, unit: 'm²', density: 17.8, deduct_value: 60 }, { code: 10, severity: 'high', quantity: 30, unit: 'm', density: 13.3, deduct_value: 35 }], deduct_values: [60, 35], total_deduct_value: 95, q: 2, allowable_deducts: 4.6735, max_corrected_deduct_value: 68,
    iterations: [{ adjusted_deducts: [60, 35], q: 2, total_deduct_value: 95, corrected_deduct_value: 68 }, { adjusted_deducts: [60, 2], q: 1, total_deduct_value: 62, corrected_deduct_value: 62 }], pci: 32, condition: 'Very Poor' };
  const data = { types: [], distresses: [], computations: [], photos: [], history: [], profiles: [], settings: {} };
  await React.act(async () => root.render(e(InspectionResults, { palette: tokens.createPalette(false), sample: { ...baseline, workflow_state: 'submitted' }, data, output, confirming: false, busy: false, onCancel() {}, onConfirm() {} })));
  check(getByText(host, 'CDV Correction Details'), 'q above 1 shows the CDV iteration table');
  check(getByLabelText(host, 'Iteration 1: m 4.67, adjusted deducts 60.00, 35.00, TDV 95.00, q 2, CDV 68.00') && getByLabelText(host, 'Iteration 2: m 4.67, adjusted deducts 60.00, 2.00, TDV 62.00, q 1, CDV 62.00'), 'Each saved iteration is listed');
  check(getByLabelText(host, 'Maximum CDV: 68.00') && getByLabelText(host, 'q: 2'), 'Max CDV and q shown');
  check(!host.querySelector('[aria-label^="Total deduct value"]'), 'Total-deduct shortcut hidden when q is above 1');
  check(getByLabelText(host, 'PCI 32.00 out of 100, condition Very Poor'), 'Gauge shows PCI to 2 decimals and condition');
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
  check(compressed===uploads,'Every inspection photo is compressed before upload');
  await React.act(async () => user.click(getByRole(host,'button',{name:'Choose photograph'})));
  await React.act(async () => user.click(getByRole(host,'button',{name:'Discard selected photo'})));
  check(getByRole(host,'button',{name:'Continue to review and submit'}).getAttribute('aria-disabled')!=='true','Discard restores optional-photo continuation');
});
const evidence = process.argv.find(x => x.startsWith('--evidence='))?.slice(11);
if (evidence) { assert(evidence.startsWith('private-astm/')); fs.mkdirSync(evidence,{recursive:true}); fs.writeFileSync(evidence+'/task-flow-dom.json',JSON.stringify({ checks, results },null,2)); }
console.log(JSON.stringify({ checks, results, scope:'Synthetic React Native Web DOM interactions at phone/tablet/desktop branches. No browser geometry, screen-reader, physical device, or hosted approval claim.' }));
dom.window.close(); if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
