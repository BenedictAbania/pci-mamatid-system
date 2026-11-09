import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-viewer', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event', 'KeyboardEvent', 'ShadowRoot']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
const React = require('react'), { createRoot } = require('react-dom/client'), native = require('react-native-web'), e = React.createElement;
const { getByRole, getByLabelText, getByText, queryByText, getAllByRole } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : /\.png$/.test(n) ? 'synthetic-asset' : require(n), document, HTMLElement };
  vm.runInNewContext(code, context, { filename: file }); return context.exports;
}
let checks = 0; const check = (v, m) => { assert(v, m); checks++; };
const rn = { ...native, useWindowDimensions: () => ({ width: 1440, height: 900, scale: 1, fontScale: 1 }) };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
const auth = { useAuth: () => ({ role: 'viewer', user: { id: 'synthetic-viewer' }, profile: { full_name: 'SYNTHETIC Viewer' } }) };
const access = load('src/lib/auth/access.ts'), tokens = load('src/lib/ui/design-system.ts');
const navigation = load('src/lib/auth/navigation.ts', { './access': access });
let pathname = '/sample-summaries';
const shell = load('src/components/admin/admin-shell.tsx', {'@/lib/data/profile-data': { profilePhotoUrl: async () => '', saveOwnProfile: async () => {}, PROFILE_PHOTO_MAX_BYTES: 2097152, PROFILE_PHOTO_MESSAGE: '' }, 'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: true, assets: null }) }, 
  'react-native': rn, '@expo/vector-icons': { Feather: Icon }, 'expo-router': { useRouter: () => ({ navigate() {} }), usePathname: () => pathname },
  '@/lib/data/supabase': {}, '@/providers/AuthProvider': auth, '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  '@/lib/auth/access': access, '@/lib/ui/design-system': tokens, '@/lib/auth/account-display': load('src/lib/auth/account-display.ts'), '@/lib/auth/navigation': navigation,
});
const shared = load('src/components/workflow/shared.tsx', { 'react-native': rn, 'expo-router': {}, '@/providers/AuthProvider': auth, '@/components/admin/admin-shell': shell, '@/lib/data/workflow-data': {}, '@/lib/ui/design-system': tokens });
const pagination = load('src/components/workflow/pagination.tsx', { 'react-native': rn, '@expo/vector-icons': { Feather: Icon }, '@/components/admin/admin-shell': shell, '@/lib/ui/design-system': tokens });
const parts = load('src/components/summaries/summary-parts.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon }, '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared,
  '@/components/workflow/photo-card': { PhotoCard: () => null }, '@/components/workflow/distress-photos': { PhotoGroups: () => null, photoGroups: () => [], distressLabel: name => name }, '@/lib/ui/design-system': tokens, '@/lib/pci/pci-classification': load('src/lib/pci/pci-classification.ts'),
  '@/lib/d6433-07/catalog': load('supabase/functions/_shared/d6433-07/catalog.ts'), '@/lib/utils/admin-utils': { formatDate: v => v ?? 'Not recorded' },
});

// Query builder: filters run in the database, against the frozen published snapshot.
let calls = [];
const chain = new Proxy({}, { get: (_, name) => name === 'then' ? (resolve => resolve({ data: [], error: null, count: 0 })) : (...args) => { calls.push([name, ...args]); return chain; } });
const summaryData = load('src/lib/data/summary-data.ts', { './supabase': { supabase: { from: table => { calls.push(['from', table]); return chain; } } }, './approved-data': { loadSectionReportPage: async () => [] } });
await summaryData.loadSampleSummaries({ branch: 'SYNTHETIC Branch', section: 'SYNTHETIC Section', condition: 'Fair', sampleType: 'random', search: '' }, null, 5);
const has = (...expected) => calls.some(call => JSON.stringify(call) === JSON.stringify(expected));
check(has('from', 'approved_results') && has('eq', 'is_current', true) && has('not', 'published_at', 'is', null), 'Only current published results');
check(has('eq', 'report_snapshot->road->>branch_name', 'SYNTHETIC Branch') && has('eq', 'report_snapshot->road->>section_name', 'SYNTHETIC Section'), 'Branch and section filter the snapshot');
check(has('eq', 'report_snapshot->output->>condition', 'Fair') && has('eq', 'report_snapshot->sample->>sample_type', 'random') && has('limit', 5), 'Condition, sample type and preview limit');
calls = [];
await summaryData.loadSampleSummaries({ ...summaryData.EMPTY_FILTERS, search: 'SU-007' }, null, 5);
check(has('eq', 'report_snapshot->sample->>unit_number', '7'), 'Sample unit ID search matches the unit number');
calls = [];
await summaryData.loadSampleSummaries({ ...summaryData.EMPTY_FILTERS, search: 'Rizal, (x)*' }, null, 5);
check(calls.some(call => call[0] === 'or' && call[1].includes('ilike.*Rizal') && !/[(),]x|\*\)/.test(call[1].split('ilike.')[1])), 'Free-text search is sanitized for the or() filter');

