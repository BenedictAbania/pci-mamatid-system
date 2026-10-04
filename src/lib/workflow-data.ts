import { supabase } from './supabase';
import type { BranchRecord, DistressRecord, DistressTypeRecord, InspectionRecord, ProfileRecord, SectionRecord } from './admin-data';
import type { CalculationOutput, ReferenceDistress } from './pci-service';

export type WorkflowState = 'planned' | 'draft' | 'submitted' | 'returned' | 'approved' | 'published';
export type Sample = InspectionRecord & { workflow_state: WorkflowState; assigned_to: string | null; reviewer_id: string | null; input_revision: number; action_version: number; current_approved_computation_id: string | null; start_m: number | null; end_m: number | null; inspection_notes: string | null; no_distress_confirmed: boolean; orientation_note: string | null; field_rules_confirmed: boolean; computation_id: string | null };
export type RoadSection = SectionRecord & { start_description: string | null; end_description: string | null; homogeneous_confirmed_by: string | null; latitude: number | null; longitude: number | null };
export type Computation = { id: string; sample_unit_id: string; input_revision: number; edition: string; verification: 'pending' | 'verified'; reference_id: string | null; output_snapshot: (CalculationOutput & Partial<import("./d6433-24/sample.ts").SampleOutput>) | null; created_at: string };
export type History = { id: string; sample_unit_id: string; actor_id: string; action: string; comments: string | null; revision: number; created_at: string };
export type Photo = { id: string; sample_unit_id: string; photo_path: string; caption: string | null };
export type SectionResult = { id: string; section_id: string; edition: string; pci: number; condition: string; safety: boolean; high_severity: number; affected_area: number; sample_computation_ids: string[]; method: string; weights: Record<string, number>; published_at: string };
export type Settings = { active_edition: string; priority_safety: boolean; priority_area: boolean };
export type CatalogType = DistressTypeRecord & ReferenceDistress;
export type WorkflowData = { samples: Sample[]; sections: RoadSection[]; branches: BranchRecord[]; profiles: ProfileRecord[]; types: CatalogType[]; distresses: (DistressRecord & { measurement_details: { location_m?: number | null; potholes?: import("./d6433-24/catalog.ts").PotholeDetails } })[]; computations: Computation[]; history: History[]; photos: Photo[]; results: SectionResult[]; settings: Settings; audit: { id: string; action: string; created_at: string }[] };

