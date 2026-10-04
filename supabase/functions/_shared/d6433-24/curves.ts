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
/** Caller verifies content hash. This validates completeness/axes, not engineering truth. */
export function privateCurveReader(pack: CurvePackage, digest: string): CurveReader {
  if (!pack || pack.edition !== EDITION || pack.usage !== 'private-server' || !pack.id?.trim() || !pack.permission_record?.trim() || !pack.reviewed_by?.trim() || !pack.interpolation_review?.trim()
    || !/^[a-f0-9]{64}$/.test(pack.source_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(digest)) throw new ReferenceUnavailable('A provenance-reviewed private D6433-24 package is required');
  const keys=new Set(ASPHALT_CATALOG.flatMap(d=>(d.severities.length ? d.severities : [null]).map(sev=>curveKey(d.code,sev))));
  if(!pack.dv || Object.keys(pack.dv).some(key=>!keys.has(key)))throw new ReferenceUnavailable('Unknown or legacy DV key in D6433-24 package');
  for (const d of ASPHALT_CATALOG) for (const sev of d.severities.length ? d.severities : [null]) checkCurve(pack.dv?.[curveKey(d.code,sev)],d.figure,'log10');
  // Fig. X3.27 supplies q=1..7 only. Do not fabricate the missing q=8..10.
  for (let q=2;q<=7;q++) checkCurve(pack.cdv?.[String(q)],'X3.27','linear');
  if (Object.keys(pack.cdv).some(q=>!['2','3','4','5','6','7'].includes(q))) throw new ReferenceUnavailable('Unsupported CDV q: Fig. X3.27 only supplies 1–7; engineering clarification required');
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
      if (q===1) return total; // Fig. X3.27 q=1 identity; final PCI may clamp at zero.
      const curve=pack.cdv[String(q)];
      if (!curve) throw new ReferenceUnavailable('No supplied CDV curve for q='+q);
      return interpolateCurve(curve,total);
    },
  };
}
