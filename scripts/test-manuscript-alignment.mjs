import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import ts from 'typescript';

let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
async function compileUrl(path) {
  const source = await fs.readFile(path, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
async function compileUrlWithImports(path, replacements) {
  const source = await fs.readFile(path, 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [specifier, url] of Object.entries(replacements)) output = output.replaceAll(`'${specifier}'`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

const classificationUrl = await compileUrl('src/lib/pci-classification.ts');
const classification = await import(classificationUrl);
const engine = await import(await compileUrlWithImports('src/lib/pci-engine.ts', { './pci-classification': classificationUrl }));
const cases = [
  [0, 'Failed'], [9.99, 'Failed'], [10, 'Very Poor'], [24.99, 'Very Poor'],
  [25, 'Poor'], [39.99, 'Poor'], [40, 'Fair'], [54.99, 'Fair'],
  [55, 'Good'], [62, 'Good'], [69.99, 'Good'], [70, 'Very Good'],
  [84.99, 'Very Good'], [85, 'Excellent'], [100, 'Excellent'],
];
for (const [pci, expected] of cases) check(classification.getPciCondition(pci) === expected, `${pci} → ${expected}`);
check(classification.getPciCondition(-1) === 'Failed', 'Out-of-range PCI is clamped at 0');
check(classification.getPciCondition(101) === 'Excellent', 'Out-of-range PCI is clamped at 100');
assert.throws(() => classification.getPciCondition(Number.NaN), /finite/); checks++;
const prototypeResult = engine.computePCI(engine.DEFAULT_SAMPLE, engine.DEFAULT_SAMPLE_AREA);
check(prototypeResult.pci === 62 && prototypeResult.rating === 'Good', 'Prototype default displays PCI 62 = Good');

const service = await import(await compileUrl('src/lib/pci-service.ts'));
for (const [area, accepted] of [[136.99, false], [137, true], [230, true], [323, true], [323.01, false]]) {
  check(service.isSampleUnitAreaAllowed(area) === accepted, `${area} m² ${accepted ? 'accepted' : 'rejected'}`);
}
check(service.possibleSampleUnits(2300).count === 10, '230 m² layout target is used');

const ordered = service.rankPriorities([
  { id: 'higher-pci-risk', pci: 41, safety: true, highSeverity: 5, affectedArea: 1000 },
  { id: 'lower-pci', pci: 40, safety: false, highSeverity: 0, affectedArea: 1 },
  { id: 'risk-small-area', pci: 50, safety: false, highSeverity: 1, affectedArea: 10 },
  { id: 'no-risk-large-area', pci: 50, safety: false, highSeverity: 0, affectedArea: 100 },
  { id: 'risk-large-area', pci: 50, safety: true, highSeverity: 0, affectedArea: 20 },
]);
check(ordered[0].id === 'lower-pci', 'Lower PCI outranks all tie-breakers');
check(ordered.findIndex(row => row.id === 'risk-small-area') < ordered.findIndex(row => row.id === 'no-risk-large-area'), 'Risk presence is the second criterion');
check(ordered.findIndex(row => row.id === 'risk-large-area') < ordered.findIndex(row => row.id === 'risk-small-area'), 'Affected area is the final criterion');

const prototypeSource = await fs.readFile('src/app/prototype.tsx', 'utf8');
const engineSource = await fs.readFile('src/lib/pci-engine.ts', 'utf8');
const samplingSource = await fs.readFile('src/app/sampling.tsx', 'utf8');
const migrationSource = await fs.readFile('supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql', 'utf8');
const sourceFiles = await Promise.all((await fs.readdir('src', { recursive: true })).filter(path => /\.(ts|tsx)$/.test(path)).map(path => fs.readFile(`src/${path}`, 'utf8')));
check(prototypeSource.includes('SAMPLE_UNIT_GUIDANCE'), 'Prototype renders centralized 230 ± 93 m² guidance');
check(engineSource.includes('getPciConditionCategory'), 'Prototype computation uses centralized classification');
check(!sourceFiles.some(source => /\bSatisfactory\b|\bSerious\b/.test(source)), 'Old PCI condition labels are absent from application source');
check(!/supabase|workflowAction|\.upload\(/i.test(prototypeSource), 'Public prototype performs no Supabase write');
check(/sample_type === 'additional'/.test(samplingSource) && /Random/.test(samplingSource), 'Random and additional sample units remain distinct');
check((migrationSource.match(/not between 137 and 323/g) || []).length === 2, 'Both sampling RPCs enforce inclusive 137–323 m² boundaries');
check(/security definer set search_path=''/g.test(migrationSource), 'Sampling RPC replacements preserve security definer and safe search path');

console.log(`Passed ${checks} manuscript classification, sampling and prioritization checks.`);
