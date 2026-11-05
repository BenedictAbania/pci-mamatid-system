import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const before = process.argv.includes('--before');
const evidenceArg = process.argv.find(x => x.startsWith('--evidence='));
const evidence = evidenceArg?.slice('--evidence='.length);
if (evidence) { assert(evidence.startsWith('private-astm/')); fs.mkdirSync(evidence, { recursive: true }); }
const prefix = before ? 'private-astm/defect-fixes-2026-10-07/before/' : '';
function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(prefix + file + (before ? '.source' : ''), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => name in dependencies ? dependencies[name] : require(name), ...globals };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
let checks = 0;
const results = [];
async function test(id, scenario, task) {
  try { const actual = await task(); results.push({ id, scenario, status: before ? 'REPRODUCED' : 'PASS', actual: actual ?? 'Assertions passed' }); }
  catch (error) { results.push({ id, scenario, status: 'FAIL', actual: error.message }); }
}
function check(value, message) { assert(value, message); checks++; }
function equal(a, b) { assert.deepEqual(a, b); checks++; }
let captured, clicked = false, attached = false, removed = false, revoked = false, timers = [];
const link = { style: {}, click() { clicked = true; }, remove() { removed = true; } };
const csv = load('src/lib/utils/admin-utils.ts', { 'react-native': { Platform: { OS: 'web' }, Alert: {} } }, {
  window: {}, document: { createElement: () => link, body: { appendChild() { attached = true; } } }, Blob,
  URL: { createObjectURL(blob) { captured = blob; return 'blob:SYNTHETIC'; }, revokeObjectURL() { revoked = true; } },
  setTimeout(callback, delay) { timers.push({ callback, delay }); },
});
function parseCsv(text) {
  const rows = [[]]; let cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ',') { rows.at(-1).push(cell); cell = ''; }
    else if (!quoted && c === '\r' && text[i + 1] === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; }
    else cell += c;
  }
  assert(!quoted); rows.at(-1).push(cell); return rows;
}
await test('F01', 'Actual CSV bytes: formula policy, numbers, escaping and unchanged source', async () => {
  const dangerous = ['=1+1', '+1+1', '-1+1', '@SUM(1,1)', ' =1+1', '  +1+1', '\t=1+1', '\r=1+1', ' \tordinary', '\nordinary', '\u00a0\r @SUM(1,1)', '\u0000=1+1', '＝1+1', '＋1+1', '－1+1', '＠SUM(1,1)', '-12'];
  const benign = ['Road, Section', 'Quote "example"', 'road","=1+1', 'line one\nline two', 'line one\r\nline two', 'Unicode § m²', '  ordinary road', '', null, -12, -0.25, 0, 1e-7];
  const rows = [...dangerous, ...benign].map(x => Object.freeze([x])); Object.freeze(rows);
  const original = JSON.stringify(rows);
  csv.downloadCsv('SYNTHETIC-spreadsheet-policy.csv', rows);
  const bytes = Buffer.from(await captured.arrayBuffer());
  if (evidence) fs.writeFileSync(evidence + '/synthetic-policy-' + (before ? 'before' : 'after') + '.csv', bytes);
  const parsed = parseCsv(bytes.toString('utf8')).flat();
  equal(JSON.stringify(rows), original);
  if (before) {
    equal(parsed[0], '=1+1'); check(revoked, 'Old implementation revokes URL immediately');
    return 'Unsafe formula text retained and Blob URL revoked immediately; reproduced from original source.';
  }
  equal([...bytes.subarray(0, 3)], [239, 187, 191]);
  dangerous.forEach((value, i) => equal(parsed[i], 'Text: ' + value));
  benign.forEach((value, i) => equal(parsed[dangerous.length + i], value === null ? '' : String(value)));
  for (const n of [NaN, Infinity, -Infinity]) { assert.throws(() => csv.serializeCsv([[n]]), /finite/); checks++; }
  check(clicked && attached, 'Real download helper clicks an attached anchor'); check(!revoked && !removed, 'Blob retained until scheduled cleanup');
  equal(timers.length, 1); equal(timers[0].delay, 1000); timers[0].callback(); check(revoked && removed, 'URL/anchor released after timer');
  return `${bytes.length} actual Blob bytes checked; no browser/spreadsheet claim`;
});

