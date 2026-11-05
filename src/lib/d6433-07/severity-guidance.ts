/** Original, abbreviated field cues checked against D6433-07 Appendix X1.
 * These are provisional prompts, not the standard's text or CE-approved rules.
 * Keep old versions here if wording changes: saved measurements carry a version
 * and the displayed cue so historical evidence never depends on live wording.
 */
export const D07_GUIDANCE_VERSION = 'D07-X1-draft-2026-11-03';
export const D07_GUIDANCE_STATUS = 'provisional' as const;
export type SeverityCode = 'low' | 'medium' | 'high';
export type SeverityGuidanceSnapshot = {
  version: string;
  status: 'provisional';
  severity: SeverityCode | null;
  text: string;
  source: string;
};
type Guidance = { source: string; context?: string; low?: string; medium?: string; high?: string; none?: string };

export const D07_SEVERITY_GUIDANCE: Record<number, Guidance> = {
  1: { source: 'X1.5.1', low: 'Fine parallel hairline cracks with few links and no broken edges.', medium: 'The cracks connect into a pattern; edges may be lightly broken.', high: 'Clearly defined cracked pieces have broken edges; some may move under traffic.' },
  2: { source: 'X1.6.1', low: 'A slight binder film appears briefly during the year and does not stick to shoes or tires.', medium: 'Surface binder sticks to shoes or tires for a few weeks of the year.', high: 'Extensive binder sticks substantially to shoes or tires for several weeks or longer.' },
  3: { source: 'X1.7.1; X1.14.2', context: 'Classify the cracks bounding each block using the crack criteria; this draft cross-reference needs CE review.', low: 'The blocks are bounded by low-severity cracks.', medium: 'The blocks are bounded by medium-severity cracks.', high: 'The blocks are bounded by high-severity cracks.' },
  4: { source: 'X1.8.2; X1.4.6', low: 'The bump or sag causes a slight bounce with little discomfort; normal speed is maintained.', medium: 'The bounce is noticeable and some speed reduction is needed for comfort or safety.', high: 'The bounce is excessive, with substantial discomfort or hazard; speed must fall considerably.' },
  5: { source: 'X1.9.1; X1.4.6', low: 'The ripples cause noticeable vibration without a needed speed reduction.', medium: 'Vibration is significant; some speed reduction is needed.', high: 'Vibration is excessive; considerable speed reduction is needed.' },
  6: { source: 'X1.10.1', context: 'Measure maximum depth. The printed low and medium bands both include 25 mm; ask the CE at that boundary.', low: 'Maximum depression depth is about 13–25 mm.', medium: 'Maximum depression depth is about 25–50 mm.', high: 'Maximum depression depth exceeds 50 mm.' },
  7: { source: 'X1.11.1', low: 'Low or medium edge cracks have no breakup or raveling.', medium: 'Medium edge cracks have some breakup and raveling.', high: 'The pavement edge has considerable breakup or raveling.' },
  8: { source: 'X1.12.1', context: 'Use only for an asphalt surface over a PCC joint. Filled-crack and nearby-cracking alternatives matter; review exact width endpoints with the CE.', low: 'An unfilled crack is under 10 mm wide, or a filled crack has sound filler and no qualifying nearby damage.', medium: 'An unfilled crack is 10 to under 75 mm wide, or qualifying light secondary cracking surrounds a crack.', high: 'Medium or worse secondary cracking, a wide unfilled crack, or severe breakup beside the crack is present.' },
  9: { source: 'X1.13.1', context: 'The printed bands leave exact 25, 50 and 100 mm boundaries unresolved; ask the CE before assigning those cases.', low: 'Pavement edge stands more than 25 but less than 50 mm above the shoulder.', medium: 'The difference is more than 50 but less than 100 mm.', high: 'The difference exceeds 100 mm.' },
  10: { source: 'X1.14.2', context: 'Filled-crack and nearby-cracking alternatives apply. The printed high-width clause has a unit typo; resolve 75 mm boundaries with the CE.', low: 'An unfilled crack is under 10 mm wide, or a filled crack has sound filler and no qualifying nearby damage.', medium: 'An unfilled crack is 10 to under 75 mm wide, or light random cracking surrounds a crack.', high: 'Medium or worse nearby cracking, a very wide unfilled crack, or severe breakup beside the crack is present.' },
  11: { source: 'X1.15.1–X1.15.2', context: 'Rate the patch itself. Do not count distress inside it a second time.', low: 'The patch is sound and the ride effect is low or less.', medium: 'The patch is moderately worn, or its ride effect is medium.', high: 'The patch is badly worn, or its ride effect is high; replacement may be needed soon.' },
  12: { source: 'X1.16.1–X1.16.2', none: 'No severity level for Polished Aggregate. Record the visibly polished, smooth-to-touch area; do not also count bleeding in that area.' },
  13: { source: 'X1.17.1–X1.17.2; Table X1.1', context: 'Use both measured diameter and maximum depth. Table column endpoints overlap at 200 and 450 mm; exactly 750 mm and out-of-range holes need CE direction.', low: 'Table cases: 100–200 mm diameter at 13–50 mm depth, or 200–450 mm at 13–25 mm depth.', medium: 'Table cases include 100–200 mm at over 50 mm, 200–450 mm at over 25 mm, or 450–750 mm at 13–25 mm. Larger holes at up to 25 mm depth also qualify.', high: 'Table cases include 450–750 mm at over 25 mm depth. Holes over 750 mm at over 25 mm depth also qualify.' },
  14: { source: 'X1.18.1–X1.18.2; X1.4.6', context: 'Do not count a crossing defect that has no ride effect.', low: 'The track-area defect causes a slight bounce with little discomfort.', medium: 'The crossing causes significant bounce or vibration and some speed reduction.', high: 'The crossing causes excessive bounce or vibration and considerable speed reduction.' },
  15: { source: 'X1.19.1–X1.19.2', context: 'Use the mean rut depth from measurements along the rut, not its deepest point.', low: 'Mean rut depth is about 6–13 mm.', medium: 'Mean rut depth is over 13 to 25 mm.', high: 'Mean rut depth exceeds 25 mm.' },
  16: { source: 'X1.20.3–X1.20.4; X1.4.6', context: 'Shoving within a patch is rated as part of the patch.', low: 'The displaced pavement causes slight ride effects with little discomfort.', medium: 'The displacement causes significant ride effects and some speed reduction.', high: 'The displacement causes excessive ride effects and considerable speed reduction.' },
  17: { source: 'X1.21.1', context: 'The printed width rules leave exactly 40 mm unresolved; nearby breakup is an alternative criterion.', low: 'Average crack width is under 10 mm.', medium: 'Average width is 10 to under 40 mm, or there is moderate edge breakup or secondary cracking.', high: 'Average width exceeds 40 mm, or nearby pieces are easily removed.' },
  18: { source: 'X1.22.1; X1.4.6', low: 'The long rise causes a slight ride effect, sometimes noticed mainly while driving.', medium: 'The rise causes significant bounce or vibration and some speed reduction.', high: 'The rise causes excessive bounce or vibration and considerable speed reduction.' },
  19: { source: 'X1.23.1', context: 'The printed high-severity pit diameter has an inconsistent metric/imperial value; ask the CE before applying that cutoff.', low: 'Binder or aggregate loss has begun; early pits may appear and any oil-stained surface remains hard.', medium: 'Loss is established and the surface is moderately rough or pitted; an oil-affected surface may soften.', high: 'Loss is substantial and the surface is very rough or deeply pitted, or oil damage has loosened aggregate. Larger holes may be potholes.' },
};

export function d07GuidanceFor(edition: string | null | undefined, code: number | null | undefined) {
  return edition === 'ASTM D6433-07' && code != null ? D07_SEVERITY_GUIDANCE[code] : undefined;
}

export function d07GuidanceSnapshot(code: number, severity: SeverityCode | null): SeverityGuidanceSnapshot | null {
  const guidance = D07_SEVERITY_GUIDANCE[code];
  const text = severity ? guidance?.[severity] : guidance?.none;
  if (!guidance || !text) return null;
  return { version: D07_GUIDANCE_VERSION, status: D07_GUIDANCE_STATUS, severity, text, source: guidance.source };
}
