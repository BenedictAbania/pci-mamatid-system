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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !fullName || fullName.length > 150) {
      return response(400, { error: 'Valid email and full name required' });
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
    if (error) return response(400, { error: 'Invitation could not be sent' });
    await admin.from('lakad_audit').insert({ actor_id: authData.user.id, action: 'account_invited', target_id: data.user.id });
    return response(200, { success: true });
  } catch {
    return response(500, { error: 'Account operation failed' });
  }
});
