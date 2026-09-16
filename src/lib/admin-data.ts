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

export async function loadRoadNetwork() {
  const [branchesResult, sectionsResult] = await Promise.all([
    supabase.from('branches').select('*').order('name'),
    supabase.from('sections').select('*').order('created_at', { ascending: false }),
  ]);
  return {
    branches: (unwrap(branchesResult.data, branchesResult.error) ?? []) as BranchRecord[],
    sections: (unwrap(sectionsResult.data, sectionsResult.error) ?? []) as SectionRecord[],
  };
}

export async function saveBranch(
  values: { id?: string; name: string; description: string; location: string; administrative_status: string },
  userId: string
) {
  const payload = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    location: values.location.trim() || null,
    administrative_status: values.administrative_status.trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  const result = values.id
    ? await supabase.from('branches').update(payload).eq('id', values.id)
    : await supabase.from('branches').insert({ ...payload, created_by: userId });
  unwrap(result.data, result.error);
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
    ? await supabase.from('sections').update(payload).eq('id', values.id)
    : await supabase.from('sections').insert({ ...payload, created_by: userId });
  unwrap(result.data, result.error);
}

export async function removeSection(id: string) {
  const { error } = await supabase.from('sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function loadInspections() {
  const [inspectionsResult, sectionsResult, branchesResult, profilesResult] = await Promise.all([
    supabase.from('sample_units').select('*').order('created_at', { ascending: false }),
    supabase.from('sections').select('*').order('name'),
    supabase.from('branches').select('*').order('name'),
    supabase.from('profiles').select('*').order('full_name'),
  ]);
  return {
    inspections: (unwrap(inspectionsResult.data, inspectionsResult.error) ?? []) as InspectionRecord[],
    sections: (unwrap(sectionsResult.data, sectionsResult.error) ?? []) as SectionRecord[],
    branches: (unwrap(branchesResult.data, branchesResult.error) ?? []) as BranchRecord[],
    profiles: (unwrap(profilesResult.data, profilesResult.error) ?? []) as ProfileRecord[],
  };
}

export async function createInspection(
  values: {
    section_id: string;
    unit_number: string;
    area_sqm: string;
    latitude: string;
    longitude: string;
    sample_type: 'random' | 'additional';
  },
  userId: string
) {
  const { error } = await supabase.from('sample_units').insert({
    section_id: values.section_id,
    unit_number: Number(values.unit_number),
    area_sqm: values.area_sqm ? Number(values.area_sqm) : null,
    latitude: values.latitude ? Number(values.latitude) : null,
    longitude: values.longitude ? Number(values.longitude) : null,
    sample_type: values.sample_type,
    status: 'draft',
    surveyed_by: userId,
    surveyed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function updateInspectionStatus(
  inspection: InspectionRecord,
  status: InspectionRecord['status'],
  userId: string,
  reviewNotes = ''
) {
  const now = new Date().toISOString();
  const payload: Record<string, string | null> = { status, updated_at: now };
  if (status === 'submitted') payload.submitted_at = now;
  if (status === 'approved' || status === 'rejected') {
    payload.reviewed_by = userId;
    payload.reviewed_at = now;
    payload.review_notes = reviewNotes.trim() || null;
  }
  const { error } = await supabase.from('sample_units').update(payload).eq('id', inspection.id);
  if (error) throw new Error(error.message);
}

export async function removeInspection(id: string) {
  const { error } = await supabase.from('sample_units').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function loadPciData() {
  const [base, distressesResult, typesResult] = await Promise.all([
    loadInspections(),
    supabase.from('distress_records').select('*').order('created_at', { ascending: false }),
    supabase.from('distress_types').select('id, code, name, description, default_unit_of_measure, is_active').order('name'),
  ]);
  return {
    ...base,
    distresses: (unwrap(distressesResult.data, distressesResult.error) ?? []) as DistressRecord[],
    distressTypes: (unwrap(typesResult.data, typesResult.error) ?? []) as DistressTypeRecord[],
  };
}

export async function loadProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  return (unwrap(data, error) ?? []) as ProfileRecord[];
}

export async function updateProfileRole(id: string, role: UserRole) {
  const { error } = await supabase.rpc('lakad_manage_account', { target: id, new_role: role, active: true });
  if (error) throw new Error(error.message);
}
