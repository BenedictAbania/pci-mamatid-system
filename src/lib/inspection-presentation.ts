import type { CatalogType, WorkflowState } from './workflow-data';

export const inspectionSteps = [
  { value: 'details', label: '1. Sample details' },
  { value: 'distress', label: '2. Distress measurements' },
  { value: 'photos', label: '3. Photos' },
  { value: 'submit', label: '4. Review and submit' },
] as const;
export type InspectionStep = typeof inspectionSteps[number]['value'];
export const statusGuidance: Record<WorkflowState, string> = {
  planned: 'Ready to start. The assigned Inspector can open a draft.',
  draft: 'Draft. Save sample details, record measurements, then review and submit.',
  returned: 'Correction requested. Read the review comments, update inputs, and resubmit.',
  submitted: 'Submitted. Inputs are locked while the assigned Reviewer checks this revision.',
  approved: 'Approved and locked. Publication is a separate Reviewer action.',
  published: 'Published and locked. Corrections require a new revision and review.',
};
/** Descriptions come only from the live catalog when present. Never infer ASTM text.
 * The persisted severity remains the canonical low/medium/high value. */
export function severityChoices(type: CatalogType) {
  const codes: Record<string, string> = { low: 'L', medium: 'M', high: 'H' };
  return type.allowed_severities.filter(value => codes[value]).map(value => {
    const text = type.severity_descriptions?.[value as 'low' | 'medium' | 'high'];
    const description = typeof text === 'string' ? text.trim() : undefined;
    const name = value[0].toUpperCase() + value.slice(1);
    return { value, label: codes[value] + ' — ' + name + (description ? ': ' + description : ''), description };
  });
}
