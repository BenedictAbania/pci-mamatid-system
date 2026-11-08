// My Profile window in the sidebar: actual React / React Native Web DOM with synthetic data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/synthetic-profile', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event', 'KeyboardEvent', 'ShadowRoot']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
const React = require('react'), { createRoot } = require('react-dom/client'), native = require('react-native-web'), e = React.createElement;
const { getByRole, getByLabelText, queryByRole, queryByText } = require('@testing-library/dom');
const userEvent = require('@testing-library/user-event').default;
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: n => n in deps ? deps[n] : /\.png$/.test(n) ? 'synthetic-asset' : require(n), document, HTMLElement, Promise };
  vm.runInNewContext(code, context, { filename: file }); return context.exports;
}
let checks = 0; const check = (v, m) => { assert(v, m); checks++; };
const rn = { ...native, useWindowDimensions: () => ({ width: 1440, height: 900, scale: 1, fontScale: 1 }) };
const Icon = () => e('span', { 'aria-hidden': true }); Icon.glyphMap = {};
let profile = { id: 'synthetic-reviewer', full_name: 'SYNTHETIC Civil Engineer', role: 'reviewer', office: 'SYNTHETIC Engineering Office', job_title: 'SYNTHETIC Engineer II', avatar_path: null };
let refreshes = 0, saves = [], saveError = '', passwords = [], passwordError = '';
const auth = { useAuth: () => ({ role: 'reviewer', user: { id: 'synthetic-reviewer', email: 'reviewer@synthetic.example' }, profile, refreshProfile: async () => { refreshes++; } }) };
const access = load('src/lib/auth/access.ts'), tokens = load('src/lib/ui/design-system.ts');
const navigation = load('src/lib/auth/navigation.ts', { './access': access });
const shell = load('src/components/admin/admin-shell.tsx', {
  'react-native': rn, '@expo/vector-icons': { Feather: Icon }, 'expo-router': { useRouter: () => ({ navigate() {} }), usePathname: () => '/dashboard' },
  '@/lib/data/supabase': { supabase: { auth: { signOut: async () => {} } } }, '@/providers/AuthProvider': auth,
  '@/providers/ThemeProvider': { useAppTheme: () => ({ colorScheme: 'light', toggleColorScheme() {} }) },
  '@/lib/auth/access': access, '@/lib/ui/design-system': tokens, '@/lib/auth/account-display': load('src/lib/auth/account-display.ts'), '@/lib/auth/navigation': navigation,
  '@/lib/data/profile-data': {
    PROFILE_PHOTO_MAX_BYTES: 2097152, PASSWORD_MIN_LENGTH: 8,
    changeOwnPassword: async (email, current, next) => { if (passwordError) throw new Error(passwordError); passwords.push({ email, current, next }); }, PROFILE_PHOTO_MESSAGE: 'Choose a JPEG, PNG or WebP photo up to 2 MB.',
    profilePhotoUrl: async path => `https://synthetic.example/${path}`,
    saveOwnProfile: async changes => { if (saveError) throw new Error(saveError); saves.push(changes); },
  },
  'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'blob:synthetic-photo', fileSize: 120000 }] }) },
});

