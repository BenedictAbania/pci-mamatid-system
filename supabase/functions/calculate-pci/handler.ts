import { calculateSample } from '../_shared/d6433-07/sample.ts';
import { EDITION, definition, type Severity } from '../_shared/d6433-07/catalog.ts';
import { calculateSection, type SectionInput } from '../_shared/d6433-07/section.ts';
import { sampleFromSnapshot } from '../_shared/d6433-07/snapshot.ts';
import { ReferenceUnavailable, type CurveReader } from '../_shared/d6433-07/curves.ts';
type Context = {kind:'sample';id:string;revision:number;version:number;edition:string;input:Parameters<typeof sampleFromSnapshot>[0]}
 | {kind:'preview';id:string;revision:number;edition:string;input:Parameters<typeof sampleFromSnapshot>[0]}
 | {kind:'section';id:string;input:SectionInput};
export type Dependencies = {
  authenticate(token:string):Promise<string>;
  context(token:string,target:string,kind:'sample'|'preview'|'section'):Promise<Context>;
  reference():Promise<CurveReader>;
  save(actor:string,context:Context,output:unknown):Promise<void>;
  /** On/off switch for the public prototype's `demo` kind (PCI_PUBLIC_DEMO=on). */
  demoEnabled():boolean;
};
const DEMO_MAX_OBSERVATIONS=30;
/** Public prototype input: area plus one quantity per distress and severity. No IDs, tokens, units or outputs. */
function demoInput(body:Record<string,unknown>) {
  if(Object.keys(body).some(k=>!['kind','area_sqm','observations'].includes(k)))throw new Error('Only kind, area_sqm and observations are accepted');
  const area=body.area_sqm, rows=body.observations;
  if(typeof area!=='number'||!Number.isFinite(area))throw new Error('area_sqm must be a number');
  if(!Array.isArray(rows)||rows.length>DEMO_MAX_OBSERVATIONS)throw new Error('observations must be a list of at most '+DEMO_MAX_OBSERVATIONS+' rows');
  const observations=rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['code','severity','quantity'].includes(k)))throw new Error('Each observation needs only code, severity and quantity');
    const {code,severity,quantity}=row as Record<string,unknown>;
    if(typeof code!=='number'||!Number.isInteger(code))throw new Error('Distress code must be a whole number');
    if(severity!==null&&!['low','medium','high'].includes(severity as string))throw new Error('Severity must be low, medium, high or null');
    if(typeof quantity!=='number')throw new Error('Quantity must be a number');
    return {code,severity:severity as Severity|null,quantity,unit:definition(code).unit};
  });
  // The shared engine applies every D6433-07 input rule (area range, units, severities, combined area).
  return {edition:EDITION,area_sqm:area,observations,no_distress_confirmed:observations.length===0,field_rules_confirmed:true};
}
/** JWT -> scoped immutable context -> private curve package -> CAS write.
 * `preview` computes the assigned inspector's current draft and saves nothing.
 * `demo` is the public prototype: no sign-in, browser quantities, nothing saved, and only
 * when switched on. It returns results, never curve data. Every other kind never accepts
 * browser quantities, output, reference data or verification flags. */
export function handler(deps:Dependencies) {
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json'};
  return async(req:Request)=>{
    if(req.method==='OPTIONS')return new Response(null,{headers});
    if(req.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers});
    try {
      if(Number(req.headers.get('content-length')??0)>4096)throw new Error('Request too large');
      const raw=await req.text();if(raw.length>4096)throw new Error('Request too large');
      let parsed:unknown=null;
      try {parsed=JSON.parse(raw);} catch { /* reported below for authenticated kinds */ }
      if(parsed&&typeof parsed==='object'&&(parsed as Record<string,unknown>).kind==='demo') {
        if(!deps.demoEnabled())return new Response(JSON.stringify({error:'The public demo calculation is turned off'}),{status:403,headers});
        const input=demoInput(parsed as Record<string,unknown>);
        const reader=input.observations.length ? await deps.reference() : undefined;
        return new Response(JSON.stringify(calculateSample(input,reader)),{headers});
      }
      const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if(!token)return new Response(JSON.stringify({error:'Authentication required'}),{status:401,headers});
      const actor=await deps.authenticate(token);
      const body=JSON.parse(raw);
      if(!body||Object.keys(body).some(k=>!['kind','target'].includes(k))||!['sample','preview','section'].includes(body.kind)||typeof body.target!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.target))throw new Error('Only a calculation kind and target UUID are accepted');
      const context=await deps.context(token,body.target,body.kind);
      const output=context.kind==='section' ? calculateSection(context.input) : await (async()=>{
        const input=sampleFromSnapshot(context.input,context.edition);
        const reader=input.observations.length ? await deps.reference() : undefined;
        return calculateSample(input,reader);
      })();
      if(context.kind!=='preview')await deps.save(actor,context,output);
      return new Response(JSON.stringify(output),{headers});
    } catch(error) {
      const message=error instanceof Error?error.message:'Calculation failed';
      const status=error instanceof ReferenceUnavailable?503:/permission|assignment|staff|Reviewer|active|unauthorized|JWT/i.test(message)?403:409;
      return new Response(JSON.stringify({error:message}),{status,headers});
    }
  };
}
