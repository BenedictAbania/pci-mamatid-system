/**
 * Public prototype PCI engine.
 *
 * Runs the same ASTM D6433-07 sample procedure as official inspections, through the
 * shared engine in `../d6433-07/sample.ts`: one record per distress and severity
 * (§9.1), density (§§9.1–9.2), the §9.5.1 shortcut, allowable deducts m (§9.5.3, Eq. 4),
 * the fractional deduct (§9.5.4), CDV iteration (§9.5.5), PCI = 100 − max CDV (§9.6)
 * and the Fig. 1 rating. Values keep full precision; screens round for display only.
 *
 * IMPORTANT: the deduct-value and CDV curves below are simplified illustrative
 * approximations. They are NOT ASTM D6433-07 curve readings. Official calculations
 * run on the server with the private curve package; this module never sees it.
 *
 * This module has no Supabase or network dependency.
 */

import { ASPHALT_CATALOG, EDITION, definition, type Severity, type Unit } from '../d6433-07/catalog.ts';
import type { CurveReader } from '../d6433-07/curves.ts';
import { calculateSample, type SampleOutput } from '../d6433-07/sample.ts';
import { getPciConditionCategory, PCI_CONDITION_SCALE, type PciConditionCategory } from './pci-classification.ts';

export type { Severity, Unit };

/** One distress row in the demonstration list. Severity is null only for Polished Aggregate. */
export interface DemoEntry {
  uid: string;
  code: number;
  severity: Severity | null;
  quantity: number;
}

export type DemoRow = SampleOutput['groups'][number] & { name: string };

export type DemoResult = SampleOutput & {
  rows: DemoRow[];
  category: PciConditionCategory;
  /** Deduct values from highest to lowest. */
  sortedDeducts: number[];
  /** True when at most one deduct value exceeds 2 (§9.5.1): max CDV = TDV, no iteration. */
  shortcut: boolean;
  /** Index of the iteration with the maximum CDV, or -1 for the shortcut. */
  maxIteration: number;
  /** Plain-language account of which deduct values entered the CDV iteration. */
  retention: string;
};

export const ASPHALT_DISTRESSES = ASPHALT_CATALOG;
export const CONDITION_RATINGS: readonly PciConditionCategory[] = PCI_CONDITION_SCALE;
export const DEMO_REFERENCE_ID = 'lakad-demo-illustrative';

let uidCounter = 0;
export function generateUID(): string {
  uidCounter += 1;
  return `d-${Date.now()}-${uidCounter}`;
}

// ---------------------------------------------------------------------------
// Illustrative curves (not ASTM D6433-07 readings)
// ---------------------------------------------------------------------------

/** Linear interpolation on sorted [x, y] points; values outside the range are held at the end points. */
function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** Per distress code: [density %, DV low, DV medium, DV high]. Polished Aggregate uses the medium column. */
const DV_CURVES: Record<number, readonly (readonly [number, number, number, number])[]> = {
  1: [[0,0,0,0],[0.5,3,8,15],[1,6,14,25],[2,12,22,38],[5,22,35,55],[10,33,48,68],[20,42,58,80],[50,52,68,90],[100,58,74,96]],
  2: [[0,0,0,0],[1,1,3,6],[5,3,7,12],[10,5,10,18],[20,7,14,24],[50,10,18,30],[100,12,22,35]],
  3: [[0,0,0,0],[1,2,4,8],[5,5,10,18],[10,8,15,26],[20,12,20,34],[50,16,26,42],[100,18,30,48]],
  4: [[0,0,0,0],[1,6,12,22],[3,12,22,38],[5,16,28,48],[10,22,36,58],[20,28,42,65],[50,34,50,75]],
  5: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42],[50,22,34,52],[100,26,38,58]],
  6: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42],[50,22,34,52],[100,26,38,58]],
  7: [[0,0,0,0],[1,2,4,8],[5,5,10,18],[10,8,15,26],[20,12,20,34],[50,16,26,42]],
  8: [[0,0,0,0],[1,2,5,10],[5,6,12,22],[10,10,18,30],[20,14,24,38],[50,18,30,46]],
  9: [[0,0,0,0],[1,1,3,6],[5,3,7,12],[10,5,10,18],[20,7,14,24],[50,10,18,30]],
  10: [[0,0,0,0],[1,1,3,7],[2,2,5,11],[3,2,8,14],[3.2,2,10,15],[5,4,12,20],[10,6,18,28],[20,9,24,36],[50,12,30,44]],
  11: [[0,0,0,0],[1,2,4,8],[5,5,10,18],[10,8,15,26],[20,12,22,35],[50,16,28,44],[100,20,32,50]],
  12: [[0,0,0,0],[1,0,2,0],[5,0,4,0],[10,0,6,0],[20,0,8,0],[50,0,10,0],[100,0,12,0]],
  13: [[0,0,0,0],[0.1,4,10,12],[0.5,8,14,16],[0.8,10,16,18],[1,12,18,22],[2,16,24,34],[5,24,35,52],[10,32,46,66]],
  14: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42]],
  15: [[0,0,0,0],[1,4,8,14],[5,10,18,30],[10,15,25,40],[20,20,32,50],[50,28,42,62],[100,34,50,72]],
  16: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42],[50,22,34,52]],
  17: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42],[50,22,34,52]],
  18: [[0,0,0,0],[1,3,6,12],[5,8,14,25],[10,12,20,34],[20,16,26,42],[50,22,34,52]],
  19: [[0,0,0,0],[1,1,2,4],[3,2,5,9],[4.8,3,8,14],[5,3,8,15],[10,5,12,22],[20,8,16,28],[50,12,22,38],[100,15,26,44]],
};

