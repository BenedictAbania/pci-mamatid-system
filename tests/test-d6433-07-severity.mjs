import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript-test-loader.mjs';

const { D07_SEVERITY_GUIDANCE, D07_GUIDANCE_VERSION, d07GuidanceFor, d07GuidanceSnapshot } = await import(await moduleUrl('src/lib/d6433-07/severity-guidance.ts'));
const codes = Object.keys(D07_SEVERITY_GUIDANCE).map(Number).sort((a, b) => a - b);
assert.deepEqual(codes, Array.from({ length: 19 }, (_, i) => i + 1));
let checks = 0;
for (const code of codes) {
  const guidance = d07GuidanceFor('ASTM D6433-07', code);
  assert(guidance.source.startsWith('X1.'), `Source missing for ${code}`);
  if (code === 12) {
    assert(guidance.none?.includes('No severity level'));
    assert(!guidance.low && !guidance.medium && !guidance.high);
    const snapshot = d07GuidanceSnapshot(code, null);
    assert.equal(snapshot.severity, null);
    assert.equal(snapshot.version, D07_GUIDANCE_VERSION);
  } else {
    for (const severity of ['low', 'medium', 'high']) {
      assert(guidance[severity]?.length > 20, `${code} ${severity} missing a distress-specific cue`);
      const snapshot = d07GuidanceSnapshot(code, severity);
      assert.equal(snapshot.severity, severity);
      assert.equal(snapshot.text, guidance[severity]);
      assert.equal(snapshot.status, 'provisional');
      assert.equal(snapshot.version, D07_GUIDANCE_VERSION);
    }
    assert.equal(d07GuidanceSnapshot(code, null), null);
  }
  checks++;
}
assert.equal(d07GuidanceFor('ASTM D6433-24', 1), undefined, 'D24 must never borrow D07 guidance');
assert.equal(d07GuidanceFor('ASTM D6433-07', 20), undefined, 'Unknown D07 type must not invent wording');
assert.equal(d07GuidanceSnapshot(12, 'low'), null, 'Polished Aggregate must not allow L/M/H');
console.log(`Passed ${checks} D6433-07 distress-type guidance checks, including the no-severity type and edition isolation.`);