export const WORKFLOW_PAGE_SIZE = 50;
export type WorkflowScope = 'samples' | 'sections' | 'types';
export type WorkflowPage = WorkflowData & { pageLastId: string | null; hasNext: boolean; referenceLastId: string | null; referenceHasNext: boolean };
type QueryOptions = { after?: string | null; ids?: string[]; sampleId?: string; sectionId?: string; limit?: number; newest?: boolean };
export async function rows<T>(table: string, options: QueryOptions = {}): Promise<T[]> {
  if (options.ids && !options.ids.length) return [];
  let query = supabase.from(table).select('*');
  if (options.newest) query = query.order('created_at', { ascending: false });
  query = query.order('id').limit(options.limit ?? WORKFLOW_PAGE_SIZE);
  if (options.after) query = query.gt('id', options.after);
  if (options.ids) query = query.in('id', options.ids);
  if (options.sampleId) query = query.eq('sample_unit_id', options.sampleId);
  if (options.sectionId) query = query.eq('section_id', options.sectionId);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load ' + table + ': ' + error.message);
  return data as T[];
}
export async function ensureWorkflowReady() {
  const { error } = await supabase.from('approved_results').select('id').limit(1);
  if (error) throw new Error('The published-revisions database migration is required: ' + error.message);
  const reference = await supabase.from('distress_types').select('id,astm_code').limit(1);
  if(reference.error)throw new Error('The D6433-24 review migration is required: '+reference.error.message);
}
/** Screen loads are bounded. Measurements/evidence load only on selection. */
export async function loadWorkflow(scope: WorkflowScope = 'samples', after: string | null = null, sampleId?: string, sectionId?: string, referenceAfter: string | null = null): Promise<WorkflowPage> {
  await ensureWorkflowReady();
  const access = await supabase.rpc('lakad_session_access');
  if (access.error || !access.data?.is_active || access.data.role === 'viewer') throw new Error('This workspace is available only to active staff. Viewers use published reports.');
  const settings = await rows<Settings>('lakad_settings', { limit: 1 });
  if (!settings[0]) throw new Error('Workflow settings are not configured.');
  const [primary, profiles, typePage] = await Promise.all([
    rows<Sample | RoadSection | CatalogType>(scope === 'samples' ? 'sample_units' : scope === 'sections' ? 'sections' : 'distress_types', { after }),
    rows<ProfileRecord>('profiles', { after: referenceAfter }),
    scope === 'types' ? Promise.resolve([]) : rows<CatalogType>('distress_types', { after: referenceAfter }),
  ]);
  const referenceCandidates = [profiles, typePage].filter(page => page.length === WORKFLOW_PAGE_SIZE).map(page => page.at(-1)!.id);
  const samples = scope === 'samples' ? primary as Sample[] : sectionId ? await rows<Sample>('sample_units', { sectionId }) : [];
  const sections = scope === 'sections' ? primary as RoadSection[] : await rows<RoadSection>('sections', { ids: [...new Set(samples.map(s => s.section_id))] });
  const branches = await rows<BranchRecord>('branches', { ids: [...new Set(sections.map(s => s.branch_id))] });
  // Road inventory can navigate otherwise empty branches as well.
  if (scope === 'sections') {
    const branchPage = await rows<BranchRecord>('branches', { after: referenceAfter });
    if (branchPage.length === WORKFLOW_PAGE_SIZE) referenceCandidates.push(branchPage.at(-1)!.id);
    for (const b of branchPage) if (!branches.some(x => x.id === b.id)) branches.push(b);
  }
  const types = scope === 'types' ? primary as CatalogType[] : typePage;
  const selected = samples.find(s => s.id === sampleId);
  const [distresses, computations, history, photos] = selected ? await Promise.all([
    rows<WorkflowData['distresses'][number]>('distress_records', { sampleId: selected.id, limit: 501 }),
    rows<Computation>('inspection_computations', { ids: [selected.computation_id, selected.current_approved_computation_id].filter((id): id is string => !!id) }),
    rows<History>('inspection_history', { sampleId: selected.id, limit: 50, newest: true }),
    rows<Photo>('distress_photos', { sampleId: selected.id, limit: 101 }),
  ]) : [[], [], [], []];
  // Never silently omit measurement or evidence input in a review.
  if (distresses.length > 500 || photos.length > 100) throw new Error('This sample exceeds the detail-page limit. Ask an administrator to inspect it before review; incomplete evidence is not displayed.');
  const referencedTypes = await rows<CatalogType>('distress_types', { ids: [...new Set(distresses.map(d => d.distress_type_id))], limit: 500 });
  for (const type of referencedTypes) if (!types.some(t => t.id === type.id)) types.push(type);
  const { data: sectionReports, error: sectionError } = scope === 'sections' ? await supabase.rpc('lakad_section_reports', { page_size: 100, section_ids: sections.map(s => s.id) }) : { data: [], error: null };
  if (sectionError) throw new Error(sectionError.message);
  return { samples, sections, branches, profiles, types, distresses, computations, history, photos,
    results: sectionReports, settings: settings[0], audit: [],
    referenceLastId: referenceCandidates.sort()[0] ?? null, referenceHasNext: referenceCandidates.length > 0,
    pageLastId: primary.at(-1)?.id ?? null, hasNext: primary.length === WORKFLOW_PAGE_SIZE };
}
export async function workflowAction(sample: Sample, action: string, payload: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc('lakad_inspection_action', { target: sample.id, action, payload: { ...payload, revision: sample.input_revision, version: sample.action_version } });
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

export async function calculateProvisional(kind: 'sample' | 'section', target: string) {
  const {data,error}=await supabase.functions.invoke('calculate-pci',{body:{kind,target}});
  if(error) {
    const response=error.context; let message=error.message;
    if(response instanceof Response) {try {message=(await response.json()).error ?? message;}catch { /* retain transport message */ }}
    throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data as import('./d6433-24/sample.ts').SampleOutput | ReturnType<typeof import('./d6433-24/section.ts').calculateSection>;
}
