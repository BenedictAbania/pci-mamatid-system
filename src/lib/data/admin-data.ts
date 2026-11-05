import { UserRole } from '@/providers/AuthProvider';

import { supabase } from './supabase';

export type BranchRecord = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  administrative_status: string;
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

export async function saveBranch(
  values: { id?: string; name: string; description: string; location: string; administrative_status: string }
) {
  const payload = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    location: values.location.trim() || null,
    administrative_status: values.administrative_status.trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  const result = values.id
    ? await supabase.from('branches').update(payload).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('branches').insert(payload).select('id').maybeSingle();
  const saved = unwrap(result.data, result.error);
  if (!saved) throw new Error('Road branch was not saved. Check your Civil Engineer access and retry.');
}

export async function removeBranch(id: string) {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveSection(
  values: {
    id?: string;
    branch_id: string;
    name: string;
    description: string;
    length_meters: string;
    width_meters: string;
    start_description: string;
    end_description: string;
    latitude: string;
    longitude: string;
    notes: string;
  },
  userId: string
) {
  const length = values.length_meters ? Number(values.length_meters) : null;
  const width = values.width_meters ? Number(values.width_meters) : null;
  const payload = {
    branch_id: values.branch_id,
    name: values.name.trim(),
    description: values.description.trim() || null,
    start_description: values.start_description.trim() || null,
    end_description: values.end_description.trim() || null,
    pavement_type: 'asphalt',
    length_meters: length,
    width_meters: width,
    area_sqm: length !== null && width !== null ? length * width : null,
    latitude: values.latitude ? Number(values.latitude) : null,
    longitude: values.longitude ? Number(values.longitude) : null,
    notes: values.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const result = values.id
    ? await supabase.from('sections').update(payload).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('sections').insert({ ...payload, created_by: userId }).select('id').maybeSingle();
  const saved = unwrap(result.data, result.error);
  if (!saved) throw new Error('Road section was not saved. Check your Civil Engineer access and retry.');
}

export async function removeSection(id: string) {
  const { error } = await supabase.from('sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
