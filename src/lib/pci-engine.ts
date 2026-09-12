/**
 * PCI Computation Engine
 *
 * Shared module for computing the Pavement Condition Index following the
 * ASTM D6433-07 procedure structure.
 *
 * IMPORTANT — The Deduct Value lookup curves in this module are simplified
 * illustrative approximations. They are NOT the verified ASTM D6433 tables.
 * The CDV correction procedure follows the real iterative method but uses
 * approximate correction curves for demonstration purposes.
 *
 * This module is intentionally free of Supabase or network dependencies so
 * it can be reused in both the public prototype and the authenticated
 * inspection workflow.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'Low' | 'Medium' | 'High';

export type MeasurementUnit = 'm\u00B2' | 'm' | 'No.';

export interface DistressTypeInfo {
  id: number;
  name: string;
  unit: MeasurementUnit;
  severities: readonly Severity[];
}

export interface DistressEntry {
  /** Client-side unique identifier for list management. */
  uid: string;
  distressId: number;
  distressName: string;
  severity: Severity;
  quantity: number;
  unit: MeasurementUnit;
}

export interface ComputedDistress extends DistressEntry {
  density: number;
  deductValue: number;
}

export interface CDVIteration {
  iteration: number;
  adjustedDVs: number[];
  q: number;
  tdv: number;
  cdv: number;
  isMax: boolean;
}

export interface ConditionCategory {
  rating: string;
  minPCI: number;
  maxPCI: number;
  color: string;
  darkColor: string;
}

export interface PCIResult {
  distresses: ComputedDistress[];
  totalDeductValue: number;
  highestDV: number;
  allowableDeducts: number;
  actualDeducts: number;
  cdvIterations: CDVIteration[];
  maxCDV: number;
  pci: number;
  rating: string;
  ratingColor: string;
  ratingDarkColor: string;
  ratingDescription: string;
}

// ---------------------------------------------------------------------------
// ASTM D6433-07 Asphalt Distress Catalog (19 types)
// ---------------------------------------------------------------------------

export const ASPHALT_DISTRESSES: readonly DistressTypeInfo[] = [
  { id: 1, name: 'Alligator Cracking', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 2, name: 'Bleeding', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 3, name: 'Block Cracking', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 4, name: 'Bumps and Sags', unit: 'm', severities: ['Low', 'Medium', 'High'] },
  { id: 5, name: 'Corrugation', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 6, name: 'Depression', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 7, name: 'Edge Cracking', unit: 'm', severities: ['Low', 'Medium', 'High'] },
  { id: 8, name: 'Joint Reflection Cracking', unit: 'm', severities: ['Low', 'Medium', 'High'] },
  { id: 9, name: 'Lane/Shoulder Drop-Off', unit: 'm', severities: ['Low', 'Medium', 'High'] },
  { id: 10, name: 'Longitudinal Cracking', unit: 'm', severities: ['Low', 'Medium', 'High'] },
  { id: 11, name: 'Patching and Utility Cut Patching', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 12, name: 'Polished Aggregate', unit: 'm\u00B2', severities: [] },
  { id: 13, name: 'Potholes', unit: 'No.', severities: ['Low', 'Medium', 'High'] },
  { id: 14, name: 'Railroad Crossing', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 15, name: 'Rutting', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 16, name: 'Shoving', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 17, name: 'Slippage Cracking', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 18, name: 'Swell', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
  { id: 19, name: 'Weathering and Raveling', unit: 'm\u00B2', severities: ['Low', 'Medium', 'High'] },
] as const;

// ---------------------------------------------------------------------------
// Condition Rating Scale (7 tiers, non-overlapping whole-number ranges)
// ---------------------------------------------------------------------------

export const CONDITION_RATINGS: readonly ConditionCategory[] = [
  { rating: 'Good', minPCI: 86, maxPCI: 100, color: '#16A34A', darkColor: '#4ADE80' },
  { rating: 'Satisfactory', minPCI: 71, maxPCI: 85, color: '#65A30D', darkColor: '#A3E635' },
  { rating: 'Fair', minPCI: 56, maxPCI: 70, color: '#D97706', darkColor: '#FBBF24' },
  { rating: 'Poor', minPCI: 41, maxPCI: 55, color: '#EA580C', darkColor: '#FB923C' },
  { rating: 'Very Poor', minPCI: 26, maxPCI: 40, color: '#DC2626', darkColor: '#F87171' },
  { rating: 'Serious', minPCI: 11, maxPCI: 25, color: '#B91C1C', darkColor: '#EF4444' },
  { rating: 'Failed', minPCI: 0, maxPCI: 10, color: '#7F1D1D', darkColor: '#FCA5A5' },
] as const;

const RATING_DESCRIPTIONS: Record<string, string> = {
  Good: 'The pavement is in good condition with only minor distresses, if any.',
  Satisfactory: 'The pavement is in satisfactory condition with low-severity distresses.',
  Fair: 'The pavement is in fair condition, with some distress and signs of deterioration.',
  Poor: 'The pavement has significant deterioration and requires maintenance.',
  'Very Poor': 'The pavement is in very poor condition with extensive deterioration.',
  Serious: 'The pavement has serious deterioration and needs urgent repair.',
  Failed: 'The pavement has failed and requires immediate reconstruction.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Linear interpolation on a sorted array of [x, y] points. */
function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }

  return points[points.length - 1][1];
}

