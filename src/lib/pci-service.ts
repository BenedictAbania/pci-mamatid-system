/** Official integration boundary. This module never imports the public demo curves. */
export const REFERENCE_PENDING = 'Preliminary — ASTM reference data pending verification';
export type Measurement = { distress_type_id: string; severity: 'low' | 'medium' | 'high' | null; quantity: number; unit_of_measure: string; location_m: number | null };
export type ReferenceDistress = { id: string; default_unit_of_measure: string | null; severity_required: boolean; allowed_severities: string[]; is_active: boolean };
export type CalculationInput = { area_sqm: number; edition: string; revision: number; measurements: Measurement[] };
export type CalculationOutput = {
  densities: number[]; deduct_values: number[]; total_deduct_value: number; highest_deduct_value: number;
  allowable_deducts: number; q: number;
  iterations: { adjusted_deducts: number[]; q: number; total_deduct_value: number; corrected_deduct_value: number }[];
  max_corrected_deduct_value: number; pci: number; condition: string;
};
export interface VerifiedPciAdapter {
  readonly edition: string; readonly referenceId: string; readonly algorithmVersion: string;
  /** Implement privately against licensed, verified references, including density conventions. */
  computeSample(input: CalculationInput): Promise<CalculationOutput>;
  computeSection(input: { area_sqm: number; requiredRandomIds: string[]; samples: { id: string; area_sqm: number; sample_type: 'random' | 'additional'; pci: number }[] }): Promise<{ pci: number; method: string; weights: Record<string, number> }>;
}
export function pendingCalculation(input: CalculationInput) {
  return { verification: 'pending' as const, label: REFERENCE_PENDING, edition: input.edition, input, output: null };
}
export function validateMeasurement(row: Measurement, type: ReferenceDistress, area: number, length: number | null, existing: Measurement[]) {
  if (!Number.isFinite(area) || area <= 0) throw new Error('A positive sample-unit area is required.');
  if (!type.is_active || row.distress_type_id !== type.id) throw new Error('Select an active distress reference.');
  if (!Number.isFinite(row.quantity) || row.quantity <= 0) throw new Error('Quantity must be positive.');
  if (!type.default_unit_of_measure || row.unit_of_measure !== type.default_unit_of_measure) throw new Error('Use the configured measurement unit.');
  if ((type.severity_required && !row.severity) || (row.severity && !type.allowed_severities.includes(row.severity)) || (!type.severity_required && row.severity)) throw new Error('Select the allowed severity (or Not applicable).');
  if (['m²', 'm2', 'sqm'].includes(row.unit_of_measure) && row.quantity > area) throw new Error('Measured area exceeds the sample boundary.');
  if (['No.', 'count'].includes(row.unit_of_measure) && !Number.isInteger(row.quantity)) throw new Error('Count must be a whole number.');
  if (row.location_m !== null && (!Number.isFinite(row.location_m) || row.location_m < 0 || length === null || row.location_m > length)) throw new Error('Location must fall within the sample length.');
  if (existing.some(other => other.distress_type_id === row.distress_type_id && other.severity === row.severity)) throw new Error('This distress and severity already exists. Combine measurements in the existing record.');
}
export function possibleSampleUnits(area: number, target = 225) {
  if (!Number.isFinite(area) || area < 135 || !Number.isFinite(target) || target < 135 || target > 315) throw new Error('Check section area and target sample size (135–315 m²).');
  const count = Math.max(1, Math.ceil(area / target));
  return { count, areaPerUnit: area / count, needsAdjustment: area / count < 135 };
}
export type PrioritySection = { id: string; pci: number; safety: boolean; highSeverity: number; affectedArea: number };
export function rankPriorities(rows: PrioritySection[], useSafety = true, useArea = true) {
  return [...rows].sort((a, b) => a.pci - b.pci || (useSafety ? Number(b.safety) - Number(a.safety) || b.highSeverity - a.highSeverity : 0) || (useArea ? b.affectedArea - a.affectedArea : 0) || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, rank: index + 1, reason: `LAKAD rule: PCI ${row.pci} (lowest first)${useSafety ? `; safety ${row.safety ? 'yes' : 'no'}, high-severity records ${row.highSeverity}` : ''}${useArea ? `; affected area ${row.affectedArea} m²` : ''}.` }));
}
