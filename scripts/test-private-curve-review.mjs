import assert from 'node:assert/strict';
import path from 'node:path';
import { DEFAULT_PACKAGE, curves, sample, section, sha256, loadReviewPackage,
  reviewCurveReader, readPrivateFile, demoCase, runReviewCase } from './private-curve-review.mjs';
import { reviewMarkdown } from './review-private-curves.mjs';

let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const close = (a, b, message) => { assert.ok(Math.abs(a - b) < 1e-9, message + ': ' + a + ' vs ' + b); checks++; };
const rejects = (f, pattern) => { assert.throws(f, pattern); checks++; };
const loaded = await loadReviewPackage();
const { pack, digest } = loaded;
const reader = reviewCurveReader(pack, digest);
eq(loaded.inventory.length, 33, 'Supplied review manifest is complete');
eq(Object.keys(pack.dv).length, 57);
eq(Object.keys(pack.cdv), ['2', '3', '4', '5', '6', '7']);
eq(pack.approved_for_calculation, false);
eq([pack.reviewed_by, pack.permission_record, pack.interpolation_review], [null, null, null]);
rejects(() => curves.privateCurveReader(pack, digest), /provenance-reviewed/);
for (const changed of [{ approved_for_calculation: true }, { usage: 'private-server' }, { reviewed_by: 'invented' }, { permission_record: 'invented' }, { interpolation_review: 'invented' }]) {
  rejects(() => reviewCurveReader({ ...pack, ...changed }, digest), /unapproved review-only/);
}
const missing = structuredClone(pack); delete missing.dv['20:high'];
rejects(() => reviewCurveReader(missing, digest), /Missing/);
rejects(() => reviewCurveReader({ ...pack, cdv: { ...pack.cdv, 8: pack.cdv['7'] } }, digest), /Unsupported CDV/);

// Mechanical tests of supplied nodes are not independent engineering expected values.
for (const [key, c] of Object.entries(pack.dv)) {
  const [code, sev] = key.split(':');
  const lookup = x => reader.deduct(Number(code), sev === 'none' ? null : sev, x);
  for (const point of [c.points[0], c.points.at(-1)]) close(lookup(point[0]), point[1], 'Exact DV endpoint');
  const i = Math.floor(c.points.length / 2), a = c.points[i - 1], b = c.points[i];
  close(lookup(Math.sqrt(a[0] * b[0])), (a[1] + b[1]) / 2, 'Semilog midpoint, no rounding');
  rejects(() => lookup(c.points[0][0] * 0.999), /outside/);
  rejects(() => lookup(c.points.at(-1)[0] * 1.001), /outside/);
}
for (const [key, c] of Object.entries(pack.cdv)) {
  const lookup = x => reader.corrected(x, Number(key));
  close(lookup(c.points[0][0]), c.points[0][1], 'Exact CDV endpoint');
  close(lookup(c.points.at(-1)[0]), c.points.at(-1)[1], 'Exact CDV endpoint');
  const i = Math.floor(c.points.length / 2), a = c.points[i - 1], b = c.points[i];
  close(lookup((a[0] + b[0]) / 2), (a[1] + b[1]) / 2, 'Linear CDV midpoint');
  rejects(() => lookup(c.points[0][0] - 0.01), /outside/);
  rejects(() => lookup(c.points.at(-1)[0] + 0.01), /outside/);
}
for (const q of [8, 9, 10, 11]) rejects(() => reader.corrected(100, q), /Unsupported q=/);
rejects(() => sample.correctDeducts(Array(8).fill(20), reader), /Unsupported q=8/);
rejects(() => reader.deduct(19, 'low', 5), /severity/);
rejects(() => reader.corrected(100, 2.5), /Invalid/);
close(reader.corrected(120, 1), 120, 'Existing q=1 provisional identity, no clipped sum');
// Fictional DV-stage inputs exercise a genuinely fractional retained deduct using draft CDV.
// These are mathematical fixtures, not claims about the source DV curves.
const fractional = sample.correctDeducts([70, 40, 30, 20, 10], reader);
close(fractional.allowable_deducts, 184 / 49, 'Independent rational Eq. 4 oracle');
close(fractional.iterations[0].adjusted_deducts[3], 740 / 49, 'Fourth DV times fractional m');
close(fractional.iterations[0].total_deduct_value, 7600 / 49, 'No early trimming/rounding');
eq(fractional.iterations.map(i => i.q), [4, 3, 2, 1]);
eq(fractional.iterations[0].adjusted_deducts.length, 4);
close(fractional.max_corrected_deduct_value, Math.max(...fractional.iterations.map(i => i.corrected_deduct_value)), 'Maximum across all fractional iterations');