// Screen: synthetic published snapshots.
const snapshot = (n, branch, section, pci, condition) => ({ id: `synthetic-${n}`, sample_unit_id: `unit-${n}`, input_revision: 1, approved_at: '2026-11-01', published_at: '2026-11-02', is_current: true, superseded_at: null,
  report_snapshot: { historical_context_available: true, sample: { id: `unit-${n}`, unit_number: n, area_sqm: 225, sample_type: 'random', surveyed_at: '2026-10-30', latitude: null, longitude: null, inspection_notes: null },
    road: { section_id: 's', section_name: section, branch_name: branch }, distresses: [{ id: 'd', name: 'Alligator Cracking', severity: 'low', quantity: 10, unit_of_measure: 'm²', notes: null }], photos: [],
    edition: 'ASTM D6433-07', reference_id: 'r', algorithm_version: 'a', output: { pci, condition, deduct_values: [100 - pci], q: 1, iterations: [], total_deduct_value: 100 - pci, max_corrected_deduct_value: 100 - pci, status: 'provisional' } } });
const all = [snapshot(1, 'SYNTHETIC Branch A', 'Section 01', 86.5, 'Good'), snapshot(2, 'SYNTHETIC Branch A', 'Section 02', 73.2, 'Satisfactory'), snapshot(3, 'SYNTHETIC Branch B', 'Section 03', 58.4, 'Fair'),
  snapshot(4, 'SYNTHETIC Branch B', 'Section 04', 42.3, 'Poor'), snapshot(5, 'SYNTHETIC Branch B', 'Section 05', 28.5, 'Very Poor'), snapshot(6, 'SYNTHETIC Branch C', 'Section 06', 12, 'Serious')];
let requests = [], sectionRequests = [];
const sectionRow = { id: 'sec-1', section_id: 's1', section_name: 'Section 01', branch_name: 'SYNTHETIC Branch A', pci: 78.4, condition: 'Satisfactory', method: 'D6433-07 §11.1', published_at: '2026-11-03',
  area_sqm: 3375, total_sample_units: 15, inspected: 2, samples: [
    { id: 'synthetic-1', unit_number: 1, sample_type: 'random', area_sqm: 225, pci: 86.5, condition: 'Good' },
    { id: 'synthetic-2', unit_number: 2, sample_type: 'random', area_sqm: 225, pci: 70.3, condition: 'Satisfactory' }] };
const data = { SUMMARY_PAGE_SIZE: 50, SUMMARY_PREVIEW_ROWS: 5, EMPTY_FILTERS: summaryData.EMPTY_FILTERS,
  loadSampleSummaries: async (filters, after, limit) => { requests.push({ filters, after, limit }); const rows = all.filter(r => !filters.branch || r.report_snapshot.road.branch_name === filters.branch); return { rows: rows.slice(0, limit), total: rows.length }; },
  loadSummaryOptions: async () => ({ branches: ['SYNTHETIC Branch A', 'SYNTHETIC Branch B', 'SYNTHETIC Branch C'], sectionsByBranch: { 'SYNTHETIC Branch A': ['Section 01', 'Section 02'] } }),
  loadApprovedResult: async id => all.find(r => r.id === id),
  loadSectionSummaries: async (filters, offset, limit) => {
    sectionRequests.push({ filters, offset, limit });
    const sections = [sectionRow].filter(r => !filters.condition || r.condition === filters.condition);
    return { total: sections.length, rows: sections.slice(offset, offset + limit), options: { branches: ['SYNTHETIC Branch A'], sectionsByBranch: { 'SYNTHETIC Branch A': ['Section 01'] } } };
  } };
