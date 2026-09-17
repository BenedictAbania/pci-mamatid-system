/** Official integration boundary. This module never imports the public demo curves. */
export const REFERENCE_PENDING = 'Preliminary — ASTM reference data pending verification';
export const SAMPLE_UNIT_TARGET_AREA = 230;
export const SAMPLE_UNIT_MIN_AREA = 137;
export const SAMPLE_UNIT_MAX_AREA = 323;
export const SAMPLE_UNIT_GUIDANCE = 'Recommended asphalt sample-unit area:\napproximately 230 ± 93 m² when pavement width is below 7.30 m.';
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
export function isSampleUnitAreaAllowed(area: number) {
  return Number.isFinite(area) && area >= SAMPLE_UNIT_MIN_AREA && area <= SAMPLE_UNIT_MAX_AREA;
}
export function possibleSampleUnits(area: number, target = SAMPLE_UNIT_TARGET_AREA) {
  if (!Number.isFinite(area) || area < SAMPLE_UNIT_MIN_AREA || !isSampleUnitAreaAllowed(target)) throw new Error('Check section area and target sample size (137–323 m²).');
  const count = Math.max(1, Math.ceil(area / target));
  const areaPerUnit = area / count;
  return { count, areaPerUnit, needsAdjustment: !isSampleUnitAreaAllowed(areaPerUnit) };
}
export type PrioritySection = { id: string; pci: number; safety: boolean; highSeverity: number; affectedArea: number };
export function rankPriorities(rows: PrioritySection[]) {
  return [...rows].sort((a, b) => {
    const aRisk = a.safety || a.highSeverity > 0;
    const bRisk = b.safety || b.highSeverity > 0;
    return a.pci - b.pci || Number(bRisk) - Number(aRisk) || b.affectedArea - a.affectedArea;
  }).map((row, index) => ({
    ...row,
    rank: index + 1,
    reason: `LAKAD rule: PCI ${row.pci} (lowest first); high-severity/safety-related distress ${row.safety || row.highSeverity > 0 ? 'present' : 'not recorded'}; affected area ${row.affectedArea} m².`,
  }));
}