const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host); const user = userEvent.setup({ document });
const page = () => e(shell.AdminShell, { title: 'Dashboard', subtitle: '' }, e(rn.Text, null, 'SYNTHETIC content'));
try {
  await React.act(async () => root.render(page()));
  const card = getByRole(host, 'button', { name: 'SYNTHETIC Civil Engineer, Reviewer' });
  check(card && card.textContent.includes('SC'), 'Sidebar profile is a button showing initials without a photo');
  await React.act(async () => user.click(card));
  const body = document.body;
  check(getByRole(body, 'heading', { name: 'My Profile' }), 'Clicking the profile opens My Profile');
  check(getByLabelText(body, 'Full name').value === 'SYNTHETIC Civil Engineer' && getByLabelText(body, 'Office or department').value === 'SYNTHETIC Engineering Office'
    && getByLabelText(body, 'Position or job title').value === 'SYNTHETIC Engineer II', 'Fields start from the saved profile');
  check(getByLabelText(body, 'Email').value === 'reviewer@synthetic.example' && getByLabelText(body, 'Email').readOnly && getByLabelText(body, 'Role: Reviewer') && getByRole(body, 'radio', { name: /^Reviewer:/ }).getAttribute('aria-checked') === 'true', 'Email and role are read-only');

  await React.act(async () => { await user.clear(getByLabelText(body, 'Full name')); });
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Save changes' })));
  check(queryByText(body, 'Enter your full name.') && !saves.length, 'Full name is required');

  await React.act(async () => user.type(getByLabelText(body, 'Full name'), 'SYNTHETIC Maria Engineer'));
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Add photo' })));
  check(getByLabelText(body, 'Profile photo of SYNTHETIC Maria Engineer') && getByRole(body, 'button', { name: 'Change photo' }), 'Chosen photo previews before saving');
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Save changes' })));
  check(saves.length === 1 && saves[0].fullName === 'SYNTHETIC Maria Engineer' && saves[0].photo.uri === 'blob:synthetic-photo' && saves[0].currentPath === null && saves[0].userId === 'synthetic-reviewer', 'Save sends the name and new photo');
  check(refreshes === 1 && !queryByRole(body, 'heading', { name: 'My Profile' }), 'Saving refreshes the profile and closes the window');

  // Saved photo replaces the initials; removing it is sent as 'remove'.
  profile = { ...profile, full_name: 'SYNTHETIC Maria Engineer', avatar_path: 'synthetic-reviewer/photo.png' };
  await React.act(async () => root.render(page()));
  check(getByLabelText(host, 'Profile photo of SYNTHETIC Maria Engineer'), 'Sidebar shows the saved photo');
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'SYNTHETIC Maria Engineer, Reviewer' })));
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Remove photo' })));
  check(getByRole(body, 'button', { name: 'Add photo' }), 'Removing switches back to Add photo');
  saveError = 'Full name required (150 characters or fewer)';
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Save changes' })));
  check(queryByText(body, 'Full name required (150 characters or fewer)') && getByRole(body, 'heading', { name: 'My Profile' }), 'Server errors stay in the window');
  saveError = '';
  await React.act(async () => user.click(getByRole(body, 'button', { name: 'Save changes' })));
  check(saves.at(-1).photo === 'remove' && saves.at(-1).currentPath === 'synthetic-reviewer/photo.png', 'Remove photo is saved');

  // Change password: validated in the window, current password confirmed by the data layer.
  await React.act(async () => user.click(getByRole(host, 'button', { name: 'SYNTHETIC Maria Engineer, Reviewer' })));
  check(getByLabelText(body, 'Current password').type === 'password' && getByLabelText(body, 'New password').type === 'password', 'Password fields hide the typed text');
  const changePw = () => React.act(async () => user.click(getByRole(body, 'button', { name: 'Change password' })));
  await changePw();
  check(queryByText(body, 'Fill in all three password fields.') && !passwords.length, 'All password fields are required');
  await React.act(async () => { await user.type(getByLabelText(body, 'Current password'), 'synthetic-old-1'); await user.type(getByLabelText(body, 'New password'), 'short'); await user.type(getByLabelText(body, 'Confirm new password'), 'short'); });
  await changePw();
  check(queryByText(body, 'Use at least 8 characters for the new password.'), 'New password needs 8 characters');
  await React.act(async () => { await user.clear(getByLabelText(body, 'New password')); await user.type(getByLabelText(body, 'New password'), 'synthetic-new-22'); await user.clear(getByLabelText(body, 'Confirm new password')); await user.type(getByLabelText(body, 'Confirm new password'), 'synthetic-new-23'); });
  await changePw();
  check(queryByText(body, 'The new passwords do not match.'), 'Confirmation must match');
  await React.act(async () => { await user.clear(getByLabelText(body, 'Confirm new password')); await user.type(getByLabelText(body, 'Confirm new password'), 'synthetic-new-22'); });
  passwordError = 'Your current password is incorrect.';
  await changePw();
  check(queryByText(body, 'Your current password is incorrect.') && !passwords.length, 'Wrong current password is reported');
  passwordError = '';
  await changePw();
  check(passwords.length === 1 && passwords[0].email === 'reviewer@synthetic.example' && passwords[0].current === 'synthetic-old-1' && passwords[0].next === 'synthetic-new-22', 'Password change sends email, current and new password');
  check(queryByText(body, /Password changed\./) && getByLabelText(body, 'Current password').value === '' && getByRole(body, 'heading', { name: 'My Profile' }), 'Success clears the fields and keeps the window open');
  console.log(`Passed ${checks} My Profile checks (React Native Web DOM; synthetic data, no hosted storage).`);
} finally {
  await React.act(async () => root.unmount()); host.remove(); dom.window.close();
}
