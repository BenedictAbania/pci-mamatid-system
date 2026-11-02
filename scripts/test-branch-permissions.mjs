import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const query = (sql, args = []) => db.query(sql, args);
const ids = Object.fromEntries(['admin', 'reviewer', 'encoder', 'viewer'].map((role, index) =>
  [role, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
async function as(role) {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[role]]);
  await db.exec('set role authenticated');
}
async function deniedInsert(role, table, sql, args = []) {
  await as(role);
  await assert.rejects(() => query(sql, args), /row-level security|permission denied/i,
    `${role} must not insert ${table}`);
  checks++;
}
async function deniedUpdate(role, table, id, column) {
  await as(role);
  const result = await query(`update ${table} set ${column}=$1 where id=$2 returning id`,
    [`UNAUTHORIZED ${role}`, id]);
  check(result.rows.length === 0, `${role} must not update ${table}`);
}
try {
  await db.exec('create role service_role');
  for (const path of [
    'tests/schema-fixture.sql',
    'supabase/migrations/20260916_authenticated_workflow.sql',
    'supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql',
    'supabase/migrations/20261004151522_published_revisions_and_reports.sql',
    'supabase/migrations/20261004162431_d6433_24_provisional_calculations.sql',
  ]) await db.exec(await fs.readFile(path, 'utf8'));

  for (const [role, id] of Object.entries(ids)) {
    await query('insert into auth.users(id,email) values($1,$2)', [id, `${role}@synthetic.invalid`]);
    await query('insert into profiles(id,full_name,role) values($1,$2,$3)', [id, `SYNTHETIC ${role}`, role]);
  }

  // Reproduce the old direct database boundary before the new migration.
  await as('admin');
  const baseline = (await query("insert into branches(name,description) values('SYNTHETIC Baseline Branch','TEST ONLY') returning id")).rows[0].id;
  check(!!baseline, 'pre-migration Admin branch insert was allowed');
  await as('reviewer');
  check((await query("update branches set name='SYNTHETIC CE Baseline' where id=$1 returning id", [baseline])).rows.length === 1,
    'pre-migration Reviewer branch update was allowed');
  await deniedInsert('encoder', 'branches', "insert into branches(name) values('SYNTHETIC denied')");
  await deniedInsert('viewer', 'branches', "insert into branches(name) values('SYNTHETIC denied')");

  const sectionsBefore = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sections' order by policyname")).rows;
  await db.exec('reset role');
  await db.exec(await fs.readFile('supabase/migrations/20261031211658_reviewer_branch_registration.sql', 'utf8'));
  const sectionsAfter = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sections' order by policyname")).rows;
  assert.deepEqual(sectionsAfter, sectionsBefore, 'migration must not change section policies'); checks++;

  // All writes below run with the authenticated user's JWT claim and RLS.
  await as('reviewer');
  const inserted = (await query(
    "insert into branches(name,location,description,created_by) values('SYNTHETIC Mamatid Road','Barangay Mamatid','SYNTHETIC verified municipal source record', $1) returning id,created_by,updated_by",
    [ids.admin])).rows[0];
  check(!!inserted?.id, 'CE can register a branch');
  check(inserted.created_by === ids.reviewer && inserted.updated_by === ids.reviewer,
    'server records CE as creator and updater despite forged created_by');
  const branch = inserted.id;
  const edited = (await query("update branches set name='SYNTHETIC Mamatid Road corrected',created_by=$1 where id=$2 returning name,created_by,updated_by",
    [ids.admin, branch])).rows[0];
  check(edited?.name === 'SYNTHETIC Mamatid Road corrected' && edited.created_by === ids.reviewer && edited.updated_by === ids.reviewer,
    'CE can edit; original creator remains intact');

  await deniedInsert('admin', 'branches', "insert into branches(name) values('SYNTHETIC denied admin')");
  await deniedInsert('encoder', 'branches', "insert into branches(name) values('SYNTHETIC denied encoder')");
  await deniedInsert('viewer', 'branches', "insert into branches(name) values('SYNTHETIC denied viewer')");
  for (const role of ['admin', 'encoder', 'viewer']) await deniedUpdate(role, 'branches', branch, 'name');
  await as('reviewer');
  check((await query('select name from branches where id=$1', [branch])).rows[0].name === 'SYNTHETIC Mamatid Road corrected',
    'denied edits did not alter the branch');

  // Existing section creation/editing authority is intentionally left alone.
  await as('admin');
  const section = (await query("insert into sections(branch_id,name) values($1,'SYNTHETIC section') returning id", [branch])).rows[0].id;
  check(!!section, 'Admin can still create a section on a CE-registered branch');
  await as('reviewer');
  check((await query("update sections set name='SYNTHETIC section corrected' where id=$1 returning id", [section])).rows.length === 1,
    'existing Reviewer section-edit permission remains as before');
  await deniedInsert('encoder', 'sections', "insert into sections(branch_id,name) values($1,'SYNTHETIC denied')", [branch]);
  await deniedInsert('viewer', 'sections', "insert into sections(branch_id,name) values($1,'SYNTHETIC denied')", [branch]);

  await db.exec('reset role');
  await query("insert into sample_units(section_id,unit_number,assigned_to,reviewer_id) values($1,1,$2,$3)",
    [section, ids.encoder, ids.reviewer]);
  for (const role of ['admin', 'reviewer', 'encoder']) {
    await as(role);
    check((await query('select id from branches where id=$1', [branch])).rows.length === 1,
      `${role} retains intended branch read access`);
    check((await query('select id from sections where id=$1', [section])).rows.length === 1,
      `${role} retains intended section read access`);
  }
  await as('encoder');
  check((await query('select id from branches where id=$1', [baseline])).rows.length === 0,
    'Encoder cannot read a branch without an assigned section');
  await as('viewer');
  check((await query('select id from branches where id=$1', [branch])).rows.length === 0,
    'Viewer cannot read raw unpublished branches');
  check((await query('select id from sections where id=$1', [section])).rows.length === 0,
    'Viewer cannot read raw unpublished sections');

  await db.exec('reset role');
  await query('update profiles set is_active=false where id=$1', [ids.reviewer]);
  await deniedInsert('reviewer', 'branches', "insert into branches(name) values('SYNTHETIC inactive')");
  await deniedUpdate('reviewer', 'branches', branch, 'name');
  console.log(`Passed ${checks} isolated branch role/RLS checks. No hosted data changed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.close();
}
