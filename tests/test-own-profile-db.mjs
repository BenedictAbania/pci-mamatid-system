// My Profile: self-service name, office, job title and profile photo, in fictional local PGlite.
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
  'supabase/migrations/20261107120000_profiles_office_job_title.sql',
  'supabase/migrations/20261108160000_own_profile.sql',
]) await db.exec(await fs.readFile(path, 'utf8'));

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };

const ids = {
  encoder: '00000000-0000-4000-8000-000000000001', other: '00000000-0000-4000-8000-000000000002',
  reviewer: '00000000-0000-4000-8000-000000000003', viewer: '00000000-0000-4000-8000-000000000004',
};
const roles = { encoder: 'encoder', other: 'encoder', reviewer: 'reviewer', viewer: 'viewer' };
for (const [key, id] of Object.entries(ids)) {
  await db.query('insert into auth.users(id,email)values($1,$2)', [id, `${key}@fictional.invalid`]);
  await db.query('insert into profiles(id,full_name,role)values($1,$2,$3)', [id, `FICTIONAL ${key}`, roles[key]]);
}
async function as(key) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[key]]);
  await db.exec('set role authenticated');
}
const save = (name, office, title, avatar) => db.query('select lakad_update_own_profile($1,$2,$3,$4)', [name, office, title, avatar]);
const profile = async id => { await db.exec('reset role'); return (await db.query('select full_name,office,job_title,avatar_path,role from profiles where id=$1', [id])).rows[0]; };
const upload = name => db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [name]);
const visible = async () => (await db.query("select name from storage.objects where bucket_id='profile-photos' order by name")).rows.map(r => r.name);

eq((await db.query("select public,file_size_limit::integer as size from storage.buckets where id='profile-photos'")).rows[0], { public: false, size: 2097152 }, 'Private 2 MiB photo bucket');

// Uploads only into your own folder.
const mine = `${ids.encoder}/1700000000000-a.png`;
await as('encoder');
await upload(mine);
await reject(() => upload(`${ids.other}/x.png`), /row-level security/);

// Save name, office, title and photo; role is untouched.
await as('encoder');
await save('  FICTIONAL Juan Encoder  ', 'FICTIONAL Engineering Office', 'FICTIONAL Field Inspector', mine);
eq(await profile(ids.encoder), { full_name: 'FICTIONAL Juan Encoder', office: 'FICTIONAL Engineering Office', job_title: 'FICTIONAL Field Inspector', avatar_path: mine, role: 'encoder' }, 'Own profile saved');
eq((await db.query("select count(*)::integer as n from lakad_audit where action='profile_self_edited' and actor_id=$1", [ids.encoder])).rows[0].n, 1, 'Self edit is audited');

// Validation.
await as('encoder');
await reject(() => save('   ', '', '', null), /Full name required/);
await reject(() => save('x'.repeat(151), '', '', null), /Full name required/);
await reject(() => save('FICTIONAL', 'o'.repeat(151), '', null), /Office or department/);
await reject(() => save('FICTIONAL', '', '', `${ids.encoder}/missing.png`), /Upload the profile photo/);
await reject(() => save('FICTIONAL', '', '', `${ids.encoder}/photo.gif`), /JPEG, PNG or WebP/);
await db.exec('reset role');
await db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [`${ids.other}/theirs.png`]);
await as('encoder');
await reject(() => save('FICTIONAL', '', '', `${ids.other}/theirs.png`), /your own folder/);

// The photo in use cannot be deleted; others' photos are hidden from other encoders.
await as('encoder');
eq((await db.query("delete from storage.objects where bucket_id='profile-photos' and name=$1", [mine])).affectedRows, 0, 'Current photo is protected');
eq(await visible(), [mine], 'Encoder sees only their own photos');
await as('reviewer');
eq((await visible()).length, 2, 'Reviewer can read profile photos');

// Removing the photo, then deleting the old file.
await as('encoder');
await save('FICTIONAL Juan Encoder', 'FICTIONAL Engineering Office', 'FICTIONAL Field Inspector', null);
eq((await profile(ids.encoder)).avatar_path, null, 'Photo removed from the profile');
await as('encoder');
eq((await db.query("delete from storage.objects where bucket_id='profile-photos' and name=$1", [mine])).affectedRows, 1, 'Old photo file can then be deleted');

// Every role may edit their own profile, never someone else's.
await as('viewer');
await save('FICTIONAL Viewer Name', '', '', null);
eq((await profile(ids.viewer)).full_name, 'FICTIONAL Viewer Name', 'Viewer edits their own profile');
eq((await profile(ids.other)).full_name, 'FICTIONAL other', 'Nobody else changes');
await as('encoder');
await reject(() => db.query("update profiles set role='admin' where id=$1", [ids.encoder]).then(r => { if (!r.affectedRows) throw new Error('row-level security'); }), /row-level security|permission denied/);

console.log(`Passed ${checks} own-profile checks in fictional local PGlite.`);
await db.close();
