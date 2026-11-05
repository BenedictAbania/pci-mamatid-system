import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { moduleUrl } from './helpers/typescript-test-loader.mjs';

const { calculateSample } = await import(await moduleUrl('src/lib/d6433-07/sample.ts'));
const { sampleFromSnapshot } = await import(await moduleUrl('src/lib/d6433-07/snapshot.ts'));
const { ReferenceUnavailable } = await import(await moduleUrl('src/lib/d6433-07/curves.ts'));
const { handler } = await import(await moduleUrl('supabase/functions/calculate-pci/handler.ts'));
const { d07GuidanceSnapshot } = await import(await moduleUrl('src/lib/d6433-07/severity-guidance.ts'));
const db = new PGlite();
await db.exec('create role service_role');
for (const path of [
  'tests/fixtures/schema-fixture.sql',
  'supabase/migrations/20260916_authenticated_workflow.sql',
  'supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql',
  'supabase/migrations/20261004151522_published_revisions_and_reports.sql',
  'supabase/migrations/20261004162431_d6433_24_provisional_calculations.sql',
  'supabase/migrations/20261031211658_reviewer_branch_registration.sql',
  'supabase/migrations/20261102023605_reviewer_section_registration.sql',
]) await db.exec(await fs.readFile(path, 'utf8'));
const before = (await db.query("select id from distress_types where astm_edition='ASTM D6433-24'")).rows.map(row => row.id);
const migration = (await fs.readdir('supabase/migrations')).find(name => name.endsWith('_d6433_07_provisional_edition.sql'));
await db.exec(await fs.readFile(`supabase/migrations/${migration}`, 'utf8'));
const severityMigration = (await fs.readdir('supabase/migrations')).find(name => name.endsWith('_d6433_07_severity_guidance_snapshot.sql'));
await db.exec(await fs.readFile(`supabase/migrations/${severityMigration}`, 'utf8'));
const partsMigration = (await fs.readdir('supabase/migrations')).find(name => name.endsWith('_d6433_07_measurement_parts.sql'));
await db.exec(await fs.readFile(`supabase/migrations/${partsMigration}`, 'utf8'));
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
eq((await db.query('select active_edition from lakad_settings')).rows[0].active_edition, 'ASTM D6433-07');
eq((await db.query("select id from distress_types where astm_edition='ASTM D6433-24'")).rows.map(row => row.id), before);
const newTypes = (await db.query("select * from distress_types where astm_edition='ASTM D6433-07' order by astm_code")).rows;
eq(newTypes.length, 19);
eq(newTypes[18].name, 'Weathering and Raveling');
eq(newTypes.every(type => !type.name.startsWith('D6433-07 / ')), true);
eq(newTypes.every(type => type.astm_edition === 'ASTM D6433-07' && type.code.startsWith('D07-')), true);
eq(newTypes[18].allowed_severities, '{low,medium,high}');
await reject(() => db.query("update distress_types set astm_edition='ASTM D6433-07' where id=$1", [before[0]]), /immutable/);
await reject(() => db.query("update lakad_settings set active_edition='ASTM D6433-24'"), /current_edition_fixed/);