const input = demoCase();
const report = runReviewCase(input, reader);
eq(report.scope, 'local-review');
eq(report.publishable, false);
eq(report.engineering_approved, false);
eq(report.samples.map(s => s.output.status), ['provisional', 'provisional', 'provisional']);
eq(report.samples.map(s => s.engineering_approved), [false, false, false]);
for (const s of report.samples) {
  for (const g of s.output.groups) close(g.density, g.quantity / s.input.area_sqm * 100, 'Actual measured-area SI density');
  close(s.output.allowable_deducts, Math.min(10, 1 + 9 / 98 * (100 - s.output.highest_deduct_value)), 'Fractional m retained');
  close(s.output.pci, 100 - Math.max(...s.output.iterations.map(i => i.corrected_deduct_value)), 'Use maximum iteration CDV');
  eq(s.output.iterations.map(i => i.q), [2, 1]);
  assert.ok(s.curve_queries.every(q => q.bracket.length >= 1 && q.bracket.length <= 2)); checks++;
}
const [a, b, c] = report.samples.map(s => s.output.pci);
close(report.section.pci, ((225 * a + 150 * b) / 375 * 2025 + 225 * c) / 2250, 'Independent section weighting');
close(report.section.weights['random-a'], 0.54, 'Random area weight A');
close(report.section.weights['random-b'], 0.36, 'Random area weight B');
close(report.section.weights['additional-c'], 0.1, 'Additional actual area weight');
close(Object.values(report.section.weights).reduce((x, y) => x + y, 0), 1, 'Weights sum to one');
assert.ok(Math.abs(report.section.pci - (a + b + c) / 3) > 1, 'Catch equal sample-count weighting'); checks++;
const census = runReviewCase({ ...input, section: { ...input.section, area_sqm: 600, total_sample_units: 3 } }, reader);
close(census.section.pci, (225 * a + 150 * b + 225 * c) / 600, 'Complete census actual area');
eq(census.section.census_reclassification, true);
rejects(() => runReviewCase({ ...input, section: { ...input.section, required_random_ids: ['missing'] } }, reader), /cohort/);
rejects(() => runReviewCase({ ...input, samples: [input.samples[0], input.samples[0]] }, reader), /Duplicate/);
rejects(() => section.calculateSection({ ...input.section, samples: report.samples.map(s => ({
  id: s.id, computation_id: s.calculation_id, area_sqm: s.input.area_sqm, pci: s.output.pci,
  sample_type: s.sample_type, edition: s.output.edition, approved: false, is_current: false,
})) }), /current approved/);

const mixed = { ...input.samples[0].input, observations: [
  { code: 1, severity: 'low', unit: 'm²', quantity: 11.25 },
  { code: 1, severity: 'medium', unit: 'm²', quantity: 11.25 },
  { code: 1, severity: 'high', unit: 'm²', quantity: 11.25 },
] };
const output = sample.calculateSample(mixed, reader);
eq(output.severity_alternatives.length, 5, 'All three-severity alternatives with real draft lookups');
close(output.pci, Math.max(...output.severity_alternatives.map(s => s.pci)), 'Highest alternative PCI');
rejects(() => sample.calculateSample({ ...mixed, observations: [{ ...mixed.observations[0], quantity: 0.0001 }] }, reader), /outside/);
rejects(() => sample.calculateSample({ ...mixed, observations: [{ code: 10, severity: 'medium', unit: 'm²', quantity: 10 }] }, reader), /SI unit/);
const md = reviewMarkdown(report);
for (const phrase of ['UNREVIEWED', 'Density =', 'm = min', 'Maximum', 'Σ(PCI × weight)', 'q>=8 is rejected']) {
  assert.ok(md.includes(phrase), phrase); checks++;
}
await assert.rejects(() => readPrivateFile('package.json'), /inside private-astm/); checks++;
eq(sha256(await readPrivateFile(path.join(DEFAULT_PACKAGE, 'candidate-engine-mapping-UNAPPROVED.json'))), digest, 'Reference file unchanged');
console.log(`${checks} private draft integration checks passed. Mechanical consistency only; engineering validation remains pending.`);