let uidCounter = 0;
export function generateUID(): string {
  uidCounter += 1;
  return `d-${Date.now()}-${uidCounter}`;
}

// ---------------------------------------------------------------------------
// Illustrative Deduct Value Lookup
// ---------------------------------------------------------------------------

/**
 * Simplified DV lookup curves per distress type.
 *
 * Each entry maps a distress ID to an array of [density, dvLow, dvMedium, dvHigh]
 * anchor points. Values between anchors are linearly interpolated.
 *
 * These are illustrative approximations for demonstration only.
 * The complete ASTM D6433 deduct-value tables are not publicly exposed.
 */
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

/**
 * Returns an illustrative Deduct Value for the given distress type,
 * severity, and density percentage.
 */
export function lookupDeductValue(
  distressId: number,
  severity: Severity | null,
  density: number,
): number {
  if (density <= 0) return 0;

  const curve = DV_CURVES[distressId];
  if (!curve) return 0;

  // Polished Aggregate (id 12) has no severity — always use medium column
  const colIdx = severity === 'High' ? 3 : severity === 'Low' ? 1 : 2;

  const points: [number, number][] = curve.map((row) => [row[0], row[colIdx]]);
  return Math.round(interpolate(points, density));
}

// ---------------------------------------------------------------------------
// CDV Correction Curve (illustrative)
// ---------------------------------------------------------------------------

/**
 * Approximate CDV correction curves.
 * Maps [TDV, CDV] points for each q value.
 *
 * When q = 1, CDV equals TDV (the identity line).
 * For q >= 2, the correction curve reduces CDV relative to TDV.
 */
const CDV_CORRECTION_CURVES: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0], [200, 200]],
  2: [[0, 0], [10, 8], [20, 16], [30, 24], [34, 28], [40, 31], [50, 38], [60, 43], [80, 52], [100, 58], [120, 64], [150, 72], [200, 82]],
  3: [[0, 0], [10, 7], [20, 14], [30, 21], [40, 31], [42, 34], [50, 37], [60, 41], [80, 48], [100, 54], [120, 60], [150, 68], [200, 78]],
  4: [[0, 0], [10, 6], [20, 12], [30, 18], [40, 29], [48, 38], [50, 39], [60, 43], [80, 50], [100, 56], [120, 61], [150, 68], [200, 78]],
  5: [[0, 0], [10, 5], [20, 10], [30, 15], [40, 20], [50, 28], [60, 32], [80, 40], [100, 46], [120, 51], [150, 58], [200, 68]],
  6: [[0, 0], [10, 4], [20, 9], [30, 13], [40, 18], [50, 24], [60, 28], [80, 36], [100, 42], [120, 47], [150, 54], [200, 64]],
  7: [[0, 0], [10, 4], [20, 8], [30, 12], [40, 16], [50, 21], [60, 25], [80, 33], [100, 39], [120, 44], [150, 51], [200, 60]],
};

function lookupCDV(tdv: number, q: number): number {
  if (q <= 0 || tdv <= 0) return 0;

  const qCapped = Math.min(q, 7);
  const curve = CDV_CORRECTION_CURVES[qCapped];
  if (!curve) return Math.min(Math.round(tdv), 100);

  return Math.max(0, Math.min(Math.round(interpolate(curve, tdv)), 100));
}

// ---------------------------------------------------------------------------
// Density Computation
// ---------------------------------------------------------------------------

/** Density (%) = (Quantity / Sample Area) x 100. */
export function computeDensity(quantity: number, sampleArea: number): number {
  if (sampleArea <= 0 || quantity <= 0) return 0;
  return (quantity / sampleArea) * 100;
}

// ---------------------------------------------------------------------------
// Condition Rating Lookup
// ---------------------------------------------------------------------------

export function getConditionRating(pci: number): ConditionCategory {
  const rounded = Math.round(pci);
  for (const cat of CONDITION_RATINGS) {
    if (rounded >= cat.minPCI && rounded <= cat.maxPCI) return cat;
  }
  return CONDITION_RATINGS[CONDITION_RATINGS.length - 1];
}

// ---------------------------------------------------------------------------
// Main PCI Computation
// ---------------------------------------------------------------------------

