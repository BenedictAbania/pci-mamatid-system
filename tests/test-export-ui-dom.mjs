import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const before = process.argv.includes('--before');
const evidence = process.argv.find(x => x.startsWith('--evidence='))?.slice('--evidence='.length);
if (evidence) { assert(evidence.startsWith('private-astm/')); fs.mkdirSync(evidence, { recursive: true }); }
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-dom-tests', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'ShadowRoot', 'Node', 'MutationObserver', 'Event']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Layout/resize are outside this DOM interaction test's scope.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
const React = require('react'), { createRoot } = require('react-dom/client');
const { getByLabelText, getAllByLabelText, getByText, queryByText, queryByRole } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
const native = require('react-native-web');
function load(file, deps = {}) {
  const filename = (before ? 'private-astm/defect-fixes-2026-10-07/before/' : '') + file + (before ? '.source' : '');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : require(n), window, document };
  vm.runInNewContext(code, context, { filename }); return context.exports;
}
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const results = [];
async function test(id, scenario, task) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try { results.push({ id, scenario, status: before ? 'REPRODUCED' : 'PASS', actual: await task(host, root) }); }
  catch (e) { results.push({ id, scenario, status: 'FAIL', actual: e.message }); }
  finally { await React.act(async () => root.unmount()); host.remove(); }
}
const fieldDeps = { 'react-native': native, '@expo/vector-icons': {}, 'expo-image': {}, 'expo-router': {}, '@/lib/data/supabase': {}, '@/providers/AuthProvider': {}, '@/providers/ThemeProvider': {}, '@/lib/auth/access': {}, '@/lib/ui/design-system': load('src/lib/ui/design-system.ts'), '@/lib/auth/navigation': load('src/lib/auth/navigation.ts', { './access': load('src/lib/auth/access.ts') }), '@/lib/auth/account-display': load('src/lib/auth/account-display.ts') };
await test('D04', 'Real RN Web DOM: select by label, Tab/Shift-Tab, typing and duplicate labels', async (host, root) => {
  const { AdminField } = load('src/components/admin/admin-shell.tsx', fieldDeps);
  const labels = ['Measured sample area (m², 135–315)', 'Inspection date (YYYY-MM-DD)', 'Sample orientation / sketch description (§8.2)', 'General inspection notes'];
  function Fields({ duplicate = false }) {
    const [values, setValues] = React.useState(['', '', '', '']);
    return React.createElement(React.Fragment, null, ...labels.map((label, i) => React.createElement(AdminField, { key: label, label, palette: {}, value: values[i], multiline: i > 1, onChangeText: v => setValues(old => old.map((x, j) => i === j ? v : x)) })), duplicate && React.createElement(AdminField, { label: labels[0], palette: {}, value: '', onChangeText() {} }));
  }
  await React.act(async () => root.render(React.createElement(Fields)));
  if (evidence) fs.writeFileSync(evidence + '/labels-dom-' + (before ? 'before' : 'after') + '.html', host.outerHTML);
  if (before) { assert.throws(() => getByLabelText(host, labels[0])); checks++; return 'Label query fails against original rendered input; reproduced'; }
  const user = userEvent.setup({ document });
  const inputs = labels.map(label => getByLabelText(host, label, { exact: true }));
  for (const input of inputs) check(input.matches('input,textarea'), 'Label selects the input, not decorative text');
  const values = ['225', '2026-10-07', 'SYNTHETIC northbound sketch', 'SYNTHETIC notes'];
  for (let i = 0; i < inputs.length; i++) {
    await React.act(async () => user.tab()); check(document.activeElement === inputs[i], 'Tab follows field order');
    await React.act(async () => user.keyboard(values[i])); check(inputs[i].value === values[i], 'Keyboard updates controlled input');
  }
  await React.act(async () => user.tab({ shift: true })); check(document.activeElement === inputs[2], 'Shift-Tab returns to orientation');
  await React.act(async () => root.render(React.createElement(Fields, { duplicate: true })));
  const duplicates = getAllByLabelText(host, labels[0], { exact: true }); check(duplicates.length === 2, 'Duplicate visible labels remain separate fields');
  check(duplicates[0].getAttribute('aria-labelledby') !== duplicates[1].getAttribute('aria-labelledby'), 'Unique label IDs');
  return 'Actual React/RN Web DOM label queries and simulated keyboard focus/typing passed; not a browser/device/screen-reader test';
});

