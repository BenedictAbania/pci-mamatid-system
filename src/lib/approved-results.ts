import type { CalculationOutput } from './pci-service';

export type ReportSnapshot = {
  historical_context_available: boolean;
  sample: { id: string; unit_number: number; area_sqm: number; sample_type: string; surveyed_at: string | null; latitude: number | null; longitude: number | null; inspection_notes: string | null };
  road: { section_id: string; section_name: string; branch_name: string; length_meters?: number; width_meters?: number; area_sqm?: number; start_description?: string; end_description?: string };
  distresses: { id: string; name: string; severity: string | null; quantity: number; unit_of_measure: string; notes: string | null }[];
  photos: { id: string; photo_path: string; caption: string | null }[];
  edition: string; reference_id: string; algorithm_version: string; output: CalculationOutput;
};
export type ApprovedResult = {
  id: string; sample_unit_id: string; input_revision: number; report_snapshot: ReportSnapshot;
  approved_at: string; published_at: string | null; is_current: boolean; superseded_at: string | null;
};

/** Current aggregation must not treat historical approvals as another sample. */
export function currentApprovedResults(rows: ApprovedResult[], publishedOnly = false) {
  const current = new Map<string, ApprovedResult>();
  for (const row of rows) {
    if (!row.is_current || row.superseded_at || (publishedOnly && !row.published_at)) continue;
    if (!current.has(row.sample_unit_id) || current.get(row.sample_unit_id)!.approved_at < row.approved_at) current.set(row.sample_unit_id, row);
  }
  return [...current.values()];
}

/** Every report field comes from the frozen approved snapshot, not live joins. */
export function approvedReportCsv(rows: ApprovedResult[]) {
  return [
    ['Branch', 'Road section', 'Sample unit', 'Revision', 'Survey date', 'Area (sqm)', 'PCI', 'Condition', 'Verification Status', 'Published', 'Current', 'Distresses'],
    ...rows.map(row => {
      const s = row.report_snapshot;
      return [s.road.branch_name, s.road.section_name, s.sample.unit_number, row.input_revision,
        s.sample.surveyed_at, s.sample.area_sqm, s.output.pci, s.output.condition,
        'Reviewer-approved reference result', row.published_at, row.is_current ? 'Yes' : 'Superseded',
        s.distresses.map(d => d.name + ': ' + d.quantity + ' ' + d.unit_of_measure + ' (' + (d.severity ?? 'N/A') + ')').join('; ')];
    }),
  ];
}
