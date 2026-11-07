import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

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
  'supabase/migrations/20261107140000_branch_registration_fields.sql',
  'supabase/migrations/20261107150000_section_registration_fields.sql',
  'supabase/migrations/20261107160000_section_sampling_plan.sql',
  'supabase/migrations/20261107170000_encoder_assignment_choices.sql',
])await db.exec(await fs.readFile(path, 'utf8'));

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };

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
const confirm = (target, payload) => db.query('select lakad_confirm_sampling_plan($1,$2)', [target, payload]);
const additional = (target, payload) => db.query('select lakad_add_additional_sample_unit($1,$2)', [target, payload]);
const assign = (target, inspector) => db.query('select lakad_assign_section_encoder($1,$2)', [target, { inspector }]);
const units = async (target) => (await db.query('select unit_number,sample_type,assigned_to,area_sqm::float8 area from sample_units where section_id=$1 order by unit_number', [target])).rows;

await as('reviewer');
const branch = (await db.query("insert into branches(name,branch_code)values('FICTIONAL branch','FIC-B01') returning id")).rows[0].id;
const newSection = async (name, area, length, width) => (await db.query(
  'insert into sections(branch_id,name,area_sqm,length_meters,width_meters) values($1,$2,$3,$4,$5) returning id', [branch, name, area, length, width])).rows[0].id;

// Option 1: N = 2 (450 m²), every unit.
const all = await newSection('FICTIONAL all', 450, 90, 5);
await as('encoder');
await reject(() => confirm(all, { method: 'all', total: 2 }), /Only a Reviewer/);
await as('reviewer');
await reject(() => confirm(all, { method: 'all', total: 1 }), /135–315/);
await confirm(all, { method: 'all', total: 2 });
eq((await units(all)).map(u => [u.unit_number, u.sample_type, u.assigned_to, u.area]), [[1, 'random', null, 225], [2, 'random', null, 225]], 'Option 1 plans every unit without an encoder');
eq((await db.query('select sampling_method,sampling_interval,sampling_start_unit,total_sample_units,recommended_sample_units from sections where id=$1', [all])).rows[0],
  { sampling_method: 'all', sampling_interval: 1, sampling_start_unit: 1, total_sample_units: 2, recommended_sample_units: 2 });
await reject(() => confirm(all, { method: 'all', total: 2 }), /already has a sampling plan/);
await reject(() => additional(all, { unit: 1, start_m: 0, end_m: 45, reason: 'x' }), /Options 2 and 3/);

// Option 3: N = 25 (5625 m²) → n = 4, i = 6, start 2 → U2, U8, U14, U20.
const reduced = await newSection('FICTIONAL reduced', 5625, 937.5, 6);
await reject(() => confirm(reduced, { method: 'reduced', total: 25, first: 7 }), /between 1 and the sampling interval 6/);
await reject(() => confirm(reduced, { method: 'unknown', total: 25 }), /Choose a sampling option/);
await confirm(reduced, { method: 'reduced', total: 25, first: 2 });
eq((await units(reduced)).map(u => u.unit_number), [2, 8, 14, 20], 'Option 3 systematic selection');
eq((await db.query('select recommended_sample_units n,sampling_interval i from sections where id=$1', [reduced])).rows[0], { n: 4, i: 6 });

// Additional sample unit (Options 2 and 3 only).
await reject(() => additional(reduced, { unit: 8, start_m: 262.5, end_m: 300, reason: 'x' }), /already selected/);
await reject(() => additional(reduced, { unit: 5, start_m: 150, end_m: 187.5, reason: ' ' }), /reason is required/);
await reject(() => additional(reduced, { unit: 5, start_m: 100, end_m: 187.5, reason: 'x' }), /inside U5/);
await reject(() => additional(reduced, { unit: 26, start_m: 0, end_m: 10, reason: 'x' }), /between 1 and 25/);
await reject(() => additional(reduced, { unit: 5, start_m: 150, end_m: 160, reason: 'x' }), /135–315/);
await additional(reduced, { unit: 5, start_m: 150, end_m: 187.5, reason: 'FICTIONAL severe rutting', note: 'FICTIONAL note' });
const extra = (await db.query("select unit_number,sample_type,area_sqm::float8 area,inspection_notes from sample_units where section_id=$1 and sample_type='additional'", [reduced])).rows;
eq(extra, [{ unit_number: 5, sample_type: 'additional', area: 225, inspection_notes: 'Reason: FICTIONAL severe rutting\nNote: FICTIONAL note' }], 'additional unit saved with reason and note');

