import { calculateSample } from '../_shared/d6433-24/sample.ts';
import { calculateSection, type SectionInput } from '../_shared/d6433-24/section.ts';
import { sampleFromSnapshot } from '../_shared/d6433-24/snapshot.ts';
import { ReferenceUnavailable, type CurveReader } from '../_shared/d6433-24/curves.ts';
type Context = {kind:'sample';id:string;revision:number;version:number;edition:string;input:Parameters<typeof sampleFromSnapshot>[0]}
 | {kind:'section';id:string;input:SectionInput};
export type Dependencies = {
  authenticate(token:string):Promise<string>;
  context(token:string,target:string,kind:'sample'|'section'):Promise<Context>;
  reference():Promise<CurveReader>;
  save(actor:string,context:Context,output:unknown):Promise<void>;
};
/** JWT -> scoped immutable context -> private curve package -> CAS write.
 * Browser quantities, output, reference data and verification flags are never accepted. */
export function handler(deps:Dependencies) {
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json'};
  return async(req:Request)=>{
    if(req.method==='OPTIONS')return new Response(null,{headers});
    if(req.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers});
    try {
      const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if(!token)return new Response(JSON.stringify({error:'Authentication required'}),{status:401,headers});
      const actor=await deps.authenticate(token);
      if(Number(req.headers.get('content-length')??0)>4096)throw new Error('Request too large');
      const raw=await req.text();if(raw.length>4096)throw new Error('Request too large');
      const body=JSON.parse(raw);
      if(!body||Object.keys(body).some(k=>!['kind','target'].includes(k))||!['sample','section'].includes(body.kind)||typeof body.target!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.target))throw new Error('Only a calculation kind and target UUID are accepted');
      const context=await deps.context(token,body.target,body.kind);
      const output=context.kind==='section' ? calculateSection(context.input) : await (async()=>{
        const input=sampleFromSnapshot(context.input,context.edition);
        const reader=input.observations.length ? await deps.reference() : undefined;
        return calculateSample(input,reader);
      })();
      await deps.save(actor,context,output);
      return new Response(JSON.stringify(output),{headers});
    } catch(error) {
      const message=error instanceof Error?error.message:'Calculation failed';
      const status=error instanceof ReferenceUnavailable?503:/permission|assignment|staff|Reviewer|active|unauthorized|JWT/i.test(message)?403:409;
      return new Response(JSON.stringify({error:message}),{status,headers});
    }
  };
}
