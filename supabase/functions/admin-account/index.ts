// Deno resolves npm: specifiers at Edge Function deployment time.
// eslint-disable-next-line import/no-unresolved
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Administrator account actions that need the service role:
 * - set_password: sets a new sign-in password for another account.
 * - delete: removes another account's login and profile for good. Allowed only when no
 *   record points to the account (public.lakad_account_references); otherwise the
 *   administrator deactivates it instead, so no inspection history or audit trail is lost.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt ignores anything longer.
const PROFILE_PHOTO_BUCKET = 'profile-photos';

/** Plain names for the tables that can hold an account's records. */
const RECORD_NAMES: Record<string, string> = {
  'public.sample_units': 'sample units',
  'public.distress_records': 'distress records',
  'public.distress_photos': 'distress photos',
  'public.inspection_history': 'inspection history entries',
  'public.inspection_computations': 'PCI computations',
  'public.lakad_audit': 'audit log entries',
  'public.section_results': 'approved section results',
  'public.provisional_section_calculations': 'section calculations',
  'public.section_survey_rounds': 'survey rounds',
  'public.sections': 'road sections',
  'public.branches': 'road network branches',
  'public.lakad_settings': 'settings changes',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function describeRecords(references: Record<string, number>) {
  return Object.entries(references)
    .map(([table, count]) => `${count} ${RECORD_NAMES[table] ?? table.replace(/^public\./, '').replace(/_/g, ' ')}`)
    .join(', ');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });

  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return response(401, { error: 'Unauthorized' });

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return response(500, { error: 'Function configuration missing' });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return response(401, { error: 'Unauthorized' });

    const { data: caller } = await admin.from('profiles').select('role,is_active').eq('id', authData.user.id).single();
    if (caller?.role !== 'admin' || caller.is_active !== true) return response(403, { error: 'Administrator access required' });

    const body = await request.json();
    const action = body?.action;
    const target = typeof body?.target === 'string' ? body.target : '';
    if (!UUID.test(target)) return response(400, { error: 'Valid account required' });
    if (target === authData.user.id) return response(400, { error: 'You cannot change or delete your own account here.' });

    const { data: profile, error: profileError } = await admin.from('profiles').select('id,role,full_name').eq('id', target).maybeSingle();
    if (profileError) return response(500, { error: 'The account could not be checked' });
    if (!profile) return response(404, { error: 'This account no longer exists. Refresh the list.' });

    if (action === 'set_password') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return response(400, { error: `Use a password of ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.` });
      }
      const { error } = await admin.auth.admin.updateUserById(target, { password });
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'weak_password') return response(400, { error: 'This password is too weak. Use a longer password with letters and numbers.' });
        return response(400, { error: 'The password could not be changed' });
      }
      await admin.from('lakad_audit').insert({ actor_id: authData.user.id, action: 'account_password_set', target_id: target, detail: {} });
      return response(200, { success: true });
    }

    if (action === 'delete') {
      const { data: references, error: referenceError } = await admin.rpc('lakad_account_references', { target });
      if (referenceError) return response(500, { error: 'The account records could not be checked' });
      const records = (references ?? {}) as Record<string, number>;
      if (Object.keys(records).length) {
        return response(409, {
          error: `This account cannot be deleted because LAKAD still has records linked to it (${describeRecords(records)}). Deactivate it instead, or reassign its work first.`,
          records,
        });
      }

      // Profile photos live under <user id>/ in a private bucket and have no foreign key, so remove them first.
      const { data: photos } = await admin.storage.from(PROFILE_PHOTO_BUCKET).list(target, { limit: 1000 });
      if (photos?.length) await admin.storage.from(PROFILE_PHOTO_BUCKET).remove(photos.map((file) => `${target}/${file.name}`));

      // Deleting the login cascades to public.profiles (profiles.id references auth.users on delete cascade).
      const { error } = await admin.auth.admin.deleteUser(target);
      if (error) return response(409, { error: 'The account could not be deleted. It may have records linked to it; deactivate it instead.' });
      await admin.from('lakad_audit').insert({ actor_id: authData.user.id, action: 'account_deleted', target_id: target, detail: { role: profile.role, full_name: profile.full_name } });
      return response(200, { success: true });
    }

    return response(400, { error: 'Unknown account action' });
  } catch {
    return response(500, { error: 'Account operation failed' });
  }
});
