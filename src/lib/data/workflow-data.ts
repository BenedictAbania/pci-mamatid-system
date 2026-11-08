import { supabase } from './supabase';
import type { BranchRecord, DistressRecord, DistressTypeRecord, InspectionRecord, ProfileRecord, SectionRecord } from './admin-data';
import type { CalculationOutput, ReferenceDistress } from '../pci/pci-service';

export type WorkflowState = 'planned' | 'draft' | 'submitted' | 'returned' | 'approved' | 'published';
export type Sample = InspectionRecord & { workflow_state: WorkflowState; assigned_to: string | null; reviewer_id: string | null; input_revision: number; action_version: number; current_approved_computation_id: string | null; start_m: number | null; end_m: number | null; inspection_notes: string | null; no_distress_confirmed: boolean; orientation_note: string | null; field_rules_confirmed: boolean; computation_id: string | null; survey_round?: number };
export type RoadSection = SectionRecord & { start_description: string | null; end_description: string | null; homogeneous_confirmed_by: string | null; latitude: number | null; longitude: number | null };
export type DistressDetails = { location_m?: number | null; potholes?: import('../d6433-07/catalog.ts').PotholeDetails; severity_guidance?: import('../d6433-07/severity-guidance.ts').SeverityGuidanceSnapshot; measurement_parts?: import('../d6433-07/measurement-parts.ts').MeasurementPart[]; severity_evidence?: { metric: string; value_mm: number } | null };
export type Computation = { id: string; sample_unit_id: string; input_revision: number; edition: string; verification: 'pending' | 'verified'; reference_id: string | null; input_snapshot?: { distresses?: { id: string; distress_type_id: string; severity: string | null; quantity?: number; unit_of_measure?: string; measurement_details?: DistressDetails }[]; report_context?: { distress_names?: Record<string, string> } }; output_snapshot: (CalculationOutput & Partial<import("../d6433-07/sample.ts").SampleOutput>) | null; created_at: string };
export type History = { id: string; sample_unit_id: string; actor_id: string; action: string; comments: string | null; revision: number; created_at: string };
export type Photo = { id: string; sample_unit_id: string; photo_path: string; caption: string | null; distress_record_id?: string | null };
export type SectionResult = { id: string; section_id: string; edition: string; pci: number; condition: string; safety: boolean; high_severity: number; affected_area: number; sample_computation_ids: string[]; method: string; weights: Record<string, number>; published_at: string };
export type Settings = { active_edition: string; priority_safety: boolean; priority_area: boolean; updated_at?: string };
export type CatalogType = DistressTypeRecord & ReferenceDistress & { severity_descriptions?: Partial<Record<'low' | 'medium' | 'high', string>>; severity_photos?: import('./reference-photos').SeverityPhotos; updated_at?: string };
export type WorkflowData = { samples: Sample[]; sections: RoadSection[]; branches: BranchRecord[]; profiles: ProfileRecord[]; types: CatalogType[]; distresses: (DistressRecord & { measurement_details: DistressDetails })[]; computations: Computation[]; history: History[]; photos: Photo[]; results: SectionResult[]; settings: Settings; audit: { id: string; action: string; created_at: string }[] };