/** Per q: [TDV, CDV] points. q = 1 is the identity line; q >= 8 uses the q = 7 curve. */
const CDV_CURVES: Record<number, readonly (readonly [number, number])[]> = {
  2: [[0, 0], [10, 8], [20, 16], [30, 24], [34, 28], [40, 31], [50, 38], [60, 43], [80, 52], [100, 58], [120, 64], [150, 72], [200, 82]],
  3: [[0, 0], [10, 7], [20, 14], [30, 21], [40, 31], [42, 34], [50, 37], [60, 41], [80, 48], [100, 54], [120, 60], [150, 68], [200, 78]],
  4: [[0, 0], [10, 6], [20, 12], [30, 18], [40, 29], [48, 38], [50, 39], [60, 43], [80, 50], [100, 56], [120, 61], [150, 68], [200, 78]],
  5: [[0, 0], [10, 5], [20, 10], [30, 15], [40, 20], [50, 28], [60, 32], [80, 40], [100, 46], [120, 51], [150, 58], [200, 68]],
  6: [[0, 0], [10, 4], [20, 9], [30, 13], [40, 18], [50, 24], [60, 28], [80, 36], [100, 42], [120, 47], [150, 54], [200, 64]],
  7: [[0, 0], [10, 4], [20, 8], [30, 12], [40, 16], [50, 21], [60, 25], [80, 33], [100, 39], [120, 44], [150, 51], [200, 60]],
};

/** Illustrative reader handed to the shared D6433-07 engine in place of the private curve package. */
const DEMO_READER: CurveReader = {
  id: DEMO_REFERENCE_ID,
  digest: '',
  deduct(code, severity, density) {
    const column = severity === 'high' ? 3 : severity === 'low' ? 1 : 2;
    return interpolate(DV_CURVES[code].map((row) => [row[0], row[column]] as const), density);
  },
  corrected(total, q) {
    if (q <= 1) return total;
    return Math.min(total, interpolate(CDV_CURVES[Math.min(q, 7)], total));
  },
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Explains the §9.5.3–9.5.4 retention of deduct values for the CDV iteration. */
export function retentionNote(sorted: readonly number[], m: number, shortcut: boolean): string {
  if (!sorted.length) return 'No distress recorded. Every deduct value is zero.';
  const aboveTwo = sorted.filter((value) => value > 2).length;
  if (shortcut) return `${aboveTwo === 0 ? 'No' : 'Only one'} deduct value is greater than 2, so the maximum CDV equals the total deduct value. No iteration is needed.`;
  const whole = Math.floor(m);
  const fraction = m - whole;
  if (sorted.length <= whole) return `m = ${m.toFixed(2)} allows ${plural(whole, 'deduct value')}, so all ${plural(sorted.length, 'deduct value')} are kept.`;
  if (fraction > 0) return `m = ${m.toFixed(2)}: the ${plural(whole, 'highest deduct value')} are kept and the next one is multiplied by ${fraction.toFixed(2)}.`;
  return `m = ${m.toFixed(2)}: only the ${plural(whole, 'highest deduct value')} are kept.`;
}

/**
 * Computes a demonstration PCI with the shared ASTM D6433-07 procedure.
 * Throws an Error with a readable message when the input breaks a D6433-07 rule
 * (for example, a sample area outside 135–315 m²).
 */
export function computeDemoPci(entries: readonly DemoEntry[], sampleArea: number): DemoResult {
  const output = calculateSample(
    {
      edition: EDITION,
      area_sqm: sampleArea,
      observations: entries.map((entry) => ({ code: entry.code, severity: entry.severity, quantity: entry.quantity, unit: definition(entry.code).unit })),
      no_distress_confirmed: entries.length === 0,
      field_rules_confirmed: true,
    },
    DEMO_READER,
  );
  const sortedDeducts = [...output.deduct_values].sort((a, b) => b - a);
  const shortcut = output.iterations.length === 0;
  const maxIteration = shortcut ? -1 : output.iterations.findIndex((it) => it.corrected_deduct_value === output.max_corrected_deduct_value);
  return {
    ...output,
    rows: output.groups.map((group) => ({ ...group, name: definition(group.code).name })),
    category: getPciConditionCategory(output.pci),
    sortedDeducts,
    shortcut,
    maxIteration,
    retention: retentionNote(sortedDeducts, output.allowable_deducts, shortcut),
  };
}

// ---------------------------------------------------------------------------
// Sample datasets
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLE_AREA = 250;

export const DEFAULT_SAMPLE: readonly DemoEntry[] = [
  { uid: 'demo-1', code: 1, severity: 'low', quantity: 5 },
  { uid: 'demo-2', code: 10, severity: 'medium', quantity: 8 },
  { uid: 'demo-3', code: 13, severity: 'high', quantity: 2 },
  { uid: 'demo-4', code: 19, severity: 'medium', quantity: 12 },
];

/** Includes a high deduct value, so m falls below the number of deducts and §9.5.4 applies. */
export const ALTERNATE_SAMPLE: readonly DemoEntry[] = [
  { uid: 'alt-1', code: 1, severity: 'high', quantity: 15 },
  { uid: 'alt-2', code: 15, severity: 'high', quantity: 8 },
  { uid: 'alt-3', code: 3, severity: 'medium', quantity: 15 },
  { uid: 'alt-4', code: 7, severity: 'low', quantity: 10 },
  { uid: 'alt-5', code: 11, severity: 'medium', quantity: 6 },
];
