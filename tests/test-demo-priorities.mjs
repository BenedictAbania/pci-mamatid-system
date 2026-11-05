import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { getByRole, getByLabelText, getByText, queryByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
const e = React.createElement;
function load(path, deps = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => name in deps ? deps[name] : require(name), process: { env: {} }, ...globals };
  vm.runInNewContext(code, context, { filename: path });
  return context.exports;
}
const calc = load('src/lib/pci/pci-service.ts');
const enabled = load('src/lib/ui/demo-preview.ts', {}, { process: { env: { EXPO_PUBLIC_LAKAD_DEMO_PREVIEW: 'true' } } });
const disabled = load('src/lib/ui/demo-preview.ts');
assert.equal(enabled.DEMO_PREVIEW_ENABLED, true);
assert.equal(disabled.DEMO_PREVIEW_ENABLED, false);
let role = 'reviewer', checks = 2;
const palette = { text: '#111', muted: '#555', border: '#ccc' };
const shell = {
  useAdminPalette: () => palette,
  AdminShell: ({ children, title }) => e('main', null, e('h1', null, title), children),
  AdminPanel: ({ children, title }) => e('section', null, e('h2', null, title), children),
  AdminButton: ({ label, onPress }) => e('button', { onClick: onPress }, label),
  AdminField: ({ label, value, onChangeText, placeholder }) => e('label', null, label, e('input', { 'aria-label': label, value, placeholder, onChange: event => onChangeText(event.target.value) })),
};
const shared = {
  Notice: ({ children, error }) => e('div', { role: error ? 'alert' : 'note' }, children),
  Choices: ({ label, value, options, onChange }) => e('div', { 'aria-label': label }, options.map(option => e('button', { key: option.value, role: 'radio', 'aria-checked': option.value === value, onClick: () => onChange(option.value) }, option.label))),
};
function screen(flag) {
  return load('src/app/demo-priorities.tsx', {
    'expo-router': { useRouter: () => ({ push() {} }) },
    'react-native': { View: ({ children }) => e('div', null, children), Text: ({ children }) => e('span', null, children) },
    '@/components/admin/admin-shell': shell, '@/components/workflow/shared': shared,
    '@/providers/AuthProvider': { useAuth: () => ({ role }) },
    '@/lib/ui/demo-preview': flag, '@/lib/pci/pci-service': calc,
  }).default;
}
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host), user = userEvent.setup({ document });
const Screen = screen(enabled);
await React.act(async () => root.render(e(Screen)));
assert(getByText(host, /not calculated from LAKAD inspections/)); checks++;
async function fill(label, value) { const input = getByLabelText(host, label); await React.act(async () => { await user.clear(input); await user.type(input, value); }); }
await fill('Synthetic section label', 'Ordinary road');
await fill('Hypothetical PCI (0–100; manually supplied)', '70');
await fill('Hypothetical affected area (m²)', '20');
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add synthetic scenario' })));
assert(getByRole(host, 'alert').textContent.includes('Start the section label')); checks++;
await fill('Synthetic section label', 'SYNTHETIC DEMO — AC-01');
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add synthetic scenario' })));
assert(getByText(host, /Rank 1.*AC-01.*hypothetical PCI 70/)); checks++;
await fill('Synthetic section label', 'SYNTHETIC DEMO — AC-02');
await fill('Hypothetical PCI (0–100; manually supplied)', '40');
await fill('Hypothetical affected area (m²)', '10');
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Add synthetic scenario' })));
assert(getByText(host, /Rank 1.*AC-02.*hypothetical PCI 40/)); checks++;
assert(getByText(host, /Rank 2.*AC-01.*hypothetical PCI 70/)); checks++;
await React.act(async () => user.click(getByRole(host, 'button', { name: 'Clear synthetic preview' })));
assert(!queryByText(host, /Rank 1.*AC-02/)); checks++;
role = 'viewer'; await React.act(async () => root.render(e(Screen)));
assert(getByRole(host, 'alert').textContent.includes('unavailable')); checks++;
assert(!queryByText(host, /Add a synthetic section scenario/)); checks++;
role = 'reviewer'; const DisabledScreen = screen(disabled);
await React.act(async () => root.render(e(DisabledScreen)));
assert(getByRole(host, 'alert').textContent.includes('unavailable')); checks++;
await React.act(async () => root.unmount()); host.remove();
console.log(`Passed ${checks} synthetic priority preview, role and opt-in checks. No database client was supplied.`);