// Execute the actual component and its hooks against deterministic dependency responses.
// This is a local component harness, not a DOM/browser or screen-reader test.
function componentHarness(mode = 'reports') {
  const slots = []; let index = 0, pending = [], tree, backend = { page: [], summary: { count: 0, average: null }, sections: [] };
  const same = (a, b) => a?.length === b?.length && a.every((x, i) => Object.is(x, b[i]));
  const hooks = {
    useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(value) { const i = index++; return (slots[i] ??= { current: value }); },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; pending.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const element = (type, props) => ({ type, props: props ?? {} });
  const dependencies = {
    react: hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Linking: {}, Platform: { OS: 'web' }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@/components/admin/admin-shell': { AdminButton: 'AdminButton', AdminEmpty: 'AdminEmpty', AdminPanel: 'AdminPanel', AdminShell: 'AdminShell', useAdminPalette: () => ({}) },
    './shared': { Notice: 'Notice' }, './task-tabs': { TaskTabs: 'TaskTabs' }, './pagination': { PageControls: 'PageControls' },
    '@/lib/data/approved-data': { REPORT_PAGE_SIZE: 50, loadApprovedPage: () => backend.error ? Promise.reject(new Error(backend.error)) : Promise.resolve(backend.page), loadApprovedSummary: () => backend.error ? Promise.reject(new Error(backend.error)) : Promise.resolve(backend.summary), loadSectionReportPage: () => backend.error ? Promise.reject(new Error(backend.error)) : Promise.resolve(backend.sections) },
    '@/lib/data/approved-results': load('src/lib/data/approved-results.ts'), '@/lib/utils/admin-utils': csv,
    '@/providers/AuthProvider': { useAuth: () => ({ role: 'viewer' }) }, '@/components/workflow/photo-card': { PhotoCard: 'PhotoCard' },
    'expo-router': { useRouter: () => ({ push() {} }) }, '@/lib/ui/demo-preview': { DEMO_PREVIEW_ENABLED: false },
  };
  const { ApprovedReports } = load('src/components/workflow/approved-reports.tsx', dependencies);
  function render() { index = 0; tree = ApprovedReports({ title: 'SYNTHETIC reports', mode }); const effects = pending; pending = []; effects.forEach(f => f()); return tree; }
  function nodes() { const all = []; const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { all.push(n); if (n.type !== 'AdminShell' || !n.props.loading) walk(n.props.children); } }; walk(tree); return all; }
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  return { render, settle, nodes, setBackend: data => { backend = data; }, refresh: () => tree.props.onRefresh(), button: label => nodes().find(n => n.type === 'AdminButton' && n.props.label === label), tree: () => tree };
}
const sampleRow = { id: 'SYNTHETIC-HISTORY', sample_unit_id: 'SYNTHETIC-SAMPLE', input_revision: 1, is_current: false, approved_at: '2026-10-01', published_at: '2026-10-02', report_snapshot: { historical_context_available: true, road: { branch_name: '=1+1', section_name: 'SYNTHETIC saved label' }, sample: { unit_number: 1, surveyed_at: '2026-10-01', area_sqm: 225, inspection_notes: 'SYNTHETIC saved notes', latitude: null, longitude: null }, edition: 'FICTIONAL UI FIXTURE', reference_id: 'SYNTHETIC', algorithm_version: 'TEST ONLY', photos: [], distresses: [], output: { pci: 70, condition: 'FICTIONAL', total_deduct_value: 0, max_corrected_deduct_value: 0 } } };
await test('F03', 'Initial failure, success/failure/retry, real empty state and historical selection', async () => {
  for (const mode of ['reports', 'rankings']) {
    const h = componentHarness(mode); h.setBackend({ error: 'SYNTHETIC HTTP 503' }); h.render(); await h.settle();
    if (!before) { check(!h.nodes().some(n => n.type === 'AdminEmpty'), 'Initial error must not imply empty results'); check(!h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === 'Current approved sample results'), 'Initial error must not show zero totals'); }
    const success = { page: [sampleRow], summary: { count: 1, average: 70 }, sections: [{ id: 'SYNTHETIC-SECTION', rank: 1, pci: 70, condition: 'FICTIONAL', affected_area: 1, high_severity: 0, road_snapshot: { section_name: 'SYNTHETIC ranking' } }] };
    h.setBackend(success); await h.refresh(); h.render();
    check(h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === (mode === 'rankings' ? 'Current section priorities' : 'Current approved sample results')), 'Success shows the appropriate scope summary');
    if (!before) {
      const unchanged = JSON.stringify(success);
      h.button('Download this page CSV').props.onPress();
      const bytes = Buffer.from(await captured.arrayBuffer());
      const exported = parseCsv(bytes.toString('utf8'));
      if (mode === 'reports') { equal(exported[1][0], 'Text: =1+1'); equal(exported[1][5], '225'); }
      else { equal(exported[1][0], '1'); equal(exported[1][2], '70'); }
      equal(JSON.stringify(success), unchanged);
      if (evidence) fs.writeFileSync(evidence + '/synthetic-' + mode + '-caller.csv', bytes);
    }
    if (mode === 'reports') {
      h.nodes().find(n=>n.type==='TaskTabs').props.onChange('history'); h.render(); await h.settle();
      h.nodes().find(n => n.type === 'Pressable').props.onPress(); h.render();
      check(h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === 'Saved approved snapshot'), 'History selection works');
    }
    h.setBackend({ error: 'SYNTHETIC HTTP 503' }); await h.refresh(); h.render();
    const stale = h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === 'Current approved sample results');
    const falseEmpty = h.nodes().some(n => n.type === 'AdminEmpty');
    if (before) { check(stale && falseEmpty, 'Reproduce stale totals plus false empty state'); continue; }
    if (mode === 'reports') check(stale, 'Failed refresh retains the matching summary');
    check(!falseEmpty, 'Failure suppresses empty claim');
    if (mode === 'reports') check(h.nodes().some(n => n.type === 'Pressable'), 'Failed refresh retains matching result rows');
    if (mode === 'reports') check(h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === 'Saved approved snapshot'), 'Saved historical selection remains in the matching scope');
    check(h.nodes().some(n => n.type === 'Notice' && n.props.error), 'Error remains visible');
    check(JSON.stringify(h.nodes()).includes('Showing previously loaded data for this view'), 'Retained data is explicitly marked stale');
    h.setBackend(success); await h.button('Retry reports').props.onPress(); await h.settle();
    check(!h.nodes().some(n => n.type === 'Notice' && n.props.error), 'Retry clears error');
    if (mode === 'reports') check(h.nodes().some(n => n.type === 'AdminPanel' && n.props.title === 'Saved approved snapshot'), 'Retry preserves historical ID selection');
    h.setBackend({ page: [], summary: { count: 0, average: null }, sections: [] }); await h.refresh(); h.render();
    check(h.nodes().some(n => n.type === 'AdminEmpty'), 'Successful empty response has actual empty state');
    check(!h.nodes().some(n => n.type === 'Notice' && n.props.error), 'Empty success is not an error');
  }
  return before ? 'Stale summary and false empty state reproduced in reports and rankings' : 'Actual component hooks passed report/ranking transitions and historical retry selection; no browser claim';
});

