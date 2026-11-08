import { ASPHALT_CATALOG, EDITION, definition, positive, type Severity } from './catalog.ts';
export type Point = readonly [number, number];
export type Curve = { figure: string; x_scale: 'linear' | 'log10'; points: readonly Point[] };
export type CurvePackage = {
  edition: typeof EDITION; id: string; source_sha256: string;
  usage: 'private-server'; permission_record: string; reviewed_by: string;
  interpolation_review: string;
  dv: Record<string, Curve>; cdv: Record<string, Curve>;
};
export interface CurveReader {
  readonly id: string; readonly digest: string;
  deduct(code: number, severity: Severity | null, density: number): number;
  corrected(total: number, q: number): number;
  /** Provisional policies applied during this calculation, in plain words. */
  readonly notes?: string[];
}
export class ReferenceUnavailable extends Error {}
export function curveKey(code: number, severity: Severity | null) { return code+':'+(severity ?? 'none'); }
/** Appendix X3 axes dictate coordinates; straight segments between supplied nodes
 * are a NUMERICAL POLICY requiring validator approval, not an ASTM digitization rule. */
export function interpolateCurve(curve: Curve, x: number) {
  if (!Number.isFinite(x) || curve.points.length <2) throw new ReferenceUnavailable('Invalid curve query/data');
  const points = curve.points;
  if (x < points[0][0] || x > points[points.length-1][0]) throw new ReferenceUnavailable('Query outside supplied '+curve.figure+' domain; extrapolation is disabled');
  const transform = curve.x_scale === 'log10' ? (v: number) => Math.log10(positive(v,'Log-axis coordinate')) : (v: number) => v;
  for (let i=0;i<points.length;i++) {
    if (x === points[i][0]) return points[i][1];
    if (x < points[i][0]) {
      const [a,va]=points[i-1], [b,vb]=points[i];
      return va+(vb-va)*(transform(x)-transform(a))/(transform(b)-transform(a));
    }
  }
  return points[points.length-1][1];
}
function checkCurve(curve: Curve | undefined, figure: string, scale: Curve['x_scale']) {
  if (!curve || curve.figure !== figure || curve.x_scale !== scale || !Array.isArray(curve.points) || curve.points.length <2) throw new ReferenceUnavailable('Missing or mismatched '+figure+' '+scale+' curve');
  let previous = -Infinity;
  for (const point of curve.points) {
    if (!Array.isArray(point) || point.length !==2) throw new ReferenceUnavailable('Malformed curve point');
    const [x,y]=point;
    if (typeof x !== 'number' || !Number.isFinite(x) || x <= previous || (scale==='log10' && x <=0) || typeof y !== 'number' || !Number.isFinite(y) || y <0 || y >100) throw new ReferenceUnavailable('Invalid coordinates in '+figure);
    previous=x;
  }
}
/** Structural validation only; this does not grant permission or engineering approval. */
export function validateCurveMaps(pack: Pick<CurvePackage, 'dv' | 'cdv'>) {
  const keys=new Set(ASPHALT_CATALOG.flatMap(d=>(d.severities.length ? d.severities : [null]).map(sev=>curveKey(d.code,sev))));
  if(!pack.dv || Object.keys(pack.dv).some(key=>!keys.has(key)))throw new ReferenceUnavailable('Unknown or legacy DV key in D6433-07 package');
  for (const d of ASPHALT_CATALOG) for (const sev of d.severities.length ? d.severities : [null]) checkCurve(pack.dv?.[curveKey(d.code,sev)],d.figure,'log10');
  // D6433-07 Fig. X3.26 displays q=1..7; Fig. 6 uses q=8.
  // No missing curve is guessed or borrowed from D6433-24.
  for (let q=2;q<=7;q++) checkCurve(pack.cdv?.[String(q)],'X3.26','linear');
  if (Object.keys(pack.cdv).some(q=>!['2','3','4','5','6','7'].includes(q))) throw new ReferenceUnavailable('Unsupported CDV q: D6433-07 Fig. X3.26 only supplies 1–7; engineering clarification required');
}
/** Caller verifies content hash. This validates completeness/axes, not engineering truth. */
export function privateCurveReader(pack: CurvePackage, digest: string): CurveReader {
  if (!pack || pack.edition !== EDITION || pack.usage !== 'private-server' || !pack.id?.trim() || !pack.permission_record?.trim() || !pack.reviewed_by?.trim() || !pack.interpolation_review?.trim()
    || !/^[a-f0-9]{64}$/.test(pack.source_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(digest)) throw new ReferenceUnavailable('A provenance-reviewed private D6433-07 package is required');
  validateCurveMaps(pack);
  return {
    id:pack.id,digest,
    deduct(code,severity,density) {
      const d=definition(code); positive(density,'Density');
      const curve=pack.dv[curveKey(code,severity)];
      if (!curve || (severity===null ? d.severities.length>0 : !d.severities.includes(severity))) throw new ReferenceUnavailable('Missing distress/severity reference');
      return interpolateCurve(curve,density);
    },
    corrected(total,q) {
      if (!Number.isFinite(total) || total <0 || !Number.isInteger(q) || q <1 || q >10) throw new ReferenceUnavailable('Invalid CDV query');
      if (q===1) return total; // Provisional q=1 identity; engineering review required.
      const curve=pack.cdv[String(q)];
      if (!curve) throw new ReferenceUnavailable('No supplied CDV curve for q='+q);
      return interpolateCurve(curve,total);
    },
  };
}

/**
 * PROVISIONAL reader for an unreviewed curve trace, so the workflow can run before
 * engineering validation. Every policy below is recorded in `notes` and saved with the
 * output. A Civil Engineer must review these policies before any result is approved.
 * - A density or TDV outside the traced range is held at the nearest traced point.
 * - A TDV below the first traced CDV point is scaled in proportion to that point (CDV <= TDV).
 * - q >= 8 has no curve in Fig. X3.26, so the q = 7 curve is used.
 */
export function provisionalCurveReader(pack: Pick<CurvePackage, 'edition' | 'id' | 'usage' | 'dv' | 'cdv'>, digest: string): CurveReader & { readonly notes: string[] } {
  if (!pack || pack.edition !== EDITION || pack.usage !== 'private-server' || !pack.id?.trim() || !/^[a-f0-9]{64}$/.test(digest)) throw new ReferenceUnavailable('A private D6433-07 curve package is required');
  validateCurveMaps(pack);
  const notes: string[] = [];
  const note = (text: string) => { if (!notes.includes(text)) notes.push(text); };
  const round = (value: number) => String(Math.round(value * 1000) / 1000);
  function held(curve: Curve, x: number, label: string) {
    const first = curve.points[0], last = curve.points[curve.points.length - 1];
    if (x < first[0]) { note(`${label} ${round(x)} is below the traced range (from ${round(first[0])}); the first traced value was used.`); return first[1]; }
    if (x > last[0]) { note(`${label} ${round(x)} is above the traced range (to ${round(last[0])}); the last traced value was used.`); return last[1]; }
    return interpolateCurve(curve, x);
  }
  return {
    id: pack.id, digest, notes,
    deduct(code, severity, density) {
      const d = definition(code); positive(density, 'Density');
      const curve = pack.dv[curveKey(code, severity)];
      if (!curve || (severity === null ? d.severities.length > 0 : !d.severities.includes(severity))) throw new ReferenceUnavailable('Missing distress/severity reference');
      return held(curve, density, `${d.name}${severity ? ` (${severity})` : ''} density %`);
    },
    corrected(total, q) {
      if (!Number.isFinite(total) || total < 0 || !Number.isInteger(q) || q < 1 || q > 10) throw new ReferenceUnavailable('Invalid CDV query');
      if (q === 1) return total;
      const used = Math.min(q, 7);
      if (q > 7) note(`q = ${q} has no curve in Fig. X3.26; the q = 7 curve was used.`);
      const curve = pack.cdv[String(used)];
      const [firstTdv, firstCdv] = curve.points[0];
      if (total < firstTdv) {
        note(`CDV (q = ${used}): TDV ${round(total)} is below the traced range (from ${round(firstTdv)}); CDV was scaled in proportion to the first traced point.`);
        return total * firstCdv / firstTdv;
      }
      return Math.min(total, held(curve, total, `CDV (q = ${used}) TDV`));
    },
  };
}
