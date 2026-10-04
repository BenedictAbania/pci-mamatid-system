import { supabase } from './supabase';

export type DashboardProfile = {
  id: string;
  full_name: string;
  role: 'admin' | 'reviewer' | 'encoder' | 'viewer';
  created_at: string;
};

export type DashboardBranch = {
  id: string;
  name: string;
  created_at: string;
};

export type DashboardSection = {
  id: string;
  branch_id: string;
  name: string;
  pci_score: number | null;
  condition_label: string | null;
  created_at: string;
};

export type DashboardInspection = {
  id: string;
  section_id: string;
  unit_number: number;
  workflow_state: 'planned' | 'draft' | 'submitted' | 'returned' | 'approved' | 'published';
  surveyed_by: string | null;
  surveyed_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  pci_score: number | null;
  condition_label: string | null;
  created_at: string;
};

export type DashboardSectionResult = {
  id: string;
  section_id: string;
  pci: number;
  condition: string;
  published_at: string;
  created_at: string;
};

export type DashboardData = {
  totals?: { branches: number; sections: number; samples: number };
  approvedSummary?: { count: number; average: number | null };
  branches: DashboardBranch[];
  sections: DashboardSection[];
  inspections: DashboardInspection[];
  profiles: DashboardProfile[];
  results: DashboardSectionResult[];
};

async function selectPreviewRows<T>(table: string, columns: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(columns).order('created_at', { ascending: false }).order('id').limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function tableCount(table: string) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
export async function loadDashboardData(): Promise<DashboardData> {
  const [branches, sections, inspections, profiles, resultPage, summary, branchCount, sectionCount, sampleCount] = await Promise.all([
    selectPreviewRows<DashboardBranch>('branches', 'id,name,created_at'),
    selectPreviewRows<DashboardSection>('sections', 'id,branch_id,name,pci_score,condition_label,created_at'),
    selectPreviewRows<DashboardInspection>('sample_units', 'id,section_id,unit_number,workflow_state,surveyed_by,surveyed_at,submitted_at,reviewed_at,pci_score,condition_label,created_at'),
    selectPreviewRows<DashboardProfile>('profiles', 'id,full_name,role,created_at'),
    supabase.rpc('lakad_section_reports', { page_size: 50 }),
    supabase.rpc('lakad_report_summary'),
    tableCount('branches'), tableCount('sections'), tableCount('sample_units'),
  ]);
  if (resultPage.error) throw new Error(resultPage.error.message);
  if (summary.error) throw new Error(summary.error.message);
  return { branches, sections, inspections, profiles,
    results: (resultPage.data ?? []).map((r: DashboardSectionResult) => ({ ...r, created_at: r.published_at })),
    totals: { branches: branchCount, sections: sectionCount, samples: sampleCount }, approvedSummary: summary.data };
}