export const WORKFLOW_PAGE_SIZE = 50;
/** Only the current edition's catalog is listed; older types load by ID for history. */
const ACTIVE_EDITION = 'ASTM D6433-07';
export type WorkflowScope ='samples' | 'sections' | 'types';
export type WorkflowPage = WorkflowData & { pageLastId: string | null; hasNext: boolean; referenceLastId: string | null; referenceHasNext: boolean };
type QueryOptions = { after?: string | null; ids?: string[]; sampleId?: string; sectionId?: string; limit?: number; newest?: boolean; status?: string; assignedTo?: string; reviewerId?: string; excludeAssigned?: string; edition?: string };
export async function rows<T>(table: string, options: QueryOptions = {}): Promise<T[]> {
  if (options.ids && !options.ids.length) return [];
  let query = supabase.from(table).select('*');
  if (options.newest) query = query.order('created_at', { ascending: false });
  query = query.order('id').limit(options.limit ?? WORKFLOW_PAGE_SIZE);
  if (options.after) query = query.gt('id', options.after);
  if (options.ids) query = query.in('id', options.ids);
  if (options.sampleId) query = query.eq('sample_unit_id', options.sampleId);
  if (options.sectionId) query = query.eq('section_id', options.sectionId);
  if (options.status) query = query.eq('workflow_state', options.status);
  if (options.assignedTo) query = query.eq('assigned_to', options.assignedTo);
  if (options.reviewerId) query = query.eq('reviewer_id', options.reviewerId);
  if (options.excludeAssigned) query = query.neq('assigned_to', options.excludeAssigned);
  if (options.edition) query = query.eq('astm_edition', options.edition);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load ' + table + ': ' + error.message);
  return data as T[];
}
export async function ensureWorkflowReady() {
  const { error } = await supabase.from('approved_results').select('id').limit(1);
  if (error) throw new Error('The published-revisions database migration is required: ' + error.message);
  const reference = await supabase.from('distress_types').select('id,astm_code').limit(1);
  if(reference.error)throw new Error('The D6433-07 review migration is required: '+reference.error.message);
}
/** Screen loads are bounded. Measurements/evidence load only on selection. */
export async function loadWorkflow(scope: WorkflowScope = 'samples', after: string | null = null, sampleId?: string, sectionId?: string, referenceAfter: string | null = null, status?: string, userId?: string): Promise<WorkflowPage> {
  await ensureWorkflowReady();
  const access = await supabase.rpc('lakad_session_access');
  if (access.error || !access.data?.is_active || access.data.role === 'viewer') throw new Error('This workspace is available only to active staff. Viewers use published reports.');
  if (status && !['planned', 'draft', 'submitted', 'returned', 'approved', 'published'].includes(status)) throw new Error('Choose a supported inspection status.');
  if (sampleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleId)) throw new Error('Invalid sample link. Return to the inspection list.');
  const assignment = userId ? access.data.role === 'encoder' ? { assignedTo: userId } : access.data.role === 'reviewer' ? { reviewerId: userId, excludeAssigned: userId } : {} : {};
  const settings = await rows<Settings>('lakad_settings', { limit: 1 });
  if (!settings[0]) throw new Error('Workflow settings are not configured.');
  const [primary, profiles, typePage] = await Promise.all([
    rows<Sample | RoadSection | CatalogType>(scope === 'samples' ? 'sample_units' : scope === 'sections' ? 'sections' : 'distress_types', { after, ...(scope === 'samples' ? { status, ...assignment } : scope === 'types' ? { edition: ACTIVE_EDITION } : {}) }),
    rows<ProfileRecord>('profiles', { after: referenceAfter }),
    scope === 'types' ? Promise.resolve([]) : scope === 'samples' ? loadActiveD07Types() : rows<CatalogType>('distress_types', { after: referenceAfter, edition: ACTIVE_EDITION }),
  ]);
  const referenceCandidates = [profiles, typePage].filter(page => page.length === WORKFLOW_PAGE_SIZE).map(page => page.at(-1)!.id);
  const samples = scope === 'samples' ? [...primary] as Sample[] : sectionId ? await rows<Sample>('sample_units', { sectionId }) : [];
  // A saved task link can target a unit outside the current register page. RLS and
  // the session assignment still apply, and it cannot change the page cursor.
  if (scope === 'samples' && sampleId && !samples.some(s => s.id === sampleId)) {
    samples.push(...await rows<Sample>('sample_units', { ids: [sampleId], ...assignment, limit: 1 }));
  }
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
  const [distresses, recentComputations, history, photos] = selected ? await Promise.all([
    rows<WorkflowData['distresses'][number]>('distress_records', { sampleId: selected.id, limit: 501 }),
    rows<Computation>('inspection_computations', { sampleId: selected.id, limit: 50, newest: true }),
    rows<History>('inspection_history', { sampleId: selected.id, limit: 50, newest: true }),
    rows<Photo>('distress_photos', { sampleId: selected.id, limit: 101 }),
  ]) : [[], [], [], []];
  const pinnedComputations = selected ? await rows<Computation>('inspection_computations', { ids: [selected.computation_id, selected.current_approved_computation_id].filter((id): id is string => !!id) }) : [];
  const computations = [...recentComputations];
  for (const row of pinnedComputations) if (!computations.some(existing => existing.id === row.id)) computations.push(row);
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
async function loadActiveD07Types(): Promise<CatalogType[]> {
  const { data, error } = await supabase.from('distress_types').select('*').eq('astm_edition', ACTIVE_EDITION).eq('is_active', true).order('name').limit(20);
  if (error) throw new Error('Unable to load the active D6433-07 catalog: ' + error.message);
  if ((data?.length ?? 0) > 19) throw new Error('The active D6433-07 catalog exceeds the expected 19 asphalt types. Ask the Civil Engineer to check the catalog.');
  return data as CatalogType[];
}
export async function workflowAction(sample: Sample, action: string, payload: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc('lakad_inspection_action', { target: sample.id, action, payload: { ...payload, revision: sample.input_revision, version: sample.action_version } });
  if (error) throw new Error(error.message);
}
/** Reloads one sample so a follow-up action carries its current revision and action tokens. */
export async function reloadSample(id: string, step: string): Promise<Sample> {
  const { data, error } = await supabase.from('sample_units').select('*').eq('id', id).single();
  if (error || !data) throw new Error(`The inspection was ${step}, but its latest revision could not be loaded. Refresh and try again.`);
  return data as Sample;
}
/** Starts a planned unit and returns its fresh revision and action tokens for the next action. */
export async function startInspection(sample: Sample): Promise<Sample> {
  await workflowAction(sample, 'start');
  return reloadSample(sample.id, 'started');
}
export type FinishDetails = { orientation_note: string; no_distress_confirmed: boolean };
export type InspectionPreview = { revision: number; output: import('../d6433-07/sample.ts').SampleOutput };
/**
 * Finish inspection: save the remaining required details, then compute the provisional
 * PCI of the current draft on the server. Nothing is submitted and the preview is not saved.
 */
