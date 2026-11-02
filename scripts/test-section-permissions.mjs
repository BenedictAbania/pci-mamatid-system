import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const query = (sql, args = []) => db.query(sql, args);
const ids = Object.fromEntries(['admin', 'reviewer', 'encoder', 'viewer'].map((role, index) =>
  [role, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
async function as(role) {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[role]]);
  await db.exec('set role authenticated');
}
async function deniedInsert(role, branch) {
  await as(role);
  await assert.rejects(() => query(
    "insert into sections(branch_id,name) values($1,'SYNTHETIC unauthorized') returning id", [branch]),
    /row-level security|permission denied/i, `${role} cannot create a section`);
  checks++;
}
async function deniedUpdate(role, id) {
  await as(role);
  const result = await query(
    "update sections set name='SYNTHETIC unauthorized' where id=$1 returning id", [id]);
  check(result.rows.length === 0, `${role} cannot edit a section`);
}
try {
  await db.exec('create role service_role');
  for (const path of [
    'tests/schema-fixture.sql',
    'supabase/migrations/20260916_authenticated_workflow.sql',
    'supabase/migrations/20260916140000_align_sample_unit_area_with_manuscript.sql',
    'supabase/migrations/20261004151522_published_revisions_and_reports.sql',
    'supabase/migrations/20261004162431_d6433_24_provisional_calculations.sql',
    'supabase/migrations/20261031211658_reviewer_branch_registration.sql',
  ]) await db.exec(await fs.readFile(path, 'utf8'));

  for (const [role, id] of Object.entries(ids)) {
    await query('insert into auth.users(id,email) values($1,$2)', [id, `${role}@synthetic.invalid`]);
    await query('insert into profiles(id,full_name,role) values($1,$2,$3)', [id, `SYNTHETIC ${role}`, role]);
  }
  await as('reviewer');
  const branch = (await query(
    "insert into branches(name) values('SYNTHETIC section-policy road') returning id")).rows[0].id;

  // Reproduce the legacy permission and retain its row across the migration.
  await as('admin');
  const existing = (await query(
    "insert into sections(branch_id,name,length_meters,width_meters,area_sqm) values($1,'SYNTHETIC existing section',45,5,225) returning id,created_by",
    [branch])).rows[0];
  check(existing.created_by === ids.admin, 'legacy Admin could create a section before migration');

  const before = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sections' order by policyname")).rows;
  const approvalBefore = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sample_units' order by policyname")).rows;
  await db.exec('reset role');
  await db.exec(await fs.readFile('supabase/migrations/20261102023605_reviewer_section_registration.sql', 'utf8'));
  const after = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sections' order by policyname")).rows;
  const approvalAfter = (await query("select policyname,cmd,permissive,qual,with_check from pg_policies where schemaname='public' and tablename='sample_units' order by policyname")).rows;
  check(after.length === before.length + 4, 'migration adds only four section policies');
  check(after.filter(row => row.cmd === 'DELETE').length === before.filter(row => row.cmd === 'DELETE').length,
    'section deletion policies are unchanged');
  assert.deepEqual(approvalAfter, approvalBefore, 'inspection policies are unchanged'); checks++;
  check((await query('select name from sections where id=$1', [existing.id])).rows[0].name === 'SYNTHETIC existing section',
    'existing section data is retained');

  await as('reviewer');
  const created = (await query(
    "insert into sections(branch_id,name,length_meters,width_meters,area_sqm,created_by) values($1,'SYNTHETIC CE section',45,5,225,$2) returning id,created_by,updated_by",
    [branch, ids.admin])).rows[0];
  check(!!created.id && created.created_by === ids.reviewer && created.updated_by === ids.reviewer,
    'CE creates a section; trigger rejects a forged creator');
  const edited = (await query(
    "update sections set name='SYNTHETIC CE section corrected',created_by=$1 where id=$2 returning name,created_by,updated_by",
    [ids.admin, created.id])).rows[0];
  check(edited.name === 'SYNTHETIC CE section corrected' && edited.created_by === ids.reviewer && edited.updated_by === ids.reviewer,
    'CE edits a section while creator remains immutable');
  const legacyEdit = (await query(
    "update sections set description='SYNTHETIC CE correction' where id=$1 returning created_by,description",
    [existing.id])).rows[0];
  check(legacyEdit.created_by === ids.admin && legacyEdit.description === 'SYNTHETIC CE correction',
    'CE can correct a retained legacy section without changing its original creator');

  for (const role of ['admin', 'encoder', 'viewer']) {
    await deniedInsert(role, branch);
    await deniedUpdate(role, created.id);
  }
  await as('reviewer');
  check((await query('select name from sections where id=$1', [created.id])).rows[0].name === 'SYNTHETIC CE section corrected',
    'denied writes did not alter the section');

  // Existing read scope: Admin and CE can see inventory; assigned Encoder can
  // see its section; Viewer cannot see an unpublished section.
  await db.exec('reset role');
  await query('insert into sample_units(section_id,unit_number,assigned_to,reviewer_id) values($1,1,$2,$3)',
    [created.id, ids.encoder, ids.reviewer]);
  for (const role of ['admin', 'reviewer', 'encoder']) {
    await as(role);
    check((await query('select id from sections where id=$1', [created.id])).rows.length === 1,
      `${role} retains authorized section read access`);
  }
  await as('viewer');
  check((await query('select id from sections where id=$1', [created.id])).rows.length === 0,
    'Viewer cannot read an unpublished raw section');

  await as('reviewer');
  await query('update sections set homogeneous_confirmed_by=$1,homogeneous_confirmed_at=now() where id=$2',
    [ids.reviewer, existing.id]);
  await assert.rejects(() => query('update sections set length_meters=46 where id=$1', [existing.id]),
    /confirmed section layout is locked|boundaries are immutable/i);
  checks++;
  check((await query('update sections set notes=$1 where id=$2 returning id',
    ['SYNTHETIC note correction', existing.id])).rows.length === 1,
    'CE may update notes without altering confirmed layout');

  await db.exec('reset role');
  await query('update profiles set is_active=false where id=$1', [ids.reviewer]);
  await deniedInsert('reviewer', branch);
  await deniedUpdate('reviewer', existing.id);

  await db.exec('reset role');
  // The compact legacy fixture omits these hosted trigger helpers; give them
  // the same signatures so the grant migration can be exercised locally.
  for (const name of ['handle_new_user', 'set_updated_at', 'validate_distress_severity']) {
    await db.exec(`create function public.${name}() returns trigger language plpgsql as $$ begin return new; end $$`);
  }
  await db.exec(await fs.readFile('supabase/migrations/20261102030601_harden_legacy_function_execute.sql', 'utf8'));
  check((await query("select has_function_privilege('anon','public.get_my_role()','EXECUTE') allowed")).rows[0].allowed === false,
    'anonymous role cannot call the legacy role helper');
  check((await query("select has_function_privilege('authenticated','public.get_my_role()','EXECUTE') allowed")).rows[0].allowed === true,
    'signed-in users retain legacy role helper access for existing policies');
  for (const signature of ['handle_new_user()', 'set_updated_at()', 'validate_distress_severity()']) {
    for (const role of ['anon', 'authenticated']) {
      check((await query(`select has_function_privilege('${role}','public.${signature}','EXECUTE') allowed`)).rows[0].allowed === false,
        `${role} cannot directly invoke trigger helper ${signature}`);
    }
  }
  console.log(`Passed ${checks} isolated section role/RLS checks. No hosted data changed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.close();
}