await test('D03', 'Actual React effects: initial failure, refresh failure, retry, empty success and saved history selection', async (host, root) => {
  let reply = { error: 'SYNTHETIC 503' };
  const response = key => reply.error ? Promise.reject(new Error(reply.error)) : Promise.resolve(reply[key]);
  const e = React.createElement;
  const shell = ({ children, onRefresh, loading }) => e('div', null, e('button', { onClick: onRefresh }, 'Refresh data'), loading && e('div', null, 'Updating synthetic test'), children);
  const button = ({ label, onPress, disabled }) => e('button', { onClick: onPress, disabled }, label);
  const panel = ({ title, children }) => e('section', null, e('h2', null, title), children);
  const deps = {
    'react-native': native, '@/components/admin/admin-shell': { AdminShell: shell, AdminButton: button, AdminPanel: panel, AdminEmpty: ({ message }) => e('div', null, message), useAdminPalette: () => ({}) },
    './shared': { Notice: ({ children, error }) => e('div', { role: error ? 'alert' : undefined }, children) }, './task-tabs': load('src/components/workflow/task-tabs.tsx', {'react-native': native, '@/components/admin/admin-shell': { useAdminPalette: () => ({}) }}), './pagination': { PageControls: () => null },
    '@/lib/data/approved-data': { REPORT_PAGE_SIZE: 50, loadApprovedPage: () => response('page'), loadApprovedSummary: () => response('summary'), loadSectionReportPage: () => response('sections') },
    '@/lib/data/approved-results': load('src/lib/data/approved-results.ts'), '@/lib/utils/admin-utils': { formatDate: v => String(v), downloadCsv() {} },
    '@/providers/AuthProvider': { useAuth: () => ({ role: 'viewer' }) }, '@/components/workflow/photo-card': {},
    'expo-router': { useRouter: () => ({ push() {} }) }, '@/lib/ui/demo-preview': { DEMO_PREVIEW_ENABLED: false },
  };
  const { ApprovedReports } = load('src/components/workflow/approved-reports.tsx', deps);
  await React.act(async () => root.render(e(ApprovedReports, { title: 'SYNTHETIC mock reports', mode: 'reports' })));
  if (!before) { check(queryByRole(host, 'alert'), 'Initial error visible'); check(!queryByText(host, 'No published, approved results are available in this scope. Check again after eligible results are published.'), 'Initial failure is not empty success'); check(!queryByText(host, 'Current approved sample results'), 'Initial failure has no summary'); }
  const row = { id: 'SYNTHETIC-history', input_revision: 1, is_current: false, published_at: '2026-10-01', sample_unit_id: 'SYNTHETIC-unit', report_snapshot: { road: { branch_name: 'SYNTHETIC branch', section_name: 'SYNTHETIC old label' }, sample: { unit_number: 1, surveyed_at: '2026-10-01', area_sqm: 225, inspection_notes: 'SYNTHETIC saved history', latitude: null, longitude: null }, output: { pci: 70, condition: 'FICTIONAL' }, historical_context_available: true, edition: 'FICTIONAL', reference_id: 'SYNTHETIC', algorithm_version: 'TEST ONLY', distresses: [], photos: [] } };
  const success = { page: [row], summary: { count: 1, average: 70 }, sections: [] };
  const user = userEvent.setup({ document });
  reply = success; await React.act(async () => user.click(getByText(host, 'Refresh data')));
  check(getByText(host, 'Current approved sample results'), 'Summary appears on success');
  await React.act(async () => user.click(getByText(host, 'Published history')));
  await React.act(async () => user.click(getByText(host, /SYNTHETIC branch \/ SYNTHETIC old label/)));
  check(getByText(host, 'Saved approved snapshot'), 'History selected');
  if (!before) {
    let finishPending;
    reply = { ...success, page: new Promise(resolve => { finishPending = resolve; }) };
    const previous = getByText(host, 'SYNTHETIC saved history');
    await React.act(async () => user.click(getByText(host, 'Refresh data')));
    check(getByText(host, 'SYNTHETIC saved history') === previous, 'Saved snapshot node remains mounted during pending refresh');
    check(getByText(host, 'Updating synthetic test'), 'Inline loading status is shown');
    await React.act(async () => finishPending([row]));
    check(getByText(host, 'SYNTHETIC saved history') === previous, 'Matching snapshot stays mounted after refresh');
  }
  reply = { error: 'SYNTHETIC 503' }; await React.act(async () => user.click(getByText(host, 'Refresh data')));
  if (evidence) fs.writeFileSync(evidence + '/failed-refresh-dom-' + (before ? 'before' : 'after') + '.html', host.outerHTML);
  if (before) { check(queryByText(host, 'Current approved sample results') && queryByText(host, 'No published, approved results are available in this scope. Check again after eligible results are published.'), 'Original DOM has stale summary plus false empty state'); return 'Refresh defect reproduced in actual React DOM/effects'; }
  check(queryByRole(host, 'alert'), 'Refresh failure visible');
  check(getByText(host, 'Current approved sample results'), 'Matching summary remains visible');
  check(!queryByText(host, 'No published, approved results are available in this scope. Check again after eligible results are published.'), 'No false empty state');
  check(getByText(host, 'Saved approved snapshot'), 'Matching saved selection remains visible');
  check(queryByText(host, /Showing previously loaded data for this view/), 'Previous data is explicitly marked stale');
  reply = success; await React.act(async () => user.click(getByText(host, 'Retry reports')));
  check(!queryByRole(host, 'alert'), 'Retry clears failure');
  check(getByText(host, 'Saved approved snapshot'), 'Historical selection restored');
  check(getByText(host, 'SYNTHETIC saved history'), 'Saved snapshot intact');
  let printed=0; window.print=()=>{printed++;};
  await React.act(async()=>user.click(getByText(host,'Print / Save PDF')));
  check(printed===1,'Print action delivered; print rendering still requires a browser');
  reply = { page: [], summary: { count: 0, average: null }, sections: [] }; await React.act(async () => user.click(getByText(host, 'Refresh data')));
  check(getByText(host, 'No published, approved results are available in this scope. Check again after eligible results are published.'), 'Genuine empty response uses empty state');
  check(!queryByRole(host, 'alert'), 'Genuine empty is not error');
  return 'Actual React effect/event transitions passed with fictional API responses; no publication or engineering approval';
});
const summary = { before, scope: 'jsdom DOM emulation with actual React/RN Web; simulated keyboard/events; NOT browser/screen-reader validation', checks, results };
if (evidence) fs.writeFileSync(evidence + '/dom-' + (before ? 'reproduction' : 'results') + '.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
dom.window.close();
if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
