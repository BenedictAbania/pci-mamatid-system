/** Original, abbreviated "how to measure" and "do not confuse with" cues for the admin criteria view.
 * Checked against D6433-07 Appendix X1 (the X1.x.2 measuring paragraphs and each distress's definition).
 * Provisional prompts, not the standard's text or CE-approved rules. Keyed by ASTM distress code.
 */
export type MeasureGuidance = { measure: string; confuse: { name: string; difference: string }[] };

export const D07_MEASURE_GUIDANCE: Record<number, MeasureGuidance> = {
  1: { measure: 'Count the cracked area in m². Where severities can be told apart, record each one separately; if they cannot, rate the whole area at the highest severity. Rutting in the same area is recorded on its own.', confuse: [{ name: 'Block Cracking', difference: 'Alligator cracking forms small pieces in loaded areas such as wheel paths. Block cracking forms large rectangles in areas that carry no load.' }] },
  2: { measure: 'Count the bleeding area in m². If bleeding is counted, do not also count polished aggregate there.', confuse: [{ name: 'Polished Aggregate', difference: 'Bleeding leaves a sticky film of binder. Polished aggregate is smooth, worn stone with no binder film.' }] },
  3: { measure: 'Count the cracked area in m². It usually has one severity; if areas differ and are easy to separate, record them separately.', confuse: [{ name: 'Alligator Cracking', difference: 'Block cracking forms larger, rectangular pieces and is not caused by traffic loading.' }] },
  4: { measure: 'Measure the length in meters. If a crack comes with the bump or sag, record the crack as well.', confuse: [{ name: 'Swell', difference: 'A swell is a long, gradual rise over 3 m. Bumps and sags are small and abrupt.' }, { name: 'Shoving', difference: 'Shoves come from unstable pavement. Bumps can come from other causes, such as frost or a buckled slab.' }] },
  5: { measure: 'Count the affected area in m².', confuse: [{ name: 'Shoving', difference: 'Corrugation is a regular series of ripples. Shoving is a localized bulge of displaced pavement.' }] },
  6: { measure: 'Count the depressed area in m². Rate severity by the maximum depth.', confuse: [{ name: 'Rutting', difference: 'Ruts follow the wheel paths. Depressions are localized low spots anywhere.' }] },
  7: { measure: 'Measure the length in meters along the edge.', confuse: [{ name: 'Longitudinal and Transverse Cracking', difference: 'Edge cracks lie parallel to the pavement edge, usually within 0.3 to 0.5 m of it.' }] },
  8: { measure: 'Measure the length in meters. Record each crack length and its severity separately. If a bump forms at the crack, record it too.', confuse: [{ name: 'Longitudinal and Transverse Cracking', difference: 'Joint reflection applies only to asphalt over a concrete slab joint. Other long cracks are longitudinal or transverse.' }] },
  9: { measure: 'Measure the length in meters along the drop-off.', confuse: [{ name: 'Edge Cracking', difference: 'Drop-off is a height difference between the lane and shoulder, not a crack.' }] },
  10: { measure: 'Measure the length in meters. Record each crack and its severity. If severity changes along a crack, record each part separately.', confuse: [{ name: 'Joint Reflection Cracking', difference: 'Cracks over a concrete slab joint belong to joint reflection. Use this type for all other long cracks.' }, { name: 'Block Cracking', difference: 'Cracks that join into a block pattern are block cracking.' }] },
  11: { measure: 'Count the patch area in m². If one patch has parts of different severity, record them separately. Distress inside a patch is not counted again.', confuse: [{ name: 'Potholes', difference: 'An open hole is a pothole. A hole that has been filled is a patch.' }] },
  12: { measure: 'Count the polished area in m². If bleeding is counted, do not also count polished aggregate there.', confuse: [{ name: 'Bleeding', difference: 'Polished aggregate is smooth, worn stone. Bleeding is a sticky film of binder.' }] },
  13: { measure: 'Count the number of holes. Record low, medium and high severity separately, using both diameter and depth.', confuse: [{ name: 'Weathering and Raveling', difference: 'Holes caused by high-severity alligator cracking are potholes, not raveling.' }] },
  14: { measure: 'Count the crossing area in m². Include any large bump made by the tracks. If the crossing does not affect ride, do not count it.', confuse: [{ name: 'Bumps and Sags', difference: 'Defects around or between rails belong to the crossing, not to bumps and sags.' }] },
  15: { measure: 'Count the rutted area in m². Lay a straightedge across the rut and measure depth at points along its length. Rate severity by the mean depth.', confuse: [{ name: 'Alligator Cracking', difference: 'If cracking and rutting share an area, record each one separately.' }] },
  16: { measure: 'Count the shoved area in m². Shoving inside a patch is rated as part of the patch.', confuse: [{ name: 'Corrugation', difference: 'Shoving is a localized bulge from unstable pavement. Corrugation is a regular series of ripples.' }] },
  17: { measure: 'Count the area of each slippage crack in m². Rate it at the highest severity in that area.', confuse: [{ name: 'Longitudinal and Transverse Cracking', difference: 'Slippage cracks are crescent-shaped and come from braking or turning wheels sliding the surface.' }] },
  18: { measure: 'Count the swollen area in m².', confuse: [{ name: 'Bumps and Sags', difference: 'A swell is a long, gradual rise over 3 m. Bumps are small and abrupt.' }] },
  19: { measure: 'Count the worn area in m².', confuse: [{ name: 'Potholes', difference: 'Raveling is surface wear. A deep bowl-shaped hole from broken-up pavement is a pothole.' }] },
};

export function d07MeasureFor(edition: string | null | undefined, code: number | null | undefined) {
  return edition === 'ASTM D6433-07' && code != null ? D07_MEASURE_GUIDANCE[code] : undefined;
}
