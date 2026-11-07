import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'ShadowRoot', 'Node', 'MutationObserver', 'Event']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const native = require('react-native-web');
const { getByRole, getAllByRole, getByText, queryByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
const e = React.createElement;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;

function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => name in deps ? deps[name] : /\.png$|\.jpg$/.test(name) ? 'synthetic-asset' : require(name) };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}

let width = 1440;
let role = null;
let session = null;
let destinations = [];
const Icon = () => e('span', { 'aria-hidden': true });
Icon.glyphMap = {};
const access = load('src/lib/auth/access.ts');
const { default: LandingPage } = load('src/app/index.tsx', {
  '@expo/vector-icons': { Feather: Icon },
  'expo-image': {
    Image: ({ accessibilityLabel }) => e('span', { 'aria-label': accessibilityLabel }),
    ImageBackground: ({ children, accessibilityLabel }) => e('div', { 'aria-label': accessibilityLabel }, children),
  },
  'expo-router': { useRouter: () => ({ navigate: path => destinations.push(path) }) },
  'react-native': { ...native, useWindowDimensions: () => ({ width, height: 900, scale: 1, fontScale: 1 }) },
  '@/lib/auth/access': access,
  '@/lib/ui/design-system': load('src/lib/ui/design-system.ts'),
  '@/providers/AuthProvider': { useAuth: () => ({ role, session }) },
  '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light' }) },
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await React.act(async () => root.render(e(LandingPage)));
  return { host, root, user: userEvent.setup({ document }) };
}
async function close({ host, root }) { await React.act(async () => root.unmount()); host.remove(); }

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
let page = await renderPage();
check(getByText(page.host, /Better Road Decisions/), 'Public landing hero renders');
check(!queryByText(page.host, /Prototype \/ Provisional:/), 'Removed landing-page warning stays absent');
check(!queryByText(page.host, /Average PCI|486|72\.4|Surveyed Road Map/), 'No copied sample metrics or map');
await React.act(async () => page.user.click(getByRole(page.host, 'button', { name: 'Sign in' })));
check(destinations.at(-1) === '/login', 'Signed-out sign-in opens login route');
await React.act(async () => page.user.click(getByRole(page.host, 'button', { name: 'Access Your Workspace' })));
check(destinations.at(-1) === '/login', 'Public hero action opens login route');
await close(page);

role = 'reviewer'; session = { user: { id: 'synthetic-session' } }; width = 390; destinations = [];
page = await renderPage();
check(getByRole(page.host, 'button', { name: 'Open menu' }), 'Phone has a menu control');
await React.act(async () => page.user.click(getByRole(page.host, 'button', { name: 'Open menu' })));
check(getByRole(page.host, 'navigation', { name: 'Landing page navigation' }), 'Phone menu exposes navigation');
await React.act(async () => page.user.click(getAllByRole(page.host, 'button', { name: 'Open my workspace' })[0]));
check(destinations.at(-1) === access.homeForRole('reviewer'), 'Authenticated CE opens own workspace');
await close(page);

const shell = fs.readFileSync('src/app/_layout.tsx', 'utf8');
check(shell.includes("const isLandingRoute = pathname === '/';") && shell.includes("const isLoginRoute = pathname === '/login';"), 'Root and sign-in are distinct routes');
check(shell.includes("router.replace('/login')") && shell.includes('!isLandingRoute && (error ||'), 'Protected-route fallback uses login; landing stays public');
console.log(`Passed ${checks} landing page and routing checks (synthetic DOM; browser visual inspection separate).`);
