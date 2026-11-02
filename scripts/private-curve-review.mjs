// Node-only local adapter. Never import this file from Expo or an Edge Function.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { moduleUrl } from './typescript-test-loader.mjs';

export const catalog = await import(await moduleUrl('supabase/functions/_shared/d6433-24/catalog.ts'));
export const curves = await import(await moduleUrl('supabase/functions/_shared/d6433-24/curves.ts'));
export const sample = await import(await moduleUrl('supabase/functions/_shared/d6433-24/sample.ts'));
export const section = await import(await moduleUrl('supabase/functions/_shared/d6433-24/section.ts'));
export const PRIVATE_ROOT = path.resolve('private-astm');
export const DEFAULT_PACKAGE = path.join(PRIVATE_ROOT, 'LAKAD-D6433-24-provisional-review');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function readPrivateFile(file) {
  const root = await fs.realpath(PRIVATE_ROOT);
  const resolved = await fs.realpath(path.resolve(file));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Review inputs must remain inside private-astm/');
  return fs.readFile(resolved);
}

export async function loadReviewPackage(directory = DEFAULT_PACKAGE) {
  const manifest = JSON.parse(await readPrivateFile(path.join(directory, 'manifest.json')));
  const inventory = [];
  for (const [name, expected] of Object.entries(manifest)) {
    if (name.split(/[\\/]/).includes('..') || path.isAbsolute(name)) throw new Error('Invalid manifest path');
    const bytes = await readPrivateFile(path.join(directory, name));
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error('Manifest mismatch: ' + name);
    inventory.push(name);
  }
  for (const required of ['README.md', 'candidate-engine-mapping-UNAPPROVED.json', 'curve-data-review.json', 'engineering-review.pdf', 'engineer-review-register.csv', 'independent-graph-checks.csv']) {
    if (!inventory.includes(required)) throw new Error('Missing required manifest entry: ' + required);
  }
  const bytes = await readPrivateFile(path.join(directory, 'candidate-engine-mapping-UNAPPROVED.json'));
  const pack = JSON.parse(bytes);
  const pdf = await readPrivateFile(path.join(PRIVATE_ROOT, 'ASTM D6433 24.pdf'));
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || sha256(pdf) !== pack.source_sha256) throw new Error('Source PDF signature/hash does not match candidate');
  const trace = JSON.parse(await readPrivateFile(path.join(directory, 'curve-data-review.json')));
  if (trace.source?.sha256 !== pack.source_sha256 || trace.id !== pack.id) throw new Error('Trace/candidate provenance mismatch');
  return { pack, digest: sha256(bytes), inventory, source_digest: sha256(pdf) };
}

/** Review metadata stays null/false. The trusted privateCurveReader still rejects it. */
export function reviewCurveReader(candidate, digest) {
  const pack = structuredClone(candidate);
  if (pack.edition !== catalog.EDITION || pack.usage !== 'review-only' || pack.status !== 'UNREVIEWED / PROVISIONAL'
    || pack.approved_for_calculation !== false || pack.reviewed_by !== null || pack.permission_record !== null || pack.interpolation_review !== null
    || typeof pack.id !== 'string' || !pack.id.trim() || !/^[a-f0-9]{64}$/.test(pack.source_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('An unapproved review-only package with unchanged pending records is required');
  }
  curves.validateCurveMaps(pack);
  const queries = [];
  function lookup(curve, x, identity) {
    const value = curves.interpolateCurve(curve, x); // Same interpolation as the existing calculator.
    const next = curve.points.findIndex(p => p[0] >= x);
    const bracket = curve.points[next][0] === x ? [curve.points[next]] : [curve.points[next - 1], curve.points[next]];
    queries.push({ identity, figure: curve.figure, x_scale: curve.x_scale, x, value, bracket, status: 'provisional' });
    return value;
  }
  return {
    id: pack.id, digest, scope: 'local-review', queries,
    deduct(code, severity, density) {
      const d = catalog.definition(code);
      catalog.positive(density, 'Density');
      if (severity === null ? d.severities.length > 0 : !d.severities.includes(severity)) throw new curves.ReferenceUnavailable('Unsupported distress severity');
      const key = curves.curveKey(code, severity);
      return lookup(pack.dv[key], density, key);
    },
    corrected(total, q) {
      if (!Number.isFinite(total) || total < 0 || !Number.isInteger(q) || q < 1) throw new curves.ReferenceUnavailable('Invalid CDV query');
      if (q >= 8) throw new curves.ReferenceUnavailable('Unsupported q=' + q + ': q>=8 has no supplied curve; no fallback');
      if (q === 1) return total; // Existing provisional identity policy, not imported plotted q=1 data.
      return lookup(pack.cdv[String(q)], total, 'q=' + q);
    },
  };
}

// Fictional field scenarios; quantities are not graph ordinates or actual inspections.
export function demoCase() {
  const input = (area, observations) => ({ edition: catalog.EDITION, area_sqm: area, observations,
    no_distress_confirmed: false, field_rules_confirmed: true });
  const observation = (code, severity, quantity) => ({ code, severity, quantity, unit: catalog.definition(code).unit });
  return {
    description: 'Synthetic local rehearsal; field confirmations are fixture assumptions, not inspector/engineer attestations.',
    samples: [
      { id: 'random-a', sample_type: 'random', input: input(225, [observation(1, 'low', 11.25), observation(10, 'medium', 22.5)]) },
      { id: 'random-b', sample_type: 'random', input: input(150, [observation(1, 'low', 15), observation(19, 'high', 7.5)]) },
      { id: 'additional-c', sample_type: 'additional', input: input(225, [observation(1, 'high', 22.5), observation(20, 'medium', 11.25)]) },
    ],
    section: { area_sqm: 2250, total_sample_units: 10, required_random_ids: ['random-a', 'random-b'] },
  };
}

export function runReviewCase(input, reader) {
  if (!Array.isArray(input.samples) || !input.samples.length) throw new Error('Local sample cases are required');
  const samples = input.samples.map(s => {
    const start = reader.queries.length;
    const output = sample.calculateSample(s.input, reader);
    return { id: s.id, sample_type: s.sample_type, input: s.input, output,
      scope: 'local-review', engineering_approved: false, publishable: false,
      curve_queries: reader.queries.slice(start), calculation_id: 'local-review/' + s.id + '/' + sha256(JSON.stringify({ input: s.input, digest: reader.digest })) };
  });
  const result = section.calculateSectionForReview({ ...input.section, samples: samples.map(s => ({
    id: s.id, calculation_id: s.calculation_id, sample_type: s.sample_type,
    area_sqm: s.input.area_sqm, pci: s.output.pci, edition: s.output.edition, status: s.output.status,
  })) });
  return { description: input.description ?? 'Local engineering review case', status: 'provisional', scope: 'local-review',
    engineering_approved: false, publishable: false, reference_id: reader.id, reference_digest: reader.digest,
    case_digest: sha256(JSON.stringify(input)),
    q1_policy: 'Existing provisional identity rule; q=1 trace is excluded from import. Requires engineering validation.',
    precision_policy: 'Full precision internally; display-only rounding; no extrapolation.', samples, section_input: input.section, section: result };
}