const classification = load('src/lib/pci/pci-classification.ts');
const theme = { useAppTheme: () => ({ colorScheme: 'light' }) };
const frame = load('src/components/summaries/report-frame.tsx', { 'react-native': rn, '@expo/vector-icons': { Feather: Icon }, '@/components/admin/admin-shell': shell, '@/lib/ui/design-system': tokens, '@/lib/pci/pci-classification': classification });
const modal = load('src/components/summaries/sample-report-modal.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon }, '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared,
  '@/components/workflow/photo-card': { PhotoCard: () => null }, '@/components/workflow/distress-photos': { PhotoGroups: () => null, photoGroups: () => [], distressLabel: name => name }, '@/lib/pci/pci-classification': classification, './report-frame': frame,
  '@/lib/pci/severity-colors': load('src/lib/pci/severity-colors.ts'), '@/lib/d6433-07/catalog': load('supabase/functions/_shared/d6433-07/catalog.ts'),
  '@/lib/utils/admin-utils': { formatDate: v => v ?? 'Not recorded' }, '@/providers/ThemeProvider': theme,
});
const sectionModal = load('src/components/summaries/section-report-modal.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon }, '@/components/admin/admin-shell': shell, './report-frame': frame, '@/providers/ThemeProvider': theme,
  '@/lib/data/summary-data': { sectionBreakdown: summaryData.sectionBreakdown },
});
const deps = { './sample-report-modal': modal, './section-report-modal': sectionModal, 'react-native': rn, '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared, '@/components/workflow/pagination': pagination, './summary-parts': parts, '@/lib/data/summary-data': data, '@/lib/utils/admin-utils': { formatDate: v => v } };
const { SampleSummaries } = load('src/components/summaries/sample-summaries.tsx', deps);
const { SectionSummaries } = load('src/components/summaries/section-summaries.tsx', deps);

const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
const user = userEvent.setup({ document });
await React.act(async () => root.render(e(SampleSummaries)));
check(getByRole(host, 'heading', { name: 'Sample Units Summaries' }), 'Page title');
const nav = host.querySelector('[data-testid="lakad-navigation"]');
check(['Dashboard', 'Sample Units Summaries', 'Sections Summaries'].every(name => getByRole(nav, 'button', { name })) && getAllByRole(nav, 'button').length === 5, 'Exactly three viewer navigation buttons plus My Profile and sign out');
check(['Sample Unit', 'Branch', 'Section', 'PCI', 'Condition Rating', 'Action'].every(name => getByText(host, name, { selector: 'div' })), 'Table columns include Branch');
check(getByLabelText(host, 'SU-001, SYNTHETIC Branch A, Section 01, PCI 86.50, Good'), 'Rows show the branch of each sample unit');
check(getByText(host, 'Showing 5 of 6 results') && requests.at(-1).limit === 5, 'Preview shows five of the total');
check(!queryByText(host, /civil-engineering validation/), 'No provisional notice on the summaries');
await React.act(async () => user.click(getByRole(host, 'link', { name: 'View all results' })));
check(requests.at(-1).limit === 50 && getByText(host, 'Showing 6 of 6 results'), 'View all loads the full page');
await React.act(async () => user.selectOptions(getByLabelText(host, 'Branch'), 'SYNTHETIC Branch A'));
check(getByLabelText(host, 'Section').querySelectorAll('option').length === 3, 'Section choices follow the chosen branch');
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Apply' })));
check(requests.at(-1).filters.branch === 'SYNTHETIC Branch A' && getByText(host, 'Showing 2 of 2 results'), 'Apply sends the branch filter');
await React.act(async () => user.click(getByRole(host, 'link', { name: /View SU-002/ })));
const body = document.body;
check(getByRole(body, 'heading', { name: 'Sample Unit PCI Results - 002' }), 'View opens the sample unit report');
check(getByLabelText(body, 'Branch: SYNTHETIC Branch A') && getByLabelText(body, 'Section: Section 02') && getByLabelText(body, 'Sample Unit Area: 225 m²') && getByLabelText(body, 'Sample Type: Random'), 'Overview lists sample unit information');
check(getByLabelText(body, 'Final PCI 73.20') && getByText(body, 'Satisfactory Condition') && getByLabelText(body, 'Satisfactory, PCI 70-84, this sample unit'), 'Overview shows final PCI and highlights its rating band');
await React.act(async () => user.click(getByRole(body, 'tab', { name: 'Distresses' })));
check(getByLabelText(body, 'Distress 1: Alligator Cracking, low, 10.0 m², density 4.44%') && getByText(body, /Distresses are recorded based on ASTM D6433-07/), 'Distresses tab lists quantity, unit and density');
await React.act(async () => user.click(getByRole(body, 'tab', { name: 'Computation' })));
check(getByLabelText(body, 'Deduct value 1: 26.80') && getByLabelText(body, 'Maximum CDV: 26.80') && getByLabelText(body, 'PCI = 100 - Maximum CDV = 100 - 26.80 = 73.20'), 'Computation tab shows DVs, maximum CDV and the formula');
await React.act(async () => user.click(getByRole(body, 'button', { name: 'Close Sample Unit PCI Results - 002' })));
check(!queryByText(body, 'Sample Unit PCI Results - 002'), 'Close dismisses the report');
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Clear' })));
check(requests.at(-1).filters.branch === '' && getByText(host, 'Showing 6 of 6 results'), 'Clear resets the filters');
await React.act(async () => user.type(getByLabelText(host, 'Search Sample Unit ID, Sections, or Branch'), '4'));
check(requests.at(-1).filters.search === '4', 'Header search filters the results');
await React.act(async () => root.unmount());

pathname = '/section-summaries';
const host2 = document.createElement('div'); document.body.append(host2); const root2 = createRoot(host2);
await React.act(async () => root2.render(e(SectionSummaries)));
check(getByRole(host2, 'heading', { name: 'Section Summaries' }) && getByText(host2, '1 Section'), 'Section page title and section count');
check(['Total Samples', 'Inspected', 'Section PCI'].every(name => getByText(host2, name, { selector: 'div' })), 'Section table columns');
check(getByLabelText(host2, 'Section 01, SYNTHETIC Branch A, 15 total samples, 2 inspected, PCI 78.40, Satisfactory') && sectionRequests.at(-1).limit === 5, 'Section rows show totals, inspected count and PCI');
await React.act(async () => user.click(getByRole(host2, 'link', { name: /View Section 01/ })));
check(getByRole(body, 'heading', { name: 'Section Details - Section 01' }) && getByLabelText(body, 'Pavement Type: Asphalt (AC)') && getByLabelText(body, 'Section Area: 3,375 m²') && getByLabelText(body, 'Inspected Sample Units: 2'), 'Section overview');
check(getByLabelText(body, 'Section PCI 78.40'), 'Section PCI card');
await React.act(async () => user.click(getByRole(body, 'tab', { name: 'Sample Units' })));
check(getByLabelText(body, 'SU-001, random, 225.0 m², PCI 86.50, Good'), 'Sample Units tab lists inspected units');
await React.act(async () => user.click(getByRole(body, 'tab', { name: 'Computation' })));
check(getByLabelText(body, 'SU-002: PCI 70.30 × 225 = 15,817.5') && getByLabelText(body, 'PCIr = 35,280 ÷ 450 = 78.40') && getByText(body, 'PCIs = PCIr'), 'Computation tab shows the area-weighted random mean');
await React.act(async () => user.click(getByRole(body, 'tab', { name: 'Sample Units' })));
await React.act(async () => user.click(getByRole(body, 'button', { name: 'View SU-001' })));
check(getByRole(body, 'heading', { name: 'Sample Unit PCI Results - 001' }), 'Sample unit report opens from the section');
await React.act(async () => user.click(getByRole(body, 'button', { name: 'Close Sample Unit PCI Results - 001' })));
check(getByRole(body, 'heading', { name: 'Section Details - Section 01' }), 'Closing the sample report returns to the section');
await React.act(async () => user.click(getByRole(body, 'button', { name: 'Close Section Details - Section 01' })));
await React.act(async () => user.selectOptions(getByLabelText(host2, 'Condition Rating'), 'Good'));
await React.act(async () => user.click(getByRole(host2, 'button', { name: 'Apply' })));
check(sectionRequests.at(-1).filters.condition === 'Good' && getByText(host2, /No published sections match these filters/), 'Condition filter runs in the data request');
await React.act(async () => root2.unmount());
check(navigation.navigationRoute('viewer', '/pci-results') === '/sample-summaries' && access.canAccess('viewer', '/section-summaries') && !access.canAccess('encoder', '/sample-summaries'), 'Viewer routes and legacy highlighting');
console.log(`Passed ${checks} viewer summary checks with synthetic data (React Native Web DOM; no hosted data).`);
