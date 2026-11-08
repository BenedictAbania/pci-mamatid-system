// Survey rounds (ASTM D6433-07 §7.5.2 / §7.5.2.1 / §7.5.3) in fictional local PGlite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec('create role service_role');
for (const name of [
  '20260916_authenticated_workflow.sql',
  '20260916140000_align_sample_unit_area_with_manuscript.sql',
  '20261004151522_published_revisions_and_reports.sql',
  '20261004162431_d6433_24_provisional_calculations.sql',
  '20261031211658_reviewer_branch_registration.sql',
  '20261102023605_reviewer_section_registration.sql',
  '20261103045543_d6433_07_provisional_edition.sql',
  '20261103105805_d6433_07_severity_guidance_snapshot.sql',
  '20261103120853_d6433_07_measurement_parts.sql',
  '20261107140000_branch_registration_fields.sql',
  '20261107150000_section_registration_fields.sql',
  '20261107160000_section_sampling_plan.sql',
  '20261107170000_encoder_assignment_choices.sql',
  '20261108120000_inspection_preview_context.sql',
  '20261108130000_section_summaries.sql',
  '20261108140000_provisional_publication.sql',
  '20261108150000_survey_rounds.sql',
]) {
  if (name === '20260916_authenticated_workflow.sql') await db.exec(await fs.readFile('tests/fixtures/schema-fixture.sql', 'utf8'));
  await db.exec(await fs.readFile(`supabase/migrations/${name}`, 'utf8'));
}

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message) => { assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`); checks++; };
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
const rounds = async target => (await db.query('select lakad_survey_rounds($1) as r', [target])).rows[0].r;
const start = (target, payload) => db.query('select lakad_start_survey_round($1,$2) as r', [target, payload]);
const unitsOf = async (target, round) => (await db.query(
  'select unit_number from sample_units where section_id=$1 and survey_round=$2 order by unit_number', [target, round])).rows.map(r => r.unit_number);

// N = 25 (5625 m²). Round 1, Option 2 with s = 10: n = 10, i = 2, start 1 → SU1, SU3, … SU25 (13 units).
await as('reviewer');
const branch = (await db.query("insert into branches(name,branch_code)values('FICTIONAL branch','FIC-R01') returning id")).rows[0].id;
const section = (await db.query(
  "insert into sections(branch_id,name,area_sqm,length_meters,width_meters) values($1,'FICTIONAL rounds',5625,937.5,6) returning id", [branch])).rows[0].id;
await db.query('select lakad_confirm_sampling_plan($1,$2)', [section, { method: 'confidence', total: 25, first: 1 }]);
const round1 = await unitsOf(section, 1);
eq(round1, [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25], 'Round 1 keeps its own plan');
eq((await rounds(section)).current_round, 1, 'A new plan is round 1');
eq([(await rounds(section)).ready, (await rounds(section)).published, (await rounds(section)).units], [false, 0, 13], 'Round 1 is not complete yet');
await reject(() => start(section, { method: 'confidence' }), /Publish every sample unit of round 1 first \(0 of 13 published\)/);
await as('encoder');
await reject(() => rounds(section), /Civil Engineer/);
await reject(() => start(section, { method: 'all' }), /Civil Engineer/);

// Fictional published round-1 results (triggers off only for this fixture).
const pcis = [70, 72, 74, 76, 78, 70, 72, 74, 76, 78, 70, 72, 74];
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
const round1Results = [];
for (const [index, unit] of round1.entries()) {
  const sample = (await db.query("update sample_units set workflow_state='published' where section_id=$1 and survey_round=1 and unit_number=$2 returning id, area_sqm::float8 area", [section, unit])).rows[0];
  const computation = (await db.query(
    "insert into inspection_computations(sample_unit_id,input_revision,edition,input_snapshot) values($1,1,'ASTM D6433-07','{}') returning id", [sample.id])).rows[0].id;
  await db.query('insert into approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at) values($1,$2,1,$3,now(),now())',
    [computation, sample.id, { sample: { area_sqm: sample.area, unit_number: unit, sample_type: 'random' }, output: { pci: pcis[index], condition: 'Satisfactory' }, edition: 'ASTM D6433-07' }]);
  round1Results.push(computation);
}
const round1Section = (await db.query(
  "insert into section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,approved_by) values($1,'ASTM D6433-07','fictional','D6433-07 §11.1',$2,'{}',73.5,'Satisfactory',$3) returning id",
  [section, round1Results, ids.reviewer])).rows[0].id;
await db.exec('set session_replication_role = origin');
eq((await db.query('select survey_round from section_results where id=$1', [round1Section])).rows[0].survey_round, 1, 'Round-1 section result is labelled round 1');

// §7.5.2.1 Eq. 2: sample standard deviation of the round-1 random PCIs.
const mean = pcis.reduce((a, b) => a + b, 0) / pcis.length;
const s = Math.sqrt(pcis.reduce((sum, pci) => sum + (pci - mean) ** 2, 0) / (pcis.length - 1));
await as('reviewer');
const status = await rounds(section);
eq([status.ready, status.published, status.units, status.random_count], [true, 13, 13, 13], 'Round 1 complete');
near(Number(status.deviation), s, 'Eq. 2 standard deviation');
near(Number(status.mean), mean, 'Mean PCI of round 1');

// §7.5.2 Eq. 1 with measured s and e = 5, then §7.5.3 Eq. 3.
const n = Math.max(1, Math.min(25, Math.ceil(25 * s ** 2 / ((25 / 4) * 24 + s ** 2))));
const i = Math.floor(25 / n);
await reject(() => start(section, { method: 'confidence', first: i + 1 }), new RegExp(`between 1 and the sampling interval ${i}`));
eq((await start(section, { method: 'confidence', first: 1 })).rows[0].r, 2, 'Round 2 starts');
const expected = []; for (let unit = 1; unit <= 25; unit += i) expected.push(unit);
eq(await unitsOf(section, 2), expected, `Round 2 picks every ${i}th unit for n = ${n}`);
eq(await unitsOf(section, 1), round1, 'Round-1 units stay as history');
const plan = (await rounds(section)).rounds[0];
eq([plan.round, plan.method, plan.total, plan.required, plan.interval, plan.first, plan.previous_count], [2, 'confidence', 25, n, i, 1, 13], 'Round-2 plan is stored');
near(Number(plan.deviation), s, 'Round-2 plan keeps s');
eq([(await rounds(section)).current_round, (await rounds(section)).ready], [2, false], 'Round 2 is now current and not complete');
await reject(() => start(section, { method: 'all' }), /Publish every sample unit of round 2 first/);

// Additional units join the current round; the same unit number may exist in two rounds.
const spare = Array.from({ length: 25 }, (_, k) => k + 1).find(unit => !expected.includes(unit));
const slot = 937.5 / 25;
await db.query('select lakad_add_additional_sample_unit($1,$2)', [section, { unit: spare, start_m: (spare - 1) * slot, end_m: (spare - 1) * slot + 37.5, reason: 'FICTIONAL pothole cluster' }]);
eq((await db.query("select survey_round from sample_units where section_id=$1 and sample_type='additional'", [section])).rows[0].survey_round, 2, 'Additional unit joins round 2');
await reject(() => db.query('select lakad_add_additional_sample_unit($1,$2)', [section, { unit: expected[0], start_m: 0, end_m: 37.5, reason: 'x' }]), /SU1 is already selected/);

// The section calculation and section results use only the current round.
await db.exec('reset role');
await reject(() => db.query("select lakad_private.calculation_context($1,$2,'section')", [ids.reviewer, section]), /Complete selected cohort/);
eq((await db.query('select lakad_private.valid_section_result($1,true) as v', [round1Section])).rows[0].v, true, 'Round-1 section result stays valid during round 2');
await as('viewer');
const summaries = (await db.query('select lakad_section_summaries() as s')).rows[0].s;
eq([summaries.total, summaries.rows[0].inspected], [1, 13], 'Viewer keeps the round-1 section PCI until round 2 is published');

// Option 2 needs at least two random PCIs to measure s.
await as('reviewer');
const tiny = (await db.query(
  "insert into sections(branch_id,name,area_sqm,length_meters,width_meters) values($1,'FICTIONAL single',225,45,5) returning id", [branch])).rows[0].id;
await db.query('select lakad_confirm_sampling_plan($1,$2)', [tiny, { method: 'all', total: 1 }]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
const only = (await db.query("update sample_units set workflow_state='published' where section_id=$1 returning id", [tiny])).rows[0].id;
const onlyComputation = (await db.query("insert into inspection_computations(sample_unit_id,input_revision,edition,input_snapshot) values($1,1,'ASTM D6433-07','{}') returning id", [only])).rows[0].id;
await db.query('insert into approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at) values($1,$2,1,$3,now(),now())',
  [onlyComputation, only, { sample: { area_sqm: 225, unit_number: 1, sample_type: 'random' }, output: { pci: 80 } }]);
await db.exec('set session_replication_role = origin');
await as('reviewer');
await reject(() => start(tiny, { method: 'confidence' }), /at least two random sample units/);
eq((await start(tiny, { method: 'all' })).rows[0].r, 2, 'Option 1 needs no standard deviation');
eq(await unitsOf(tiny, 2), [1], 'Option 1 round 2 inspects every unit');

console.log(`Passed ${checks} survey round checks in fictional local PGlite.`);
await db.close();
