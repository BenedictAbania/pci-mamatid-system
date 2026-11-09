import { UserRole } from '@/providers/AuthProvider';

import { supabase } from './supabase';

export type BranchRecord = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  administrative_status: string;
  branch_code: string | null;
  classification: string | null;
  length_meters: number | null;
  start_description: string | null;
  end_description: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SectionRecord = {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  start_description: string | null;
  end_description: string | null;
  pavement_type: 'asphalt';
  homogeneous_confirmed_by: string | null;
  homogeneous_confirmed_at: string | null;
  latitude: number | null;
  longitude: number | null;
  length_meters: number | null;
  width_meters: number | null;
  area_sqm: number | null;
  total_sample_units: number | null;
  recommended_sample_units: number | null;
  notes: string | null;
  pavement_design: string | null;
  construction_history: string | null;
  traffic_classification: string | null;
  pavement_condition: string | null;
  sampling_method: 'all' | 'confidence' | 'reduced' | null;
  sampling_interval: number | null;
  sampling_start_unit: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pci_score: number | null;
  condition_label: string | null;
  pci_computed_at: string | null;
};

export type InspectionRecord = {
  id: string;
  section_id: string;
  unit_number: number;
  area_sqm: number | null;
  latitude: number | null;
  longitude: number | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  surveyed_by: string | null;
  surveyed_at: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  total_deduct_value: number | null;
  corrected_deduct_value: number | null;
  pci_score: number | null;
  condition_label: string | null;
  pci_computed_at: string | null;
  created_at: string;
  updated_at: string;
  sample_type: 'random' | 'additional' | null;
};

export type ProfileRecord = {
  email?: string;
  is_active?: boolean;
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type DistressTypeRecord = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  default_unit_of_measure: string | null;
  is_active: boolean;
};

export type DistressRecord = {
  id: string;
  sample_unit_id: string;
  distress_type_id: string;
  severity: 'low' | 'medium' | 'high' | null;
  quantity: number;
  unit_of_measure: string;
  density_percent: number | null;
  deduct_value: number | null;
  notes: string | null;
  created_at: string;
};

function unwrap<T>(data: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  return data;
}

export type BranchFormValues = {
  id?: string;
  branch_code: string;
  name: string;
  location: string;
  classification: string;
  length_meters: string;
  start_description: string;
  end_description: string;
  notes: string;
};

/** Returns the saved branch id. */
export async function saveBranch(values: BranchFormValues): Promise<string> {
  const text = (value: string) => value.trim() || null;
  const payload = {
    branch_code: text(values.branch_code),
    name: values.name.trim(),
    location: text(values.location),
    classification: text(values.classification),
    length_meters: values.length_meters.trim() ? Number(values.length_meters) : null,
    start_description: text(values.start_description),
    end_description: text(values.end_description),
    notes: text(values.notes),
    updated_at: new Date().toISOString(),
  };
  const result = values.id
    ? await supabase.from('branches').update(payload).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('branches').insert(payload).select('id').maybeSingle();
  if (result.error?.code === '23505') throw new Error(`Branch ID ${payload.branch_code} is already in use.`);
  const saved = unwrap(result.data, result.error);
  if (!saved) throw new Error('Road branch was not saved. Check your Reviewer access and retry.');
  return saved.id;
}

export async function removeBranch(id: string) {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type EncoderWorkload = Record<string, { sections: number; units: number }>;

/** Open (not yet approved/published) sample units per active encoder. */
export async function loadEncoderWorkload(): Promise<EncoderWorkload> {
  const { data, error } = await supabase.rpc('lakad_encoder_workload');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { encoder_id: string; sections: number; units: number }[];
  return Object.fromEntries(rows.map((row) => [row.encoder_id, { sections: row.sections, units: row.units }]));
}

/** IDs of encoders who can be assigned: active and invitation accepted. */
export async function loadAssignableEncoders(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('lakad_assignable_encoders');
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}

export type RoadNetworkCounts ={ branches: number; sections: number; sampleUnits: number };

/** Exact totals within the signed-in user's RLS scope, independent of page size. */
export async function loadRoadNetworkCounts(): Promise<RoadNetworkCounts> {
  const [branches, sections, sampleUnits] = await Promise.all(['branches', 'sections', 'sample_units'].map(async (table) => {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }));
  return { branches, sections, sampleUnits };
}

export type SectionFormValues = {
  id?: string;
  branch_id: string;
  name: string;
  length_meters: string;
  width_meters: string;
  area_sqm: string;
  pavement_design: string;
  construction_history: string;
  traffic_classification: string;
  pavement_condition: string;
  notes: string;
};

/** Writes only the form's fields, so untouched columns (e.g. locked chainage) never change on edit. */
export async function saveSection(values: SectionFormValues, userId: string) {
  const number = (value: string) => value.trim() ? Number(value) : null;
  const payload = {
    branch_id: values.branch_id,
    name: values.name.trim(),
    pavement_type: 'asphalt',
    length_meters: number(values.length_meters),
    width_meters: number(values.width_meters),
    area_sqm: number(values.area_sqm),
    pavement_design: values.pavement_design.trim() || null,
    construction_history: values.construction_history.trim() || null,
    traffic_classification: values.traffic_classification.trim() || null,
    pavement_condition: values.pavement_condition.trim() || null,
    notes: values.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const result = values.id
    ? await supabase.from('sections').update(payload).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('sections').insert({ ...payload, created_by: userId }).select('id').maybeSingle();
  const saved = unwrap(result.data, result.error);
  if (!saved) throw new Error('Road section was not saved. Check your Reviewer access and retry.');
}

export async function removeSection(id: string) {
  const { error } = await supabase.from('sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
