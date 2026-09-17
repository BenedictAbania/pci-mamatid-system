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
  branches: DashboardBranch[];
  sections: DashboardSection[];
  inspections: DashboardInspection[];
  profiles: DashboardProfile[];
  results: DashboardSectionResult[];
};

const PAGE_SIZE = 1000;

async function selectAllRows<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [branches, sections, inspections, profiles, results] = await Promise.all([
    selectAllRows<DashboardBranch>('branches', 'id, name, created_at'),
    selectAllRows<DashboardSection>(
      'sections',
      'id, branch_id, name, pci_score, condition_label, created_at'
    ),
    selectAllRows<DashboardInspection>(
      'sample_units',
      'id, section_id, unit_number, workflow_state, surveyed_by, surveyed_at, submitted_at, reviewed_at, pci_score, condition_label, created_at'
    ),
    selectAllRows<DashboardProfile>('profiles', 'id, full_name, role, created_at'),
    selectAllRows<DashboardSectionResult>('section_results', 'id, section_id, pci, condition, published_at, created_at'),
  ]);

  return {
    branches,
    sections,
    inspections,
    profiles,
    results,
  };
}
