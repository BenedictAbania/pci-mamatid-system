import { potholeQuantity, type PotholeDetails, type Severity, type Unit } from './catalog.ts';

export type PartMode = 'rectangle' | 'irregular' | 'length' | 'small_pothole' | 'large_pothole';
export type PartDraft = { mode: PartMode; length: string; width: string; area: string; count: string; diameter: string; depth: string };
export type MeasurementPart =
  | { mode: 'rectangle'; length_m: number; width_m: number }
  | { mode: 'irregular'; area_sqm: number }
  | { mode: 'length'; length_m: number }
  | { mode: 'small_pothole'; count: number; diameter_mm: number; depth_mm: number }
  | { mode: 'large_pothole'; diameter_mm: number; depth_mm: number; area_sqm: number };

export function blankPart(unit: Unit): PartDraft {
  return { mode: unit === 'm²' ? 'rectangle' : unit === 'm' ? 'length' : 'small_pothole', length: '', width: '', area: '', count: '', diameter: '', depth: '' };
}

export function partToDraft(part: MeasurementPart): PartDraft {
  return { mode: part.mode, length: 'length_m' in part ? String(part.length_m) : '', width: 'width_m' in part ? String(part.width_m) : '', area: 'area_sqm' in part ? String(part.area_sqm) : '', count: 'count' in part ? String(part.count) : '', diameter: 'diameter_mm' in part ? String(part.diameter_mm) : '', depth: 'depth_mm' in part ? String(part.depth_mm) : '' };
}
export function describePart(part: MeasurementPart): string {
  switch (part.mode) {
    case 'rectangle': return `${part.length_m} × ${part.width_m} m = ${part.length_m * part.width_m} m²`;
    case 'irregular': return `${part.area_sqm} m² irregular area`;
    case 'length': return `${part.length_m} m affected length`;
    case 'small_pothole': return `${part.count} hole(s), ${part.diameter_mm} mm diameter, ${part.depth_mm} mm depth`;
    case 'large_pothole': return `${part.area_sqm} m² large hole, ${part.diameter_mm} mm diameter, ${part.depth_mm} mm depth`;
  }
}

function positiveInput(raw: string, label: string) {
  if (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) <= 0) throw new Error(`${label} must be a positive number.`);
  return Number(raw);
}

/** Table X1.1. Exact 200, 450 and 750 mm diameter boundaries await CE resolution. */
export function smallPotholeSeverity(diameter: number, depth: number): Severity {
  if (diameter < 100 || diameter >= 750 || diameter === 200 || diameter === 450 || depth < 13 || !Number.isFinite(diameter) || !Number.isFinite(depth))
    throw new Error('Pothole dimensions are outside the unambiguous draft table range; ask the Civil Engineer.');
  const column = diameter < 200 ? 0 : diameter < 450 ? 1 : 2;
  const row = depth <= 25 ? 0 : depth <= 50 ? 1 : 2;
  return ([['low', 'low', 'medium'], ['low', 'medium', 'high'], ['medium', 'medium', 'high']] as const)[row][column];
}

/** UI preview and client validation. The Review database recomputes Q independently. */
export function measureParts(drafts: PartDraft[], unit: Unit, severity: Severity | null): { parts: MeasurementPart[]; quantity: number; potholes?: PotholeDetails } {
  if (!drafts.length || drafts.length > 100) throw new Error('Add between 1 and 100 measured parts.');
  const parts: MeasurementPart[] = [];
  const potholes: PotholeDetails = { small_count: 0, large_holes: [] };
  let quantity = 0;
  for (const draft of drafts) {
    if (unit === 'm²' && draft.mode === 'rectangle') {
      const length_m = positiveInput(draft.length, 'Part length');
      const width_m = positiveInput(draft.width, 'Part width');
      parts.push({ mode: 'rectangle', length_m, width_m }); quantity += length_m * width_m;
    } else if (unit === 'm²' && draft.mode === 'irregular') {
      const area_sqm = positiveInput(draft.area, 'Measured irregular area');
      parts.push({ mode: 'irregular', area_sqm }); quantity += area_sqm;
    } else if (unit === 'm' && draft.mode === 'length') {
      const length_m = positiveInput(draft.length, 'Affected length');
      parts.push({ mode: 'length', length_m }); quantity += length_m;
    } else if (unit === 'No.' && draft.mode === 'small_pothole') {
      const count = positiveInput(draft.count, 'Pothole count');
      const diameter_mm = positiveInput(draft.diameter, 'Pothole diameter');
      const depth_mm = positiveInput(draft.depth, 'Pothole maximum depth');
      if (!Number.isSafeInteger(count)) throw new Error('Small pothole count must be a whole number.');
      if (smallPotholeSeverity(diameter_mm, depth_mm) !== severity) throw new Error('Pothole dimensions do not match the selected provisional severity.');
      parts.push({ mode: 'small_pothole', count, diameter_mm, depth_mm }); potholes.small_count += count;
    } else if (unit === 'No.' && draft.mode === 'large_pothole') {
      const diameter_mm = positiveInput(draft.diameter, 'Large pothole diameter');
      const depth_mm = positiveInput(draft.depth, 'Large pothole maximum depth');
      const area_sqm = positiveInput(draft.area, 'Measured large-hole area');
      if (diameter_mm <= 750) throw new Error('Large-hole equivalent count requires diameter greater than 750 mm.');
      if (severity !== (depth_mm <= 25 ? 'medium' : 'high')) throw new Error('Large-hole depth does not match the selected provisional severity.');
      parts.push({ mode: 'large_pothole', diameter_mm, depth_mm, area_sqm }); potholes.large_holes.push({ diameter_mm, depth_mm, area_sqm });
    } else throw new Error('Measurement shape does not match the catalog unit.');
  }
  if (unit === 'No.') quantity = potholeQuantity(potholes, severity as Severity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Total measured quantity must be positive and finite.');
  return { parts, quantity, ...(unit === 'No.' ? { potholes } : {}) };
}

export const SEVERITY_MEASUREMENT_LABELS: Partial<Record<number, string>> = {
  6: 'Maximum depression depth (mm)', 9: 'Pavement-to-shoulder height difference (mm)',
  15: 'Mean rut depth (mm)', 17: 'Mean slippage-crack width (mm)',
};

export function severityEvidence(code: number, raw: string) {
  const label = SEVERITY_MEASUREMENT_LABELS[code];
  if (!label) return null;
  if (!raw.trim()) return null; // Some severity alternatives depend on observed condition, not one dimension.
  return { metric: code === 6 ? 'maximum_depression_depth_mm' : code === 9 ? 'lane_shoulder_height_mm' : code === 15 ? 'mean_rut_depth_mm' : 'mean_slippage_crack_width_mm', value_mm: positiveInput(raw, label) };
}
