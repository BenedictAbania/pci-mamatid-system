import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRIVATE_ROOT, loadReviewPackage, reviewCurveReader, demoCase, runReviewCase, readPrivateFile } from './private-curve-review.mjs';

const fmt = x => Number(x).toFixed(6);
export function reviewMarkdown(report) {
  const lines = ['# Prototype / Provisional - local calculation review', '', report.description, '',
    '**UNREVIEWED. No engineering approval or publication eligibility.**', '',
    `Reference: ${report.reference_id}. Candidate byte SHA-256: ${report.reference_digest}.`,
    `Input case SHA-256 (parsed JSON): ${report.case_digest}.`, '',
    report.q1_policy, report.precision_policy, '',
    'This report uses the existing sample calculator and shared section arithmetic. No Auth, database, Storage or network requests are made.', ''];
  for (const s of report.samples) {
    const o = s.output;
    lines.push(`## Sample ${s.id} (${s.sample_type})`, '',
      `Measured area: ${s.input.area_sqm} m². Density = SI quantity / measured area × 100 (§§9.1-9.2).`, '',
      '| Selected distress | Severity | Quantity / SI unit | Numerical density | Draft DV |', '| --- | --- | --- | --- | --- |');
    for (const g of o.groups) lines.push(`| ${g.code} | ${g.severity ?? 'none'} | ${g.quantity} ${g.unit} | ${fmt(g.density)} | ${fmt(g.deduct_value)} |`);
    lines.push('', `Severity scenarios evaluated (§9.6.2): ${o.severity_alternatives.length}; choose the highest resulting PCI. All alternatives and lookup brackets are in calculation-review.json.`, '',
      `TDV before fractional trimming: ${fmt(o.total_deduct_value)}. HDV: ${fmt(o.highest_deduct_value)}.`,
      o.iterations.length ? `m = min(10, 1 + 9/98 × (100 - HDV)) = ${fmt(o.allowable_deducts)}; retain floor(m) full DVs and the next DV × fraction (§9.5 Eq. 4).` : 'At most one DV >2: CDV equals the sum of all DVs (§9.5.1).', '',
      '| Iteration | Adjusted deducts | q (>2) | TDV | Draft CDV |', '| --- | --- | --- | --- | --- |');
    o.iterations.forEach((it, i) => lines.push(`| ${i + 1} | ${it.adjusted_deducts.map(fmt).join(', ')} | ${it.q} | ${fmt(it.total_deduct_value)} | ${fmt(it.corrected_deduct_value)} |`));
    lines.push('', `Reduce the smallest DV >2 to 2 between iterations; select maximum CDV (§9.5.5). Maximum = ${fmt(o.max_corrected_deduct_value)}.`,
      `Provisional PCI = clamp(100 - maximum CDV, 0, 100) = **${fmt(o.pci)} (${o.condition})** (§9.6.1; Fig. 1; bounding is a provisional numerical policy).`, '');
  }
  const o = report.section;
  lines.push('## Section aggregation - local rehearsal only', '',
    'No sample is marked approved/current in a database. The production section entry point continues to require current approved snapshots.', '',
    `Section area: ${report.section_input.area_sqm} m². Additional area: ${o.additional_area} m².`,
    `Random mean = Σ(random PCI × surveyed area) / Σ(random surveyed area) = ${fmt(o.random_mean)}.`,
    `Random cohort represents ${o.represented_random_area} m²; additional samples represent their actual area (§11.1 Eqs. 5-7).`, '',
    '| Sample | Area | Provisional PCI | Section weight | Contribution |', '| --- | --- | --- | --- | --- |');
  for (const s of report.samples) lines.push(`| ${s.id} | ${s.input.area_sqm} | ${fmt(s.output.pci)} | ${fmt(o.weights[s.id])} | ${fmt(s.output.pci * o.weights[s.id])} |`);
  lines.push('', `Sum of weights: ${fmt(Object.values(o.weights).reduce((a, b) => a + b, 0))}.`,
    `Provisional section PCI = Σ(PCI × weight) = **${fmt(o.pci)} (${o.condition})**.`,
    `Complete census treatment: ${o.census_reclassification ? 'all surveyed units weighted by actual area' : 'not a complete census'}.`, '',
    '## Engineering decisions still pending', '',
    '- Curve identity/nodes/endpoints, reading uncertainty and interpolation; omitted tails are not zero.',
    '- Shared q=6/7 ink and q=1 identity; q>=8 is rejected.',
    '- Independently calculated expectations; draft graph-check values are comparison values only.',
    '- Mixed severity, fractional m/rounding, field observations, sampling adequacy and section weighting.',
    '- Separate permission decision for any intended storage/distribution beyond this private review.', '');
  return lines.join('\n');
}

export async function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--input')) throw new Error('Usage: npm.cmd run review:private-curves [-- --input private-astm/case.json]');
  const loaded = await loadReviewPackage();
  const input = args.length ? JSON.parse(await readPrivateFile(args[1])) : demoCase();
  const reader = reviewCurveReader(loaded.pack, loaded.digest);
  const report = { ...runReviewCase(input, reader), source_digest: loaded.source_digest, manifest_files_verified: loaded.inventory.length };
  const out = path.join(PRIVATE_ROOT, 'local-review-results');
  await fs.mkdir(out, { recursive: true });
  // Refuse an output directory symlink escaping the ignored private folder.
  const relative = path.relative(await fs.realpath(PRIVATE_ROOT), await fs.realpath(out));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must remain private');
  for (const name of ['calculation-review.json', 'calculation-review.md']) {
    try { const stat = await fs.lstat(path.join(out, name)); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Output must be a regular private file'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await fs.writeFile(path.join(out, 'calculation-review.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'calculation-review.md'), reviewMarkdown(report));
  console.log(`PROVISIONAL / local review only. ${loaded.inventory.length} manifest hashes and source PDF hash verified.`);
  for (const s of report.samples) console.log(`${s.id}: provisional PCI ${fmt(s.output.pci)}; ${s.output.iterations.length} CDV iterations.`);
  console.log(`Provisional section PCI ${fmt(report.section.pci)}. Steps: private-astm/local-review-results/calculation-review.md`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error('Local review rejected: ' + error.message); process.exitCode = 1; });
}