// Assign encoder to every planned unit; only active encoders.
await reject(() => assign(reduced, ids.viewer), /active encoder/);
await assign(reduced, ids.encoder);
eq((await units(reduced)).every(u => u.assigned_to === ids.encoder), true, 'every planned unit, including the additional one, is assigned');
const empty = await newSection('FICTIONAL no plan', 450, 90, 5);
await reject(() => assign(empty, ids.encoder), /confirm the sampling plan first/);
await as('encoder');
eq((await db.query('select count(*)::int c from sample_units where section_id=$1', [reduced])).rows[0].c, 5, 'assigned encoder can see the units');
await as('reviewer');

// Later additional units follow the assigned encoder.
await additional(reduced, { unit: 11, start_m: 375, end_m: 412.5, reason: 'FICTIONAL pothole cluster' });
eq((await db.query('select assigned_to from sample_units where section_id=$1 and unit_number=11', [reduced])).rows[0].assigned_to, ids.encoder);

// Choose units: only the ticked planned units change hands.
await db.exec('reset role');
const second = '00000000-0000-4000-8000-000000000004';
await db.query('insert into auth.users(id,email)values($1,$2)', [second, 'encoder2@fictional.invalid']);
await db.query("insert into profiles(id,full_name,role)values($1,'FICTIONAL encoder 2','encoder')", [second]);
await as('reviewer');
const chooseUnits = (target, inspector, unitList) => db.query('select lakad_assign_section_encoder($1,$2)', [target, { inspector, units: unitList }]);
await chooseUnits(reduced, second, [2, 14]);
eq((await units(reduced)).map(u => [u.unit_number, u.assigned_to === second]), [[2, true], [5, false], [8, false], [11, false], [14, true], [20, false]], 'only chosen units are reassigned');
await reject(() => chooseUnits(reduced, second, [3]), /not planned in this section or have already started: U3/);
await reject(() => chooseUnits(reduced, second, []), /at least one sample unit/);
const workload = Object.fromEntries((await db.query('select encoder_id,sections,units from lakad_encoder_workload()')).rows.map(r => [r.encoder_id, [r.sections, r.units]]));
eq([workload[ids.encoder], workload[second]], [[1, 4], [1, 2]], 'workload counts open units and sections per encoder');
await as('encoder');
await reject(() => db.query('select * from lakad_encoder_workload()'), /Only a Reviewer/);
await as('reviewer');

// Option 2: Eq. 1 with s = 10, e = 5 → n = 10 for N = 25, i = 2, random start in 1..2.
const confidence = await newSection('FICTIONAL confidence', 5625, 937.5, 6);
await confirm(confidence, { method: 'confidence', total: 25 });
const plan = (await db.query('select recommended_sample_units n,sampling_interval i,sampling_start_unit s from sections where id=$1', [confidence])).rows[0];
eq([plan.n, plan.i, plan.s >= 1 && plan.s <= 2], [10, 2, true], 'Option 2 n, i and random start');
const chosen = (await units(confidence)).map(u => u.unit_number);
eq(chosen, Array.from({ length: Math.floor((25 - plan.s) / 2) + 1 }, (_, k) => plan.s + 2 * k), 'Option 2 units are s, s+i, …');

// Required-unit function matches the client for the reduced table edges.
await db.exec('reset role');
eq((await db.query("select array_agg(lakad_private.required_sample_units('reduced', n) order by n) r from unnest(array[1,5,6,10,11,15,16,40,41,100,105]) n")).rows[0].r, [1, 1, 2, 2, 3, 3, 4, 4, 5, 10, 11]);

console.log(`Passed ${checks} sampling plan RPC checks in fictional local PGlite.`);
