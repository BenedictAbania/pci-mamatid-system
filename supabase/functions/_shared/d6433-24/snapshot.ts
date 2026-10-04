import { EDITION, definition, type PotholeDetails, type Severity, type Unit } from './catalog.ts';
import type { SampleInput } from './sample.ts';
/** Read the catalog saved AT SUBMISSION, never mutable road/distress descriptors. */
export function sampleFromSnapshot(snapshot: {
  sample: { area_sqm: number; no_distress_confirmed: boolean; field_rules_confirmed: boolean; orientation_note: string };
  distresses: { distress_type_id: string; quantity: number; severity: Severity | null; unit_of_measure: string; measurement_details?: { potholes?: PotholeDetails } }[];
  report_context: { distress_catalog: Record<string,{astm_code:number;astm_edition:string;unit:string}> };
}, edition: string): SampleInput {
  if(edition!==EDITION)throw new Error('Legacy inputs need a new D6433-24 inspection revision, not an edition relabel');
  if(!snapshot.sample.orientation_note?.trim())throw new Error('Sample orientation/sketch description required (§8.2)');
  if(!Array.isArray(snapshot.distresses)||snapshot.distresses.length>500)throw new Error('Complete bounded measurement snapshot required');
  return {edition:EDITION,area_sqm:snapshot.sample.area_sqm,no_distress_confirmed:snapshot.sample.no_distress_confirmed,
    field_rules_confirmed:snapshot.sample.field_rules_confirmed,observations:snapshot.distresses.map(row=>{
      const saved=snapshot.report_context?.distress_catalog?.[row.distress_type_id];
      if(!saved||saved.astm_edition!==EDITION)throw new Error('Unmapped or legacy distress in submitted snapshot');
      const d=definition(saved.astm_code);
      if(saved.unit!==d.unit||row.unit_of_measure!==d.unit)throw new Error('Saved SI catalog/measurement mismatch');
      return {code:d.code,severity:row.severity,quantity:row.quantity,unit:row.unit_of_measure as Unit,potholes:row.measurement_details?.potholes};
    })};
}
