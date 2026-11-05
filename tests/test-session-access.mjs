import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript-test-loader.mjs';
const { requireSessionAccess } = await import(await moduleUrl('src/lib/auth/session-access.ts'));
let checks = 0;
for (const role of ['admin', 'reviewer', 'encoder', 'viewer']) {
  assert.deepEqual(requireSessionAccess({ role, is_active: true }, null), { role, is_active: true }); checks++;
}
for (const code of ['PGRST202', '42883']) {
  assert.throws(() => requireSessionAccess(null, { code, message: 'PRIVATE BACKEND DETAILS' }), /does not match the connected database/); checks++;
  assert.throws(() => requireSessionAccess({ role: 'admin', is_active: true }, { code }), /does not match/); checks++;
}
for (const error of [{ code: '42501' }, { code: 'PGRST301' }, { message: 'Failed to fetch' }]) {
  assert.throws(() => requireSessionAccess(null, error), /Check your connection and retry/); checks++;
}
for (const data of [null, {}, { role: 'owner', is_active: true }, { user_metadata: { role: 'admin' } }]) {
  assert.throws(() => requireSessionAccess(data, null), /no supported LAKAD access profile/); checks++;
}
assert.throws(() => requireSessionAccess({ role: 'admin', is_active: false }, null), /deactivated/); checks++;
for (const is_active of [undefined, null, 'true', 1]) {
  assert.throws(() => requireSessionAccess({ role: 'admin', is_active }, null), /could not be verified/); checks++;
}
try { requireSessionAccess(null, { code: 'PGRST202', message: 'PRIVATE BACKEND DETAILS' }); }
catch (error) { assert.ok(!error.message.includes('PRIVATE BACKEND DETAILS')); checks++; }
console.log(`Passed ${checks} session access checks; missing services and unverified roles remain blocked.`);
