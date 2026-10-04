import { ALGORITHM_VERSION, EDITION, PROVISIONAL_LABEL, RULES, condition, positive, validPci } from './catalog.ts';
export type SectionSample = {
  id: string; computation_id: string; area_sqm: number; pci: number;
  sample_type: 'random' | 'additional'; is_current: boolean; approved: boolean; edition: string;
};
export type SectionInput = {
  area_sqm: number; total_sample_units: number; required_random_ids: string[]; samples: SectionSample[];
};
/** §11.1 Eqs. 5–7. Random sample mean represents the non-additional section area;
 * additional units contribute their ACTUAL surveyed area, not equal sample counts. */
export function calculateSection(input: SectionInput) {
  const area=positive(input.area_sqm,'Section area');
  if(!Number.isInteger(input.total_sample_units)||input.total_sample_units<1||input.total_sample_units>10000) throw new Error('Total section sample-unit count required');
  if(area/input.total_sample_units<135 || area/input.total_sample_units>315)throw new Error('Section layout cannot meet the AC sample-unit area range');
  if(!Array.isArray(input.required_random_ids)||new Set(input.required_random_ids).size!==input.required_random_ids.length) throw new Error('Unique planned random IDs required');
  if(!input.samples.length||input.samples.length>input.total_sample_units) throw new Error('Invalid surveyed sample count');
  const ids=new Set<string>(), computations=new Set<string>();
  for(const s of input.samples) {
    if(!s.id||!s.computation_id||ids.has(s.id)||computations.has(s.computation_id))throw new Error('Duplicate sample or computation');
    ids.add(s.id); computations.add(s.computation_id);
    if(s.approved!==true||s.is_current!==true||s.edition!==EDITION)throw new Error('Only current approved D6433-24 sample calculations may enter section aggregation');
    if(s.sample_type!=='random'&&s.sample_type!=='additional')throw new Error('Unknown sample type');
    positive(s.area_sqm,'Sample area');validPci(s.pci);
    if(s.area_sqm<135||s.area_sqm>315)throw new Error('Approved sample area outside D6433-24 AC limits');
  }
  if(input.samples.reduce((a,s)=>a+s.area_sqm,0)>area+1e-8)throw new Error('Surveyed sample areas exceed the section');
  // §2.1.1: complete census has no additional units; preserve a trace of reclassification.
  const census=input.samples.length===input.total_sample_units;
  if(census&&Math.abs(input.samples.reduce((a,s)=>a+s.area_sqm,0)-area)>1e-8*Math.max(1,area))throw new Error('Census sample areas must partition the section');
  const random=census ? input.samples : input.samples.filter(s=>s.sample_type==='random');
  const additional=census ? [] : input.samples.filter(s=>s.sample_type==='additional');
  if(!random.length)throw new Error('A random sample is required to estimate the unsurveyed section');
  if(!census&&(input.required_random_ids.length===0||input.required_random_ids.some(id=>!random.some(s=>s.id===id))||random.some(s=>!input.required_random_ids.includes(s.id))))throw new Error('Approved random cohort must match the confirmed plan, including replacements');
  const randomArea=random.reduce((a,s)=>a+s.area_sqm,0), addArea=additional.reduce((a,s)=>a+s.area_sqm,0);
  if(addArea>=area)throw new Error('Additional units cannot cover the whole section without a complete census');
  const randomMean=random.reduce((a,s)=>a+s.pci*s.area_sqm,0)/randomArea;
  const addMean=addArea ? additional.reduce((a,s)=>a+s.pci*s.area_sqm,0)/addArea : null;
  const weights: Record<string,number>={};
  for(const s of random)weights[s.id]=(area-addArea)/area*s.area_sqm/randomArea;
  for(const s of additional)weights[s.id]=s.area_sqm/area;
  const pci=input.samples.reduce((a,s)=>a+s.pci*weights[s.id],0);
  return {pci,condition:condition(pci),weights,random_mean:randomMean,additional_mean:addMean,
    represented_random_area:area-addArea,additional_area:addArea,census_reclassification:census,
    sample_computation_ids:input.samples.map(s=>s.computation_id),
    method:'D6433-24 §11.1 Eqs. 5–7 (area-weighted random/additional)',status:'provisional' as const,label:PROVISIONAL_LABEL,
    edition:EDITION,algorithm_version:ALGORITHM_VERSION,precision_policy:'full precision; round display only',source_rules:{section:RULES.section,additional:RULES.additional,rating:RULES.rating},
  };
}
/** §7.5.2 Eq. 1. Defaults are the INITIAL AC inspection assumptions only. */
export function minimumRandomSamples(total: number, deviation=10, error=5) {
  if(!Number.isInteger(total)||total<1)throw new Error('Positive integer total required');
  if(!Number.isFinite(deviation)||deviation<0)throw new Error('Nonnegative standard deviation required');
  positive(error,'Acceptable error');
  return total===1 ? 1 : Math.max(1,Math.min(total,Math.ceil(total*deviation**2/((error**2/4)*(total-1)+deviation**2))));
}
/** §7.5.3 Eq. 3. Inspect each successive interval through the section. */
export function systematicRandomUnits(total:number,minimum:number,first:number) {
  if(!Number.isInteger(total)||!Number.isInteger(minimum)||minimum<1||minimum>total)throw new Error('Invalid sampling counts');
  const interval=Math.floor(total/minimum);
  if(!Number.isInteger(first)||first<1||first>interval)throw new Error('First unit must be selected within the random starting interval');
  const units=[];for(let i=first;i<=total;i+=interval)units.push(i);
  return {interval,units};
}
