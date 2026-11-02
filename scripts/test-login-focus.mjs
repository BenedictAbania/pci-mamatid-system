import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('src/app/login.tsx', 'utf8');
// RN Fabric can blur a TextInput when its parent gains a native shadow on focus.
// Keep focus feedback on the border; web-only boxShadow is safe here.
for (const field of ['email', 'password']) {
  const focusedStyle = source.match(new RegExp(`focusedField === '${field}' && \\{([\\s\\S]*?)\\},\\s*\\]`))?.[1];
  assert(focusedStyle, `${field} has a focused wrapper style`);
  assert(!focusedStyle.includes('shadowColor'), `${field} must not change native shadowColor on focus`);
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/synthetic-login-focus', pretendToBeVisual: true,
});
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'ShadowRoot', 'Node', 'MutationObserver', 'Event', 'KeyboardEvent']) {
  globalThis[name] = dom.window[name];
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;

const React = require('react');
const { createRoot } = require('react-dom/client');
const native = require('react-native-web');
const { getByRole } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
let height = 844;
const rn = { ...native, useWindowDimensions: () => ({ width: 390, height, scale: 1, fontScale: 1 }) };
const icon = () => React.createElement('span', { 'aria-hidden': true });
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: name => /\.(jpg|png)$/.test(name) ? 'synthetic-asset' : ({
    '@expo/vector-icons': { Feather: icon },
    'expo-image': { Image: () => React.createElement('span'), ImageBackground: ({ children }) => React.createElement('div', null, children) },
    'expo-router': { useRouter: () => ({ push() {} }) },
    'react-native': rn,
    '@/lib/supabase': { supabase: { auth: { signInWithPassword: async () => ({ error: null }) } } },
    '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  })[name] ?? require(name),
};
vm.runInNewContext(code, context, { filename: 'src/app/login.tsx' });

const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const user = userEvent.setup({ document });
await React.act(async () => root.render(React.createElement(context.exports.default)));
const email = getByRole(host, 'textbox', { name: 'Email address' });
await React.act(async () => user.click(email));
assert.equal(document.activeElement, email, 'email retains focus after focus-state render');
height = 540; // approximate viewport resize when the on-screen keyboard appears
await React.act(async () => root.render(React.createElement(context.exports.default)));
assert.equal(document.activeElement, email, 'email retains focus after viewport resize');
await React.act(async () => user.type(email, 'synthetic@example.test'));
assert.equal(email.value, 'synthetic@example.test');

const password = host.querySelector('input[autocomplete="current-password"]');
assert(password, 'password input is rendered');
await React.act(async () => user.click(password));
assert.equal(document.activeElement, password, 'password retains focus after focus-state render');
await React.act(async () => user.type(password, 'Synthetic-only-123'));
assert.equal(password.value, 'Synthetic-only-123');

await React.act(async () => root.unmount());
host.remove();
console.log('PASS: focus styles avoid native shadow mutation; both fields retain focus and accept synthetic text across a viewport resize in React Native Web DOM. Physical iPhone validation remains pending.');