export function computePCI(entries: DistressEntry[], sampleArea: number): PCIResult {
  // 1. Compute density and deduct value for each entry
  const distresses: ComputedDistress[] = entries.map((entry) => {
    const density = computeDensity(entry.quantity, sampleArea);
    const deductValue = lookupDeductValue(entry.distressId, entry.severity, density);
    return { ...entry, density, deductValue };
  });

  // 2. Collect and sort deduct values (descending)
  const dvs = distresses.map((d) => d.deductValue).sort((a, b) => b - a);

  if (dvs.length === 0 || dvs.every((v) => v === 0)) {
    const cat = getConditionRating(100);
    return {
      distresses,
      totalDeductValue: 0,
      highestDV: 0,
      allowableDeducts: 0,
      actualDeducts: 0,
      cdvIterations: [],
      maxCDV: 0,
      pci: 100,
      rating: cat.rating,
      ratingColor: cat.color,
      ratingDarkColor: cat.darkColor,
      ratingDescription: RATING_DESCRIPTIONS[cat.rating] ?? '',
    };
  }

  // 3. Calculate allowable number of deducts (m)
  //    m = 1 + (9/98) * (100 - HDV)
  const highestDV = dvs[0];
  const allowableDeducts = 1 + (9 / 98) * (100 - highestDV);
  const actualDeducts = dvs.length;

  // 4. Trim to allowable deducts (if needed)
  const mInt = Math.min(Math.ceil(allowableDeducts), dvs.length);
  let workingDVs = dvs.slice(0, mInt);

  // 5. CDV correction iterations
  const cdvIterations: CDVIteration[] = [];
  let maxCDV = 0;

  for (let iter = 1; iter <= workingDVs.length; iter++) {
    const q = workingDVs.filter((v) => v > 2).length;
    if (q === 0) break;

    const tdv = workingDVs.reduce((sum, v) => sum + v, 0);
    const cdv = lookupCDV(tdv, q);

    cdvIterations.push({
      iteration: iter,
      adjustedDVs: [...workingDVs],
      q,
      tdv,
      cdv,
      isMax: false,
    });

    if (cdv > maxCDV) maxCDV = cdv;
    if (q === 1) break;

    // Reduce the smallest DV > 2 to 2
    const smallestIdx = workingDVs.reduce(
      (minIdx, val, idx) => {
        if (val > 2 && (minIdx === -1 || val < workingDVs[minIdx])) return idx;
        return minIdx;
      },
      -1,
    );

    if (smallestIdx === -1) break;
    workingDVs = [...workingDVs];
    workingDVs[smallestIdx] = 2;
  }

  // Mark the iteration that produced the maximum CDV
  for (const it of cdvIterations) {
    if (it.cdv === maxCDV) {
      it.isMax = true;
      break;
    }
  }

  // 6. PCI = 100 - max CDV
  const pci = Math.max(0, Math.min(100, Math.round(100 - maxCDV)));
  const tdvFinal = distresses.reduce((sum, d) => sum + d.deductValue, 0);

  const cat = getConditionRating(pci);

  return {
    distresses,
    totalDeductValue: tdvFinal,
    highestDV,
    allowableDeducts,
    actualDeducts,
    cdvIterations,
    maxCDV,
    pci,
    rating: cat.rating,
    ratingColor: cat.color,
    ratingDarkColor: cat.darkColor,
    ratingDescription: RATING_DESCRIPTIONS[cat.rating] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Sample Datasets
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLE: DistressEntry[] = [
  { uid: 'demo-1', distressId: 1, distressName: 'Alligator Cracking', severity: 'Low', quantity: 5, unit: 'm\u00B2' },
  { uid: 'demo-2', distressId: 10, distressName: 'Longitudinal Cracking', severity: 'Medium', quantity: 8, unit: 'm' },
  { uid: 'demo-3', distressId: 13, distressName: 'Potholes', severity: 'High', quantity: 2, unit: 'No.' },
  { uid: 'demo-4', distressId: 19, distressName: 'Weathering and Raveling', severity: 'Medium', quantity: 12, unit: 'm\u00B2' },
];

export const ALTERNATE_SAMPLE: DistressEntry[] = [
  { uid: 'alt-1', distressId: 3, distressName: 'Block Cracking', severity: 'Medium', quantity: 15, unit: 'm\u00B2' },
  { uid: 'alt-2', distressId: 15, distressName: 'Rutting', severity: 'High', quantity: 8, unit: 'm\u00B2' },
  { uid: 'alt-3', distressId: 7, distressName: 'Edge Cracking', severity: 'Low', quantity: 10, unit: 'm' },
  { uid: 'alt-4', distressId: 11, distressName: 'Patching and Utility Cut Patching', severity: 'Medium', quantity: 6, unit: 'm\u00B2' },
  { uid: 'alt-5', distressId: 5, distressName: 'Corrugation', severity: 'Low', quantity: 4, unit: 'm\u00B2' },
];

export const DEFAULT_SAMPLE_AREA = 250;
