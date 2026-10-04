import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { handler } from './handler.ts';
import { privateCurveReader, ReferenceUnavailable } from '../_shared/d6433-24/curves.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(handler({
  async authenticate(token) {
    const {data,error}=await service.auth.getUser(token);
    if(error||!data.user)throw new Error('Unauthorized JWT');
    return data.user.id;
  },
  async context(token,target,kind) {
    const scoped=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
    const {data,error}=await scoped.rpc('lakad_calculation_context',{target,kind});
    if(error)throw new Error(error.message);return data;
  },
  async reference() {
    const path=Deno.env.get('D6433_24_REFERENCE_PATH');
    if(!path)throw new ReferenceUnavailable('Private D6433-24 reference package is not configured; no prototype fallback');
    const {data,error}=await service.storage.from('pci-reference-data').download(path);
    if(error||!data)throw new ReferenceUnavailable('Private D6433-24 reference package unavailable');
    if(data.size>5*1024*1024)throw new ReferenceUnavailable('Reference package exceeds 5 MB');
    const bytes=await data.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    // Bind content to an administrator-approved hash, not a self-reported JSON claim.
    if(digest!==Deno.env.get('D6433_24_REFERENCE_SHA256'))throw new ReferenceUnavailable('Reference package content hash is not approved');
    return privateCurveReader(JSON.parse(new TextDecoder().decode(bytes)),digest);
  },
  async save(actor,context,output) {
    const {error}=await service.rpc('lakad_record_provisional_calculation',{actor,context,output});
    if(error)throw new Error(error.message);
  },
}));