await test('F04', 'Actual React Native Web markup: area/date/orientation/notes labels and validation alert', () => {
  const native = require('react-native-web');
  const { AdminField } = load('src/components/admin/admin-shell.tsx', {
    'react-native': native, '@expo/vector-icons': {}, 'expo-image': { Image: () => null }, 'expo-router': {},
    '@/lib/data/supabase': {}, '@/providers/AuthProvider': {}, '@/providers/ThemeProvider': {}, '@/lib/auth/access': {},
    '@/lib/ui/design-system': load('src/lib/ui/design-system.ts'), '@/lib/auth/navigation': load('src/lib/auth/navigation.ts', { './access': load('src/lib/auth/access.ts') }), '@/lib/auth/account-display': load('src/lib/auth/account-display.ts'),
  });
  const labels = ['Measured sample area (m², 135–315)', 'Inspection date (YYYY-MM-DD)', 'Sample orientation / sketch description (§8.2)', 'General inspection notes'];
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...labels.map((label, i) => React.createElement(AdminField, { key: label, label, multiline: i > 1, value: '', onChangeText() {}, palette: {} }))));
  if (evidence) fs.writeFileSync(evidence + '/synthetic-labels-' + (before ? 'before' : 'after') + '.html', html);
  const refs = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(x => x[1]);
  if (before) { equal(refs.length, 0); check(!html.includes('aria-label=')); return 'Original representative textboxes have no accessible names or visible-label associations'; }
  equal(refs.length, 4); equal(new Set(refs).size, 4);
  for (const id of refs) check(html.includes('id="' + id + '"'), 'Input references existing visible label');
  for (const label of labels) check(html.includes('aria-label="' + label + '"'), 'Meaningful fallback accessible name');
  check(html.includes('<input') && html.includes('<textarea'), 'Single and multiline fields covered');
  check(!html.includes('tabindex="-1"'), 'Editable fields are not excluded from normal tab navigation');
  const { Notice } = load('src/components/workflow/shared.tsx', { 'react-native': native, 'expo-router': {}, '@/providers/AuthProvider': {}, '@/components/admin/admin-shell': { useAdminPalette: () => ({}) }, '@/lib/data/workflow-data': {} });
  const error = renderToStaticMarkup(React.createElement(Notice, { error: true }, 'Measured area must be 135–315 m².'));
  check(error.includes('role="alert"') && error.includes('aria-live="polite"'), 'Validation notice is an accessible alert');
  return 'Actual RN Web SSR markup verified; live label selection, keyboard and screen-reader testing pending';
});
if (!before) await test('F02', 'Application photo-size helper: below / exact / above and invalid sizes', () => {
  const { PHOTO_MAX_BYTES, validatePhotoSize } = load('src/lib/utils/inspection-photo.ts');
  equal(PHOTO_MAX_BYTES, 5_242_880);
  for (const size of [1, PHOTO_MAX_BYTES - 1, PHOTO_MAX_BYTES]) { validatePhotoSize(size); checks++; }
  for (const size of [0, -1, 0.5, NaN, Infinity, PHOTO_MAX_BYTES + 1]) { assert.throws(() => validatePhotoSize(size), /5 MiB/); checks++; }
  return 'Shared application validator passes exact byte boundaries independently of Storage';
});
const summary = { scope: 'Executed local serializer/component-hook/React Native Web markup tests; not browser or spreadsheet validation', before, checks, results };
if (evidence) fs.writeFileSync(evidence + '/' + (before ? 'reproduction' : 'targeted-results') + '.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
