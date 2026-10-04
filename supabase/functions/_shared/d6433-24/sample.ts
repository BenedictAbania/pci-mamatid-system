import { ALGORITHM_VERSION, EDITION, PROVISIONAL_LABEL, RULES, condition, definition, positive, potholeQuantity, type PotholeDetails, type Severity, type Unit } from './catalog.ts';
import { ReferenceUnavailable, type CurveReader } from './curves.ts';
export type Observation = { code: number; severity: Severity | null; quantity: number; unit: Unit; potholes?: PotholeDetails };
export type SampleInput = {
  edition: typeof EDITION; area_sqm: number; observations: Observation[];
  no_distress_confirmed: boolean; field_rules_confirmed: boolean;
};
export type Group = Observation & { density: number; deduct_value: number };
export type Iteration = { adjusted_deducts: number[]; q: number; total_deduct_value: number; corrected_deduct_value: number };
export function combineObservations(input: SampleInput) {
  if (input.edition !== EDITION) throw new Error('D6433-24 input required; legacy editions are not reinterpreted');
  positive(input.area_sqm,'Measured sample area');
  if (input.area_sqm <135 || input.area_sqm >315) throw new Error('Measured AC area outside §2.1.7 range 135–315 m²; engineer must resolve layout');
  if (!input.field_rules_confirmed) throw new Error('Field exclusions, severity and measurement basis require inspection confirmation');
  if (!Array.isArray(input.observations) || input.observations.length >500) throw new Error('Invalid or excessive measurement input');
  if (!input.observations.length && !input.no_distress_confirmed) throw new Error('Empty measurements are not evidence of no distress');
  if (input.observations.length && input.no_distress_confirmed) throw new Error('No-distress confirmation conflicts with measurements');
  const grouped=new Map<string,Observation>();
  let largeHoleArea=0;
  for (const row of input.observations) {
    const d=definition(row.code);
    if (row.unit !== d.unit) throw new Error('SI unit mismatch for '+d.name+' ('+d.measurementRule+')');
    if (row.severity===null ? d.severities.length!==0 : !d.severities.includes(row.severity)) throw new Error('Invalid severity for '+d.name);
    positive(row.quantity,'Distress quantity');
    if (row.code===13) {
      if (row.potholes) {
        const count=potholeQuantity(row.potholes,row.severity!);
        if (Math.abs(row.quantity-count)>1e-8*Math.max(1,count)) throw new Error('Pothole quantity disagrees with recorded count/equivalent area');
        largeHoleArea += row.potholes.large_holes.reduce((a,h)=>a+h.area_sqm,0);
        if (largeHoleArea>input.area_sqm) throw new Error('Large pothole area exceeds sample');
      } else if (!Number.isInteger(row.quantity)) throw new Error('Fractional potholes require X1.17.1.2 area evidence');
    } else if (row.potholes) throw new Error('Pothole details supplied for a different distress');
    const key=row.code+':'+row.severity, old=grouped.get(key);
    grouped.set(key,{code:row.code,severity:row.severity,unit:row.unit,quantity:(old?.quantity ?? 0)+row.quantity});
  }
  const rows=[...grouped.values()].sort((a,b)=>a.code-b.code || String(a.severity).localeCompare(String(b.severity)));
  for (const d of new Set(rows.map(r=>r.code))) {
    if (definition(d).unit==='m²' && rows.filter(r=>r.code===d).reduce((a,r)=>a+r.quantity,0)>input.area_sqm+1e-9) throw new Error('Combined distress area exceeds sample');
  }
  // Different distress types can overlap (§X1.1.1). Spatial exclusion decisions
  // cannot be inferred from aggregate quantities; the inspector confirms them.
  return rows;
}
/** §§9.5.1–9.5.5. No intermediate rounding, extrapolation or q fallback. */
export function correctDeducts(values: readonly number[], reader?: Pick<CurveReader,'corrected'>) {
  if (values.some(v=>!Number.isFinite(v)||v<0||v>100)) throw new Error('DV must be finite within 0–100');
  const sorted=[...values].sort((a,b)=>b-a), total=sorted.reduce((a,v)=>a+v,0), highest=sorted[0] ?? 0;
  const count=sorted.filter(v=>v>2).length;
  if (count<=1) return { total_deduct_value:total, highest_deduct_value:highest, allowable_deducts:0, q:count, iterations:[] as Iteration[], max_corrected_deduct_value:total };
  if (!reader) throw new ReferenceUnavailable('CDV reference package unavailable');
  const m=Math.min(10,1+(9/98)*(100-highest)), whole=Math.floor(m), fraction=m-whole;
  const working=sorted.slice(0,whole);
  if (fraction>0 && sorted.length>whole) working.push(sorted[whole]*fraction);
  const iterations: Iteration[]=[];
  while (true) {
    const q=working.filter(v=>v>2).length, tdv=working.reduce((a,v)=>a+v,0);
    const cdv= q<=1 ? tdv : reader.corrected(tdv,q);
    if (!Number.isFinite(cdv)||cdv<0||cdv>tdv+1e-8) throw new ReferenceUnavailable('Invalid corrected deduct value');
    iterations.push({adjusted_deducts:[...working],q,total_deduct_value:tdv,corrected_deduct_value:cdv});
    if (q<=1) break;
    let index=-1;
    working.forEach((v,i)=>{if(v>2&&(index<0||v<working[index]))index=i;});
    working[index]=2;
  }
  return {total_deduct_value:total,highest_deduct_value:highest,allowable_deducts:m,q:iterations[0].q,iterations,max_corrected_deduct_value:Math.max(...iterations.map(i=>i.corrected_deduct_value))};
}
function alternatives(rows: Observation[]) {
  if (rows.length<=1) return [rows];
  const order: Record<Severity,number>={low:0,medium:1,high:2};
  const sorted=[...rows].sort((a,b)=>order[a.severity!]-order[b.severity!]);
  const merge=(indices:number[])=>{
    const highest=indices[indices.length-1];
    const result=sorted.filter((_,i)=>!indices.includes(i));
    result.push({...sorted[highest],quantity:indices.reduce((a,i)=>a+sorted[i].quantity,0)});
    return result;
  };
  // §9.6.2.1: two levels -> original or everything at higher severity.
  if (sorted.length===2) return [sorted,merge([0,1])];
  // §9.6.2.2: original and each of the four displayed combinations.
  return [sorted,merge([0,1]),merge([1,2]),merge([0,2]),merge([0,1,2])];
}
export function calculateSample(input: SampleInput, reader?: CurveReader) {
  const original=combineObservations(input);
  const byType=new Map<number,Observation[]>();
  for(const row of original)byType.set(row.code,[...(byType.get(row.code) ?? []),row]);
  let candidates: Observation[][]=[[]];
  for(const rows of byType.values()) {
    const choices=alternatives(rows);
    if(candidates.length*choices.length>4096) throw new Error('More than 4096 severity combinations: engineering review required; no approximate pruning');
    candidates=candidates.flatMap(prior=>choices.map(choice=>[...prior,...choice]));
  }
  if(original.length&&!reader) throw new ReferenceUnavailable('Private D6433-24 DV/CDV reference package required; prototype curves are never a fallback');
  const evaluated=candidates.map(rows=>{
    const groups: Group[]=rows.map(row=>{
      const density=row.quantity/input.area_sqm*100; // §§9.1–9.2, SI density convention.
      const dv=reader!.deduct(row.code,row.severity,density);
      return {...row,density,deduct_value:dv};
    });
    const correction=correctDeducts(groups.map(g=>g.deduct_value),reader);
    return {groups,...correction,pci:Math.max(0,Math.min(100,100-correction.max_corrected_deduct_value))};
  });
  // Multiple mixed distress types: jointly evaluate the displayed alternatives.
  // This deterministic extension/4096 bound is listed for engineering validation.
  const selected=evaluated.reduce((best,c)=>c.pci>best.pci ? c : best,evaluated[0]);
  return {
    ...selected, densities:selected.groups.map(g=>g.density),deduct_values:selected.groups.map(g=>g.deduct_value),
    condition:condition(selected.pci), status:'provisional' as const,label:PROVISIONAL_LABEL,
    edition:EDITION,algorithm_version:ALGORITHM_VERSION,reference_id:reader?.id ?? 'D6433-24/no-distress',
    reference_digest:reader?.digest ?? null, source_rules:RULES,
    observed_groups:original.map(r=>({...r,density:r.quantity/input.area_sqm*100})),
    severity_alternatives:evaluated.map(c=>({groups:c.groups,pci:c.pci})),
    precision_policy:'full precision; round display only; no extrapolation',
  };
}
export type SampleOutput = ReturnType<typeof calculateSample>;
