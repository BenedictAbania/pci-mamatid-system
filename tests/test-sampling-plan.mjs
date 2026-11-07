import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Transpile the TS modules into a temp folder so relative .ts imports resolve.
const root = path.resolve('.');
const out = path.join(root, 'node_modules', '.cache', 'lakad-sampling-test');
await fs.mkdir(out, { recursive: true });
const files = {
  'sampling-plan.mjs': 'src/lib/d6433-07/sampling-plan.ts',
  'section.mjs': 'supabase/functions/_shared/d6433-07/section.ts',
  'catalog.mjs': 'supabase/functions/_shared/d6433-07/catalog.ts',
  'pci-service.mjs': 'src/lib/pci/pci-service.ts',
};
for (const [target, source] of Object.entries(files)) {
  let code = ts.transpileModule(await fs.readFile(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code
    .replace(/from '\.\.\/pci\/pci-service'/g, "from './pci-service.mjs'")
    .replace(/from '\.\/section'/g, "from './section.mjs'")
    .replace(/from '\.\/catalog\.ts'/g, "from './catalog.mjs'")
    .replace(/from '\.\/[a-z-]+\.ts'/g, (match) => match.replace('.ts', '.mjs'));
  await fs.writeFile(path.join(out, target), code);
}
const plan = await import(path.join(out, 'sampling-plan.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };

// §2.1.7: N units of about 225 m², each 135–315 m².
check(plan.sectionSampleUnits(240)?.total === 1, '240 m² section is one sample unit (mockup)');
check(plan.sectionSampleUnits(1000)?.total === 4 && plan.sectionSampleUnits(1000).unitArea === 250, '1000 m² → 4 units of 250 m²');
check(plan.sectionSampleUnits(400)?.total === 2, '400 m² → 2 units of 200 m²');
check(plan.sectionSampleUnits(100) === null, 'section under 135 m² cannot be divided');
for (const area of [135, 300, 316, 500, 5000, 12345]) {
  const layout = plan.sectionSampleUnits(area);
  check(layout && layout.unitArea >= 135 && layout.unitArea <= 315, `${area} m² units stay within 135–315 m²`);
}

// Option 1: every unit.
check(plan.samplingSelection('all', 7, 1).units.join() === '1,2,3,4,5,6,7', 'Option 1 inspects all units');

// Option 2: §7.5.2 Eq. 1 with s = 10, e = 5.
const eq1 = (N) => N === 1 ? 1 : Math.ceil(N * 100 / ((25 / 4) * (N - 1) + 100));
for (const N of [1, 2, 5, 10, 20, 40, 100]) check(plan.requiredSampleUnits('confidence', N) === Math.min(N, eq1(N)), `Eq. 1 n for N=${N}`);
check(plan.requiredSampleUnits('confidence', 10) === 7, 'N=10 → n=7');

// Option 3: reduced sampling table.
for (const [N, n] of [[1, 1], [5, 1], [6, 2], [10, 2], [11, 3], [15, 3], [16, 4], [40, 4], [41, 5], [100, 10], [105, 11]])
  check(plan.requiredSampleUnits('reduced', N) === n, `reduced N=${N} → n=${n}`);

// §7.5.3 Eq. 3: i = floor(N/n), units s, s+i, …
const reduced = plan.samplingSelection('reduced', 25, 2);
check(reduced.interval === 6 && reduced.units.join() === '2,8,14,20', 'N=25 reduced: i=6, start 2');
const mock = plan.samplingSelection('reduced', 24, 2);
check(mock.interval === 6, 'N=24 reduced uses i=6');
assert.throws(() => plan.samplingSelection('confidence', 10, 3), /First unit/); checks++;
for (let k = 0; k < 200; k++) {
  const s = plan.randomStart('reduced', 50);
  check(s >= 1 && s <= Math.floor(50 / 5), 'random start within 1..i');
}

check(plan.formatChainage(0) === '0+000' && plan.formatChainage(40) === '0+040' && plan.formatChainage(1250.4) === '1+250', 'chainage format');
const slot = plan.unitSlot(2, 4, 100);
check(slot.start === 25 && slot.end === 50, 'unit slot boundaries');

console.log(`Passed ${checks} D6433-07 sampling plan checks.`);
