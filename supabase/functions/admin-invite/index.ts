// Deno resolves npm: specifiers at Edge Function deployment time.
// eslint-disable-next-line import/no-unresolved
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

/** supabase-js has no lookup by email, so page through the logins (this project has few). */
async function findAuthUser(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
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

    const { data: profile } = await admin.from('profiles').select('role,is_active').eq('id', authData.user.id).single();
    if (profile?.role !== 'admin' || profile.is_active !== true) return response(403, { error: 'Administrator access required' });

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const office = typeof body.office === 'string' ? body.office.trim() : '';
    const jobTitle = typeof body.job_title === 'string' ? body.job_title.trim() : '';
    // Quick invites send only name and email: role defaults to encoder, office and job title stay empty.
    const role = typeof body.role === 'string' && body.role ? body.role : 'encoder';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !fullName || fullName.length > 150) {
      return response(400, { error: 'Valid email and full name required' });
    }
    if (office.length > 150 || jobTitle.length > 150) {
      return response(400, { error: 'Office and job title must be 150 characters or fewer' });
    }
    if (!['admin', 'reviewer', 'encoder', 'viewer'].includes(role)) {
      return response(400, { error: 'Valid role required' });
    }

    // Invitees land on the LAKAD welcome page. LAKAD_SITE_URL (function secret) wins; otherwise the
    // admin's own site origin is used. Supabase still rejects any URL missing from its Redirect URLs list.
    const site = (Deno.env.get('LAKAD_SITE_URL') ?? request.headers.get('Origin') ?? '').replace(/\/+$/, '');
    const redirectTo = /^https?:\/\/[^\s/]+$/i.test(site) ? `${site}/welcome` : undefined;

    const sendInvite = () => admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, office, job_title: jobTitle }, redirectTo });
    let { data, error } = await sendInvite();
    if ((error as { code?: string } | null)?.code === 'email_exists') {
      // A login left behind after its profile row was deleted blocks the email for good. Clear it and invite again.
      // A login that still has a profile is a real account: never touched here (deactivate or reactivate it instead).
      const existing = await findAuthUser(admin, email);
      if (existing && existing.id !== authData.user.id) {
        const { data: linked, error: linkError } = await admin.from('profiles').select('id').eq('id', existing.id).maybeSingle();
        if (!linkError && !linked && !(await admin.auth.admin.deleteUser(existing.id)).error) ({ data, error } = await sendInvite());
      }
    }
    const invitedId = data?.user?.id;
    if (error || !invitedId) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'email_exists') return response(409, { error: 'An account with this email address already exists. If it was deactivated, reactivate it from the account list.' });
      if (code === 'over_email_send_rate_limit') return response(429, { error: 'Too many emails were sent recently. Please wait and try again.' });
      return response(400, { error: 'Invitation could not be sent' });
    }
    // handle_new_user created the profile with the default role; set the chosen role and work details.
    const { error: profileError } = await admin.from('profiles')
      .update({ role, office, job_title: jobTitle, updated_at: new Date().toISOString() })
      .eq('id', invitedId);
    await admin.from('lakad_audit').insert({ actor_id: authData.user.id, action: 'account_invited', target_id: invitedId, detail: { role } });
    if (profileError) return response(500, { error: 'Invitation sent, but the role and office could not be saved. Set them from the account list.' });
    return response(200, { success: true });
  } catch {
    return response(500, { error: 'Account operation failed' });
  }
});