export async function finishInspection(sample: Sample, details: FinishDetails): Promise<InspectionPreview> {
  let current = sample.workflow_state === 'planned' ? await startInspection(sample) : sample;
  const orientation = details.orientation_note.trim();
  if (current.orientation_note !== orientation || !current.field_rules_confirmed || current.no_distress_confirmed !== details.no_distress_confirmed) {
    await workflowAction(current, 'save', {
      notes: current.inspection_notes ?? '', surveyed_at: current.surveyed_at?.slice(0, 10) ?? '',
      latitude: current.latitude?.toString() ?? '', longitude: current.longitude?.toString() ?? '',
      no_distress_confirmed: details.no_distress_confirmed, area_sqm: Number(current.area_sqm),
      orientation_note: orientation, field_rules_confirmed: true,
    });
    current = await reloadSample(current.id, 'saved');
  }
  const output = await calculateProvisional('preview', current.id) as InspectionPreview['output'];
  return { revision: current.input_revision, output };
}
/** Submit Report: lock the revision for engineer review, then record its provisional PCI. */
export async function submitReport(sample: Sample) {
  await workflowAction(sample, 'submit');
  try { return await calculateProvisional('sample', sample.id); }
  catch (reason) {
    throw new Error(`The report was submitted for review, but the PCI could not be saved: ${reason instanceof Error ? reason.message : 'calculation failed'}. Use Compute PCI to try again.`);
  }
}
/** Reviewer: compute the provisional section PCI on the server, then publish it. */
export async function publishSectionResult(sectionId: string) {
  await calculateProvisional('section', sectionId);
  await callWorkflow('lakad_publish_section_result', { target: sectionId });
}
/** A confirmed plan for round 2 or later (round 1 lives on the section). */
export type SurveyRoundPlan = { round: number; method: 'all' | 'confidence' | 'reduced'; total: number; required: number; interval: number; first: number; deviation: number | null; previous_count: number; confirmed_at: string };
/** Current round progress and the §7.5.2.1 Eq. 2 statistics of its random sample units. */
export type SurveyRounds = { current_round: number; units: number; published: number; ready: boolean; random_count: number; mean: number | null; deviation: number | null; rounds: SurveyRoundPlan[] };

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function loadSurveyRounds(sectionId: string): Promise<SurveyRounds> {
  const { data, error } = await supabase.rpc('lakad_survey_rounds', { target: sectionId });
  if (error) throw new Error(error.message);
  const raw = data as Omit<SurveyRounds, 'mean' | 'deviation'> & { mean: unknown; deviation: unknown; rounds: (Omit<SurveyRoundPlan, 'deviation'> & { deviation: unknown })[] };
  return {
    ...raw,
    mean: numberOrNull(raw.mean),
    deviation: numberOrNull(raw.deviation),
    rounds: (raw.rounds ?? []).map((plan) => ({ ...plan, deviation: numberOrNull(plan.deviation) })),
  };
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

export async function calculateProvisional(kind: 'sample' | 'preview' | 'section', target: string) {
  const {data,error}=await supabase.functions.invoke('calculate-pci',{body:{kind,target}});
  if(error) {
    const response=error.context; let message=error.message;
    if(response instanceof Response) {try {message=(await response.json()).error ?? message;}catch { /* retain transport message */ }}
    throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data as import('../d6433-07/sample.ts').SampleOutput | ReturnType<typeof import('../d6433-07/section.ts').calculateSection>;
}
