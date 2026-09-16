import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import ts from 'typescript';

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
async function moduleFrom(path) {
  const source = await fs.readFile(path, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const access = await moduleFrom('src/lib/access.ts');
for (const role of ['admin', 'reviewer', 'encoder', 'viewer']) {
  check(access.canAccess(role, '/workspace'), `${role} overview`);
  check(access.canAccess(role, '/users') === (role === 'admin'), `${role} user management`);
  check(access.canAccess(role, '/field-inspections') === (role !== 'viewer'), `${role} field access`);
  check(!access.canAccess(role, '/unlisted-route'), 'unknown routes denied');
}
check(!access.canAccess(null, '/workspace'), 'anonymous denied');
const pci = await moduleFrom('src/lib/pci-service.ts');
const type = { id: 'x', default_unit_of_measure: 'm²', severity_required: true, allowed_severities: ['low'], is_active: true };
const measurement = { distress_type_id: 'x', severity: 'low', quantity: 10, unit_of_measure: 'm²', location_m: 10 };
pci.validateMeasurement(measurement, type, 225, 45, []); checks++;
for (const changes of [{ quantity: 0 }, { quantity: -2 }, { quantity: NaN }, { quantity: 226 }, { severity: 'high' }, { unit_of_measure: 'm' }, { location_m: 46 }]) {
  assert.throws(() => pci.validateMeasurement({ ...measurement, ...changes }, type, 225, 45, [])); checks++;
}
assert.throws(() => pci.validateMeasurement(measurement, type, 225, 45, [measurement])); checks++;
check(pci.pendingCalculation({ area_sqm: 225, edition: 'ASTM D6433-07', revision: 1, measurements: [] }).output === null, 'No fake PCI 100 for empty data');
check(pci.possibleSampleUnits(2250).count === 10, 'Layout estimate');
check(pci.rankPriorities([{ id: 'a', pci: 40, safety: false, highSeverity: 0, affectedArea: 10 }, { id: 'b', pci: 40, safety: true, highSeverity: 1, affectedArea: 1 }])[0].id === 'b', 'Safety tie break');
const publicSource = await fs.readFile('src/app/prototype.tsx', 'utf8');
check(!/supabase|workflowAction|\.upload\(/i.test(publicSource), 'Public prototype has no database/storage dependency');

const db = new PGlite();
const awaitableRollback = await fs.readFile('supabase/rollback/20260916_authenticated_workflow.sql', 'utf8');
await db.exec(await fs.readFile('tests/schema-fixture.sql', 'utf8'));
await db.exec(await fs.readFile('supabase/migrations/20260916_authenticated_workflow.sql', 'utf8'));
const ids = Object.fromEntries(['admin', 'reviewer', 'encoder', 'viewer', 'other'].map((name, index) => [name, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
for (const [name, id] of Object.entries(ids)) {
  await db.query('insert into auth.users values($1,$2)', [id, `${name}@example.test`]);
  await db.query('insert into profiles(id,full_name,role) values($1,$2,$3)', [id, name, name === 'other' ? 'encoder' : name]);
}
async function as(name) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] ?? '']);
  await db.exec(`set role ${name === 'anon' ? 'anon' : 'authenticated'}`);
}
async function rejected(task, expected) { await assert.rejects(task, expected); checks++; }
await as('admin');
const branch = (await db.query("insert into branches(name) values('TEST ONLY ROAD') returning id")).rows[0].id;
const section = (await db.query("insert into sections(branch_id,name,length_meters,width_meters,area_sqm) values($1,'TEST ONLY SECTION',450,5,2250) returning id", [branch])).rows[0].id;
await rejected(() => db.query("select lakad_plan_samples($1,$2)", [section, {}]), /engineer/i);
await as('reviewer');
await db.query('select lakad_plan_samples($1,$2)', [section, { total: 10, required: 2, inspector: ids.encoder, reviewer: ids.reviewer, start: '0 m', end: '450 m', rationale: 'TEST FIXTURE — not an engineering recommendation' }]); checks++;
const samples = (await db.query('select * from sample_units')).rows;
check(samples.length === 2 && samples.every(s => s.workflow_state === 'planned'), 'random units created');
const sample = samples[0].id;
await rejected(() => db.query("select lakad_save_distress_type(null,$1)", [{ code: 'T-01', name: 'TEST ONLY DISTRESS', default_unit_of_measure: 'm²', severity_required: true, allowed_severities: ['low'], is_active: true }]), /Administrator/);
await rejected(() => db.query("insert into distress_types(code,name,default_unit_of_measure) values('BYPASS','BYPASS TEST','m²')"), /row-level security/);
await as('admin');
const distress = (await db.query("select lakad_save_distress_type(null,$1) id", [{ code: 'T-01', name: 'TEST ONLY DISTRESS', description: 'Fictional test fixture', default_unit_of_measure: 'm²', severity_required: true, allowed_severities: ['low', 'medium', 'high'], is_active: true }])).rows[0].id; checks++;
await rejected(() => db.query("select lakad_save_distress_type(null,$1)", [{ code: 'T-02', name: 'INVALID UNIT', default_unit_of_measure: 'feet', severity_required: true, allowed_severities: ['low'], is_active: true }]), /supported measurement unit/);
await rejected(() => db.query('select lakad_manage_account($1,$2,$3)', [ids.admin, 'viewer', true]), /own access/i);
await as('other');
check((await db.query('select * from sample_units')).rows.length === 0, 'unassigned encoder cannot read');
await rejected(() => db.query('select lakad_inspection_action($1,$2)', [sample, 'start']), /outside your assignment/i);
await as('viewer');
check((await db.query('select * from sample_units')).rows.length === 0, 'viewer cannot read drafts');
check((await db.query('select * from sections')).rows.length === 0, 'viewer cannot read unpublished inventory');
await rejected(() => db.query("insert into deduct_value_points(density_percent) values(10)"), /row-level security|permission denied/i);
await rejected(() => db.query('select * from lakad_accounts()'), /Administrator/);
await rejected(() => db.query('select lakad_manage_account($1,$2,$3)', [ids.encoder, 'admin', true]), /Administrator/);
await as('encoder');
check((await db.query("select * from distress_types")).rows.length > 0, "encoder can read distress types");
await rejected(() => db.query("insert into sample_units(section_id,unit_number) values($1,999)", [section]), /row-level security|permission denied/i);
await db.query('select lakad_inspection_action($1,$2)', [sample, 'start']); checks++;
const invoke = (action, payload = {}) => db.query('select lakad_inspection_action($1,$2,$3)', [sample, action, payload]);
await rejected(() => invoke('submit'), /Add distresses/);
await rejected(() => invoke('distress', { distress_type_id: distress, quantity: -1, severity: 'low' }), /positive/);
await invoke('distress', { distress_type_id: distress, quantity: 5, severity: 'low', location_m: 5 }); checks++;
await rejected(() => invoke('distress', { distress_type_id: distress, quantity: 5, severity: 'low' }), /Duplicate/);
await rejected(() => invoke('distress', { distress_type_id: distress, quantity: 500, severity: 'high' }), /boundary/);
await rejected(() => invoke('save', { revision: 999, surveyed_at: '2026-01-01' }), /changed/);
await invoke('save', { surveyed_at: '2026-01-01', notes: 'Test notes', latitude: '', longitude: '' }); checks++;
await db.query("insert into storage.objects(bucket_id,name) values('sample-unit-photos',$1)", [`${sample}/test.jpg`]); checks++;
await invoke('photo', { path: `${sample}/test.jpg`, caption: 'Test evidence' }); checks++;
await invoke('submit'); checks++;
await rejected(() => invoke('save', { surveyed_at: '2026-01-01' }), /read-only/);
await rejected(() => db.query("insert into storage.objects(bucket_id,name) values('sample-unit-photos',$1)", [`${sample}/late.jpg`]), /row-level security/);
await rejected(() => invoke('approve'), /independent/);
await as('reviewer');
await rejected(() => invoke('return'), /comments/);
await rejected(() => invoke('approve'), /pending verification/);
await invoke('return', { comments: 'Please verify measured area.' }); checks++;
await as('encoder');
await invoke('save', { surveyed_at: '2026-01-02', notes: 'Corrected', latitude: '', longitude: '' });
await invoke('submit'); checks++;
check((await db.query('select * from inspection_computations')).rows.length === 2, 'submitted snapshots retained');
await rejected(() => db.query("update inspection_computations set verification='verified'"), /permission denied/);
await as('admin');
await db.query('select lakad_manage_account($1,$2,$3)', [ids.encoder, 'encoder', false]);
await as('encoder');
check((await db.query('select * from sample_units')).rows.length === 0, 'deactivated account loses data access');
await rejected(() => invoke('submit'), /Active authenticated/);
await as('admin');
await db.query('select lakad_manage_account($1,$2,$3)', [ids.encoder, 'encoder', true]);
// Trusted fixture insertion simulates a future verified service; NEVER applied to Supabase.
await db.exec('reset role');
await db.query("update inspection_computations set verification='verified',reference_id='TEST-NOT-ASTM',algorithm_version='fixture',output_snapshot=$2 where id=(select computation_id from sample_units where id=$1)", [sample, { pci: 60, condition: 'TEST ONLY', iterations: [], total_deduct_value: 40, max_corrected_deduct_value: 40 }]);
await as('reviewer');
await invoke('approve', { comments: 'Test fixture approval' });
await invoke('publish'); checks++;
await as('viewer');
check((await db.query('select * from sample_units')).rows.length === 1, 'viewer sees only verified approved/published sample');
await rejected(() => invoke('return', { comments: 'Denied' }), /independent/);
await as('admin');
check((await db.query('delete from sections where id=$1 returning id', [section]).catch(e => ({ denied: /sample units/.test(e.message) }))).denied, 'inventory delete cannot cascade inspection history');
await db.exec('reset role');
const rls = (await db.query("select tablename,rowsecurity from pg_tables where schemaname='public'")).rows;
check(rls.every(table => table.rowsecurity), 'RLS enabled on every public table');
await rejected(() => db.exec(awaitableRollback), /Rollback refused/);
await db.exec('rollback');
await as('admin');
await db.query("insert into deduct_value_points(density_percent) values(10)"); checks++;
await db.query("delete from deduct_value_points where density_percent=10"); checks++;
await as('anon');
await rejected(() => db.query('select * from sample_units'), /permission denied/i);
await rejected(() => db.query('select lakad_inspection_action($1,$2)', [sample, 'start']), /permission denied/i);
await db.close();
const empty = new PGlite();
await empty.exec(await fs.readFile('tests/schema-fixture.sql', 'utf8'));
await empty.exec(await fs.readFile('supabase/migrations/20260916_authenticated_workflow.sql', 'utf8'));
await empty.exec(awaitableRollback); checks++;
check((await empty.query("select count(*)::integer n from information_schema.columns where table_schema='public' and column_name='workflow_state'")).rows[0].n === 0, 'Unused migration rolls back cleanly');
await empty.close();
console.log(`Passed ${checks} domain, role, workflow, RLS and Storage-policy checks. No hosted database changed.`);
