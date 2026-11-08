/**
 * Sampling plan for an asphalt section (ASTM D6433-07).
 * Mirrors lakad_private.required_sample_units / confirm_sampling_plan in
 * supabase/migrations/20261107160000_section_sampling_plan.sql and start_survey_round in
 * supabase/migrations/20261108150000_survey_rounds.sql, so the preview matches what is saved.
 */
import { SAMPLE_UNIT_MAX_AREA, SAMPLE_UNIT_MIN_AREA, SAMPLE_UNIT_TARGET_AREA } from '../pci/pci-service';
import { minimumRandomSamples, systematicRandomUnits } from './section';

export type SamplingMethod = 'all' | 'confidence' | 'reduced';

export const TARGET_UNIT_AREA = SAMPLE_UNIT_TARGET_AREA;

/** Option 3 reduced sampling rate: total units N → units to inspect n. */
export const REDUCED_SAMPLING_TABLE: { range: string; inspect: string; upTo: number; count: (total: number) => number }[] = [
  { range: '1-5', inspect: '1', upTo: 5, count: () => 1 },
  { range: '6-10', inspect: '2', upTo: 10, count: () => 2 },
  { range: '11-15', inspect: '3', upTo: 15, count: () => 3 },
  { range: '16-40', inspect: '4', upTo: 40, count: () => 4 },
  { range: 'Over 40', inspect: '10% of N', upTo: Infinity, count: (total) => Math.ceil(total * 0.1) },
];

/**
 * §2.1.7: divide the section into N units of about Au = 225 m², each within 135–315 m².
 * Returns null when no whole number of units fits (section smaller than 135 m²).
 */
export function sectionSampleUnits(area: number) {
  if (!Number.isFinite(area) || area < SAMPLE_UNIT_MIN_AREA) return null;
  let total = Math.max(1, Math.round(area / TARGET_UNIT_AREA));
  while (area / total > SAMPLE_UNIT_MAX_AREA) total += 1;
  while (total > 1 && area / total < SAMPLE_UNIT_MIN_AREA) total -= 1;
  const unitArea = area / total;
  return unitArea >= SAMPLE_UNIT_MIN_AREA && unitArea <= SAMPLE_UNIT_MAX_AREA ? { total, unitArea } : null;
}

/**
 * n for each option: all units, §7.5.2 Eq. 1 (e = 5), or the reduced table. Round 1 uses s = 10;
 * later rounds pass s measured from the previous round (§7.5.2.1 Eq. 2).
 */
export function requiredSampleUnits(method: SamplingMethod, total: number, deviation = 10) {
  if (method === 'all') return total;
  if (method === 'confidence') return minimumRandomSamples(total, deviation);
  return REDUCED_SAMPLING_TABLE.find((row) => total <= row.upTo)!.count(total);
}

/** §7.5.3 Eq. 3: interval i = floor(N/n); units s, s+i, s+2i, … through the section. */
export function samplingSelection(method: SamplingMethod, total: number, first: number, deviation = 10) {
  const required = requiredSampleUnits(method, total, deviation);
  if (method === 'all') return { required, interval: 1, first: 1, units: Array.from({ length: total }, (_, index) => index + 1) };
  const { interval, units } = systematicRandomUnits(total, required, first);
  return { required, interval, first, units };
}

/** Random start s in 1..i. */
export function randomStart(method: SamplingMethod, total: number, random = Math.random, deviation = 10) {
  if (method === 'all') return 1;
  const interval = Math.floor(total / requiredSampleUnits(method, total, deviation));
  return Math.floor(random() * interval) + 1;
}

/** Station format used on the preview, e.g. 40 m → 0+040, 1250.5 m → 1+251. */
export function formatChainage(meters: number) {
  const whole = Math.max(0, Math.round(meters));
  return `${Math.floor(whole / 1000)}+${String(whole % 1000).padStart(3, '0')}`;
}

/** Planned slot of unit u within the section, in metres from the section start. */
export function unitSlot(unit: number, total: number, length: number) {
  return { start: ((unit - 1) * length) / total, end: (unit * length) / total };
}
