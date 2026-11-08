import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript-test-loader.mjs';

const catalog = await import(await moduleUrl('src/lib/d6433-07/catalog.ts'));
const curves = await import(await moduleUrl('src/lib/d6433-07/curves.ts'));
const sample = await import(await moduleUrl('src/lib/d6433-07/sample.ts'));
const section = await import(await moduleUrl('src/lib/d6433-07/section.ts'));
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const close = (actual, expected) => { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); checks++; };
const fails = (fn, pattern) => { assert.throws(fn, pattern); checks++; };
const input = (observations, more = {}) => ({ edition: catalog.EDITION, area_sqm: 225, observations,
  no_distress_confirmed: observations.length === 0, field_rules_confirmed: true, ...more });
const obs = (code, severity, quantity) => ({ code, severity, quantity, unit: catalog.definition(code).unit });

eq(catalog.EDITION, 'ASTM D6433-07');
eq(catalog.ASPHALT_CATALOG.length, 19);
eq(catalog.definition(19).name, 'Weathering and Raveling');
eq(catalog.definition(19).severities, ['low', 'medium', 'high']);
fails(() => catalog.definition(20), /Unsupported/);
eq(catalog.condition(49), 'Poor');
eq(sample.calculateSample(input([])).pci, 100);
fails(() => sample.calculateSample(input([], { no_distress_confirmed: false })), /Empty/);
fails(() => sample.calculateSample(input([obs(19, 'low', 10)])), /Private/);
fails(() => sample.combineObservations(input([obs(20, 'low', 10)])), /Unsupported/);
eq(sample.combineObservations(input([obs(1, 'low', 4), obs(1, 'low', 6), obs(1, 'medium', 5)]))
  .map(row => [row.severity, row.quantity]), [['low', 10], ['medium', 5]]);

// All coordinates below are fictional mechanical fixtures, not D6433-07 curve readings.
const pack = { edition: catalog.EDITION, id: 'FICTIONAL-D07', source_sha256: 'a'.repeat(64),
  usage: 'private-server', permission_record: 'fictional', reviewed_by: 'fictional',
  interpolation_review: 'fictional', dv: {}, cdv: {} };
for (const d of catalog.ASPHALT_CATALOG) for (const severity of d.severities.length ? d.severities : [null])
  pack.dv[curves.curveKey(d.code, severity)] = { figure: d.figure, x_scale: 'log10', points: [[0.1, 1], [1, 10], [100, 60]] };
for (let q = 2; q <= 7; q++) pack.cdv[q] = { figure: 'X3.26', x_scale: 'linear', points: [[0, 0], [100, 100 / q], [300, 100]] };
const reader = curves.privateCurveReader(pack, 'b'.repeat(64));
fails(() => curves.privateCurveReader({ ...pack, edition: 'ASTM D6433-24' }, 'b'.repeat(64)), /provenance/);
fails(() => curves.privateCurveReader({ ...pack, dv: { ...pack.dv, '20:low': pack.dv['19:low'] } }, 'b'.repeat(64)), /legacy DV/);
fails(() => curves.privateCurveReader({ ...pack, cdv: { ...pack.cdv, 8: pack.cdv[7] } }, 'b'.repeat(64)), /Unsupported CDV/);
fails(() => reader.corrected(80, 8), /No supplied/);
close(reader.deduct(19, 'medium', 10), 35);
fails(() => reader.deduct(19, 'medium', 0.01), /outside/);

// Provisional reader: unreviewed packages run with recorded hold/scale/q policies.
const unsigned = { ...pack, permission_record: '', reviewed_by: '', interpolation_review: '' };
fails(() => curves.privateCurveReader(unsigned, 'b'.repeat(64)), /provenance/);
const provisional = curves.provisionalCurveReader(unsigned, 'b'.repeat(64));
close(provisional.deduct(19, 'medium', 10), 35);
eq(provisional.notes.length, 0);
close(provisional.deduct(19, 'medium', 0.01), 1);
close(provisional.deduct(19, 'medium', 150), 60);
eq(provisional.notes.length, 2);
close(provisional.corrected(80, 8), provisional.corrected(80, 7));
eq(provisional.notes.some(text => /q = 8 has no curve/.test(text)), true);
const late = curves.provisionalCurveReader({ ...unsigned, cdv: { ...unsigned.cdv, 6: { figure: 'X3.26', x_scale: 'linear', points: [[40, 20], [200, 90]] } } }, 'b'.repeat(64));
close(late.corrected(20, 6), 10);
close(late.corrected(250, 6), 90);
fails(() => curves.provisionalCurveReader({ ...unsigned, usage: 'public' }, 'b'.repeat(64)), /private/);
const flagged = sample.calculateSample(input([obs(19, 'medium', 0.01)]), curves.provisionalCurveReader(unsigned, 'b'.repeat(64)));
eq(flagged.provisional_notes.length, 1);
eq(sample.calculateSample(input([obs(1, 'low', 4)]), reader).provisional_notes, []);

const mixed = sample.calculateSample(input([obs(1, 'low', 4), obs(1, 'medium', 6)]), reader);
eq(mixed.groups.length, 2); // D07 §9.1: distinct severity groups, no D24 §9.6.2 alternatives.
eq(mixed.observed_groups.map(row => row.quantity), [4, 6]);
close(mixed.observed_groups[0].density, 4 / 225 * 100);
eq('severity_alternatives' in mixed, false);
const shortcut = sample.calculateSample(input([obs(1, 'low', 2)]), reader);
eq(shortcut.iterations.length, 0);
close(shortcut.pci, 100 - shortcut.total_deduct_value);

const correction = sample.correctDeducts([25.1, 23.4, 17.9, 11.2, 7.9, 7.5, 6.9, 5.3], { corrected: (tdv, q) => tdv / q });
close(correction.allowable_deducts, 1 + 9 / 98 * (100 - 25.1));
close(correction.iterations[0].adjusted_deducts[7], 5.3 * (correction.allowable_deducts - 7));
eq(correction.iterations.map(row => row.q), [8, 7, 6, 5, 4, 3, 2, 1]);
fails(() => sample.calculateSample(input(Array.from({ length: 8 }, (_, i) => obs(i + 1, 'low', 20))), {
  id: 'fictional', digest: 'x', deduct: () => 10, corrected: (_, q) => reader.corrected(80, q),
}), /No supplied/);

const unit = (id, area_sqm, pci, sample_type = 'random') => ({ id, computation_id: `c-${id}`, area_sqm, pci,
  sample_type, is_current: true, approved: true, edition: catalog.EDITION });
const sectionInput = { area_sqm: 2250, total_sample_units: 10, required_random_ids: ['a', 'b'],
  samples: [unit('a', 225, 80), unit('b', 150, 50), unit('c', 225, 20, 'additional')] };
const result = section.calculateSection(sectionInput);
close(result.random_mean, 68);
close(result.pci, (68 * 2025 + 20 * 225) / 2250);
eq(result.weights, { a: 0.54, b: 0.36, c: 0.1 });
close(section.calculateSection({ ...sectionInput, area_sqm: 600, total_sample_units: 3 }).pci, 50);
fails(() => section.calculateSection({ ...sectionInput, samples: [unit('a', 225, 80), unit('b', 150, 50),
  { ...unit('c', 225, 20, 'additional'), edition: 'ASTM D6433-24' }] }), /current/);
eq(section.minimumRandomSamples(18), 9);
console.log(`Passed ${checks} D6433-07 provisional structure and arithmetic checks using fictional curves.`);