const ids = { reviewer: '00000000-0000-4000-8000-000000000001', encoder: '00000000-0000-4000-8000-000000000002', viewer: '00000000-0000-4000-8000-000000000003' };
for (const [role, id] of Object.entries(ids)) {
  await db.query('insert into auth.users(id,email)values($1,$2)', [id, `${role}@fictional.invalid`]);
  await db.query('insert into profiles(id,full_name,role)values($1,$2,$3)', [id, `FICTIONAL ${role}`, role]);
}
async function as(role) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[role]]);
  await db.exec('set role authenticated');
}
const action = async (id, name, payload = {}) => {
  const current = (await db.query('select input_revision,action_version from sample_units where id=$1', [id])).rows[0];
  return db.query('select lakad_inspection_action($1,$2,$3)', [id, name, { ...payload, revision: current.input_revision, version: current.action_version }]);
};
await as('reviewer');
const branch = (await db.query("insert into branches(name)values('FICTIONAL D07 branch') returning id")).rows[0].id;
const section = (await db.query("insert into sections(branch_id,name,area_sqm,length_meters,width_meters) values($1,'FICTIONAL D07 section',450,90,5) returning id", [branch])).rows[0].id;
await db.query('select lakad_plan_samples($1,$2)', [section, { total: 2, required: 2, inspector: ids.encoder, reviewer: ids.reviewer, start: '0', end: '90', rationale: 'fictional census' }]);
const units = (await db.query('select id from sample_units order by unit_number')).rows;
await as('encoder');
const first = units[0].id;
await action(first, 'start');
await action(first, 'save', { surveyed_at: '2026-01-01', area_sqm: 225, no_distress_confirmed: false, orientation_note: 'FICTIONAL orientation', field_rules_confirmed: true });
await reject(() => action(first, 'distress', { distress_type_id: newTypes[18].id, severity: 'low', quantity: 10 }), /severity guidance/);
await reject(() => action(first, 'distress', { distress_type_id: newTypes[18].id, severity: 'low', quantity: 10, severity_guidance: d07GuidanceSnapshot(19, 'low') }), /measured parts/i);
await action(first, 'distress', { distress_type_id: newTypes[18].id, severity: 'low', quantity: 999, measurement_parts: [{ mode: 'rectangle', length_m: 2, width_m: 3 }, { mode: 'irregular', area_sqm: 4 }], severity_guidance: d07GuidanceSnapshot(19, 'low') });
eq((await db.query('select quantity,measurement_details from distress_records where sample_unit_id=$1', [first])).rows[0].quantity, '10');
await action(first, 'submit');
const ctx = (await db.query('select lakad_calculation_context($1,$2) as c', [first, 'sample'])).rows[0].c;
eq(ctx.edition, 'ASTM D6433-07');
eq(ctx.input.report_context.distress_catalog[newTypes[18].id].astm_code, 19);
eq(ctx.input.distresses[0].measurement_details.severity_guidance, d07GuidanceSnapshot(19, 'low'));
const reader = { id: 'FICTIONAL', digest: 'f'.repeat(64), deduct: () => 10, corrected: () => 0 };
const output = calculateSample(sampleFromSnapshot(ctx.input, ctx.edition), reader);
eq(output.status, 'provisional');
await db.exec('reset role');
await db.query('select lakad_record_provisional_calculation($1,$2,$3)', [ids.encoder, ctx, output]);
await as('reviewer');
await reject(() => action(first, 'approve'), /validation|provisional/);
eq((await db.query('select workflow_state from sample_units where id=$1', [first])).rows[0].workflow_state, 'submitted');
await action(first, 'return', { comments: 'FICTIONAL correction of a provisional observation' });
await as('encoder');
const distressId = (await db.query('select id from distress_records where sample_unit_id=$1', [first])).rows[0].id;
await action(first, 'distress', { id: distressId, distress_type_id: newTypes[18].id, severity: 'medium', quantity: 999, measurement_parts: [{ mode: 'irregular', area_sqm: 10 }], severity_guidance: d07GuidanceSnapshot(19, 'medium') });
eq((await db.query('select measurement_details from distress_records where id=$1', [distressId])).rows[0].measurement_details.severity_guidance.text, d07GuidanceSnapshot(19, 'medium').text);
await action(first, 'submit');
const resubmitted = (await db.query('select lakad_calculation_context($1,$2) as c', [first, 'sample'])).rows[0].c;
eq(resubmitted.input.distresses[0].severity, 'medium');
eq(resubmitted.input.distresses[0].measurement_details.severity_guidance.version, d07GuidanceSnapshot(19, 'medium').version);
eq(ctx.input.distresses[0].measurement_details.severity_guidance.severity, 'low');
eq((await db.query('select count(*)::integer as n from inspection_computations where sample_unit_id=$1', [first])).rows[0].n, 2);
// Independent database-side quantity and evidence checks on the other fictional sample.
await as('encoder');
const second = units[1].id;
await action(second, 'start');
await action(second, 'save', { surveyed_at: '2026-01-02', area_sqm: 225, no_distress_confirmed: false, orientation_note: 'FICTIONAL second sample', field_rules_confirmed: true });
for (const type of newTypes) {
  const severity = type.astm_code === 12 ? null : 'low';
  const measurement_parts = type.astm_code === 13 ? [{ mode:'small_pothole', count:1, diameter_mm:150, depth_mm:20 }]
    : type.default_unit_of_measure === 'm' ? [{ mode:'length', length_m:1 }]
    : [{ mode:'rectangle', length_m:1, width_m:1 }];
  await action(second, 'distress', { distress_type_id:type.id, severity, quantity:999, measurement_parts,
    severity_guidance:d07GuidanceSnapshot(type.astm_code,severity),
    ...(type.astm_code === 15 ? { severity_evidence:{ metric:'mean_rut_depth_mm', value_mm:8 } } : {}) });
}
eq((await db.query('select count(*)::integer as n from distress_records where sample_unit_id=$1', [second])).rows[0].n, 19);
eq((await db.query('select count(*)::integer as n from distress_records where sample_unit_id=$1 and quantity=1', [second])).rows[0].n, 19);
eq((await db.query("select measurement_details->'severity_evidence'->>'metric' as metric from distress_records where sample_unit_id=$1 and distress_type_id=$2", [second,newTypes[14].id])).rows[0].metric,'mean_rut_depth_mm');
const potholeId = newTypes[12].id;
const potholeBase = { distress_type_id:potholeId, severity:'medium', quantity:999, severity_guidance:d07GuidanceSnapshot(13,'medium') };
await reject(() => action(second,'distress',{ ...potholeBase, measurement_parts:[{mode:'small_pothole',count:1,diameter_mm:200,depth_mm:20}] }),/unambiguous/);
await reject(() => action(second,'distress',{ ...potholeBase, measurement_parts:[{mode:'large_pothole',diameter_mm:750,depth_mm:20,area_sqm:0.5}] }),/invalid|750/);
await reject(() => action(second,'distress',{ ...potholeBase, measurement_parts:[{mode:'small_pothole',count:1,diameter_mm:150,depth_mm:20}] }),/severity/);
await reject(() => action(second,'distress',{ distress_type_id:newTypes[0].id, severity:'medium', quantity:1, measurement_parts:[{mode:'rectangle',length_m:0,width_m:1}], severity_guidance:d07GuidanceSnapshot(1,'medium') }),/positive/);
eq((await db.query('select count(*)::integer as n from distress_records where sample_unit_id=$1', [second])).rows[0].n,19);
// The HTTP handler must keep D07 no-distress, missing-reference, and stale-write paths distinct.
const target = '11111111-1111-4111-8111-111111111111';
const request = (body, auth = true) => new Request('https://fictional.test/calculate', {
  method: 'POST', headers: auth ? { authorization: 'Bearer fictional' } : {}, body: JSON.stringify(body),
});
let writes = 0;
const noDistress = structuredClone(ctx);
noDistress.input.sample.no_distress_confirmed = true;
noDistress.input.distresses = [];
const noDistressApi = handler({ authenticate: async () => ids.encoder, context: async () => noDistress,
  reference: async () => { throw new Error('No-distress path must not request curves'); },
  save: async () => { writes++; } });
eq((await noDistressApi(request({ kind: 'sample', target }))).status, 200);
eq(writes, 1);
const distressedApi = handler({ authenticate: async () => ids.encoder, context: async () => ctx,
  reference: async () => { throw new ReferenceUnavailable('D07 package missing'); },
  save: async () => { writes++; } });
eq((await distressedApi(request({ kind: 'sample', target }))).status, 503);
eq(writes, 1);
eq((await distressedApi(request({ kind: 'sample', target, output: { pci: 99 } }))).status, 409);
eq(writes, 1);
const staleApi = handler({ authenticate: async () => ids.encoder, context: async () => noDistress,
  reference: async () => { throw new Error('No-distress path must not request curves'); },
  save: async () => { throw new Error('Inspection changed during calculation'); } });
eq((await staleApi(request({ kind: 'sample', target }))).status, 409);
const viewerApi = handler({ authenticate: async () => ids.viewer,
  context: async () => { throw new Error('Active staff required'); },
  reference: async () => reader, save: async () => { writes++; } });
eq((await viewerApi(request({ kind: 'sample', target }))).status, 403);
eq(writes, 1);
console.log(`Passed ${checks} D6433-07 migration and submission checks in fictional local PGlite.`);
await db.close();
