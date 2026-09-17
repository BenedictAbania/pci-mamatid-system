import { supabase } from './supabase';
import type { BranchRecord, DistressRecord, DistressTypeRecord, InspectionRecord, ProfileRecord, SectionRecord } from './admin-data';
import type { CalculationOutput, ReferenceDistress } from './pci-service';

export type WorkflowState = 'planned' | 'draft' | 'submitted' | 'returned' | 'approved' | 'published';
export type Sample = InspectionRecord & { workflow_state: WorkflowState; assigned_to: string | null; reviewer_id: string | null; input_revision: number; start_m: number | null; end_m: number | null; inspection_notes: string | null; no_distress_confirmed: boolean; computation_id: string | null };
export type RoadSection = SectionRecord & { start_description: string | null; end_description: string | null; homogeneous_confirmed_by: string | null; latitude: number | null; longitude: number | null };
export type Computation = { id: string; sample_unit_id: string; input_revision: number; edition: string; verification: 'pending' | 'verified'; reference_id: string | null; output_snapshot: CalculationOutput | null; created_at: string };
export type History = { id: string; sample_unit_id: string; actor_id: string; action: string; comments: string | null; revision: number; created_at: string };
export type Photo = { id: string; sample_unit_id: string; photo_path: string; caption: string | null };
export type SectionResult = { id: string; section_id: string; edition: string; pci: number; condition: string; safety: boolean; high_severity: number; affected_area: number; sample_computation_ids: string[]; method: string; weights: Record<string, number>; published_at: string };
export type Settings = { active_edition: string; priority_safety: boolean; priority_area: boolean };
export type CatalogType = DistressTypeRecord & ReferenceDistress;
export type WorkflowData = { samples: Sample[]; sections: RoadSection[]; branches: BranchRecord[]; profiles: ProfileRecord[]; types: CatalogType[]; distresses: (DistressRecord & { measurement_details: { location_m?: number | null } })[]; computations: Computation[]; history: History[]; photos: Photo[]; results: SectionResult[]; settings: Settings; audit: { id: string; action: string; created_at: string }[] };

let workflowProbe: Promise<void> | null = null;
let workflowProbeStartedAt = 0;

export async function rows<T>(table: string): Promise<T[]> {
  const collected: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(offset, offset + 499);
    if (error) throw new Error(`Unable to load ${table}: ${error.message}. If the workflow schema is missing, ask an administrator to apply the reviewed migration.`);
    collected.push(...(data as T[]));
    if (data.length < 500) return collected;
  }
}
export async function ensureWorkflowReady() {
  const now = Date.now();
  if (!workflowProbe || now - workflowProbeStartedAt > 5000) {
    workflowProbeStartedAt = now;
    workflowProbe = (async () => {
      const { error } = await supabase.from('lakad_settings').select('id').limit(1);
      if (error) {
        if (/404|lakad_settings|schema cache|could not find/i.test(error.message)) {
          throw new Error('The LAKAD workflow database update has not been applied yet. Apply the reviewed authenticated-workflow migration before using this module.');
        }
        throw new Error(`Unable to verify the workflow database: ${error.message}`);
      }
    })();
  }
  try {
    await workflowProbe;
  } catch (reason) {
    // Keep the failed probe briefly so concurrently mounted routes share one request.
    if (Date.now() - workflowProbeStartedAt > 5000) workflowProbe = null;
    throw reason;
  }
}
export async function loadWorkflow(): Promise<WorkflowData> {
  // Share one readiness probe across mounted routes so a missing migration yields one 404.
  await ensureWorkflowReady();
  const settings = await rows<Settings>('lakad_settings');
  if (!settings[0]) throw new Error('Workflow settings are not configured.');
  const [samples, sections, branches, profiles, types, distresses, computations, history, photos, results, audit] = await Promise.all([
    rows<Sample>('sample_units'), rows<RoadSection>('sections'), rows<BranchRecord>('branches'), rows<ProfileRecord>('profiles'),
    rows<CatalogType>('distress_types'), rows<WorkflowData['distresses'][number]>('distress_records'), rows<Computation>('inspection_computations'),
    rows<History>('inspection_history'), rows<Photo>('distress_photos'), rows<SectionResult>('section_results'), rows<WorkflowData['audit'][number]>('lakad_audit'),
  ]);
  return { samples, sections, branches, profiles, types, distresses, computations, history, photos, results, settings: settings[0], audit };
}
export async function workflowAction(sample: Sample, action: string, payload: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc('lakad_inspection_action', { target: sample.id, action, payload: { ...payload, revision: sample.input_revision } });
  if (error) throw new Error(error.message);
}
export async function callWorkflow(name: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
}
export function latestSectionResults(results: SectionResult[]) {
  const latest = new Map<string, SectionResult>();
  for (const row of results) if (!latest.has(row.section_id) || latest.get(row.section_id)!.published_at < row.published_at) latest.set(row.section_id, row);
  return [...latest.values()];
}
