import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-mobile-layout', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'ShadowRoot', 'Node', 'MutationObserver', 'Event', 'KeyboardEvent']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;

const React = require('react');
const { createRoot } = require('react-dom/client');
const native = require('react-native-web');
const { getByRole, getByText, queryByRole, queryByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
let width = 390;
const rn = { ...native, useWindowDimensions: () => ({ width, height: 844, scale: 1, fontScale: 1 }) };
const Icon = () => React.createElement('span', { 'aria-hidden': true });
Icon.glyphMap = {};
function load(file, deps = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => name in deps ? deps[name] : /\.(png|jpg)$/.test(name) ? 'synthetic-asset' : require(name), HTMLElement, document };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
const access = load('src/lib/access.ts');
const design = load('src/lib/design-system.ts');
const identity = load('src/lib/account-display.ts');
const shell = load('src/components/admin/admin-shell.tsx', {
  'react-native': rn,
  '@expo/vector-icons': { Feather: Icon, MaterialCommunityIcons: Icon },
  'expo-image': { Image: () => React.createElement('span', { 'aria-hidden': true }) },
  'expo-router': { usePathname: () => '/field-inspections', useRouter: () => ({ push() {} }) },
  '@/lib/supabase': { supabase: { auth: { signOut: async () => {} } } },
  '@/providers/AuthProvider': { useAuth: () => ({ role: 'encoder', user: { email: 'synthetic@example.test' }, profile: { full_name: 'SYNTHETIC Inspector' } }) },
  '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  '@/lib/access': access, '@/lib/design-system': design, '@/lib/navigation': load('src/lib/navigation.ts', { './access': load('src/lib/access.ts') }), '@/lib/account-display': identity,
});
const pagination = load('src/components/workflow/pagination.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon },
  '@/components/admin/admin-shell': shell, '@/lib/design-system': design,
});
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host);
let search = '';
const controls = (page, hasNext) => React.createElement(pagination.PageControls, { page, hasNext, busy: false, next() {}, previous() {} });
const screen = (page, hasNext) => React.createElement(shell.AdminShell, {
  title: 'Field Inspections', subtitle: 'Assigned sample-unit inspections.', searchValue: search,
  onSearchChange: value => { search = value; }, onRefresh() {},
}, React.createElement(React.Fragment, null,
  React.createElement('div', null, 'Prototype / Provisional'),
  React.createElement(shell.AdminPanel, { title: 'Inspection register', palette: design.createPalette(false) },
    React.createElement('div', null, 'SYNTHETIC sample unit'), controls(page, hasNext))));

await React.act(async () => root.render(screen(1, false)));
const heading = getByRole(host, 'heading', { name: 'Field Inspections' });
const searchBox = getByRole(host, 'textbox', { name: 'Search field inspections on this page' });
assert(heading.compareDocumentPosition(searchBox) & Node.DOCUMENT_POSITION_FOLLOWING, 'phone search follows the page heading, outside the cramped toolbar');
assert(getByRole(host, 'button', { name: 'Open navigation' }));
assert(getByRole(host, 'button', { name: 'Refresh data' }));
assert(getByText(host, 'SYNTHETIC sample unit'));
assert(!queryByRole(host, 'button', { name: 'Previous page' }), 'single-page navigation stays hidden');
await React.act(async () => root.render(screen(2, true)));
assert(getByRole(host, 'button', { name: 'Previous page' }));
assert(getByRole(host, 'button', { name: 'Next page' }));
assert(getByText(host, 'Records · Page 2'));
await React.act(async () => userEvent.setup({ document }).click(searchBox));
assert.equal(document.activeElement, searchBox, 'mobile search accepts focus');

width = 820;
await React.act(async () => root.render(screen(2, true)));
assert(queryByText(host, 'Previous page'), 'tablet keeps labeled pagination');
const layoutSource = fs.readFileSync('src/app/_layout.tsx', 'utf8');
assert(layoutSource.includes('<SafeAreaProvider>') && layoutSource.includes("edges={['top', 'bottom']}"), 'native root applies top and bottom safe-area insets');
await React.act(async () => root.unmount()); host.remove();
console.log('PASS: phone shell separates search from toolbar, one-page pagination stays hidden, multi-page controls remain accessible, and root declares safe-area insets. JSDOM is not a physical iPhone.');
