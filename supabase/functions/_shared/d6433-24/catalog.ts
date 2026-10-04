/** D6433-24 §§1.4, 2.1.7, 9.1–9.3, Appendix X1. No curve ordinates. */
export const EDITION = 'ASTM D6433-24' as const;
export const ALGORITHM_VERSION = 'd6433-24-provisional/1';
export const PROVISIONAL_LABEL = 'Prototype / Provisional — awaiting civil-engineering validation';
export type Severity = 'low' | 'medium' | 'high';
export type Unit = 'm²' | 'm' | 'No.';
export type DistressDefinition = { code: number; name: string; unit: Unit; severities: readonly Severity[]; measurementRule: string; severityRule: string; figure: string };
const all = ['low', 'medium', 'high'] as const;
export const ASPHALT_CATALOG: readonly DistressDefinition[] = [
  { code:1, name:'Alligator Cracking', unit:'m²', severities:all, severityRule:'X1.5.1', measurementRule:'X1.5.2', figure:'X3.1' },
  { code:2, name:'Bleeding', unit:'m²', severities:all, severityRule:'X1.6.1', measurementRule:'X1.6.2', figure:'X3.2' },
  { code:3, name:'Block Cracking', unit:'m²', severities:all, severityRule:'X1.7.1', measurementRule:'X1.7.2', figure:'X3.3' },
  { code:4, name:'Bumps and Sags', unit:'m', severities:all, severityRule:'X1.8.2; X1.4.6–.7', measurementRule:'X1.8.3', figure:'X3.5' },
  { code:5, name:'Corrugation', unit:'m²', severities:all, severityRule:'X1.9.1; X1.4.6–.7', measurementRule:'X1.9.2', figure:'X3.6' },
  { code:6, name:'Depression', unit:'m²', severities:all, severityRule:'X1.10.1', measurementRule:'X1.10.2', figure:'X3.7' },
  { code:7, name:'Edge Cracking', unit:'m', severities:all, severityRule:'X1.11.1', measurementRule:'X1.11.2', figure:'X3.9' },
  { code:8, name:'Joint Reflection Cracking', unit:'m', severities:all, severityRule:'X1.12.1', measurementRule:'X1.12.2', figure:'X3.11' },
  { code:9, name:'Lane/Shoulder Drop-Off', unit:'m', severities:all, severityRule:'X1.13.1', measurementRule:'X1.13.2', figure:'X3.13' },
  { code:10, name:'Longitudinal and Transverse Cracking', unit:'m', severities:all, severityRule:'X1.14.2', measurementRule:'X1.14.3', figure:'X3.15' },
  { code:11, name:'Patching and Utility Cut Patching', unit:'m²', severities:all, severityRule:'X1.15.1', measurementRule:'X1.15.2', figure:'X3.16' },
  { code:12, name:'Polished Aggregate', unit:'m²', severities:[], severityRule:'X1.16.1', measurementRule:'X1.16.2', figure:'X3.17' },
  { code:13, name:'Potholes', unit:'No.', severities:all, severityRule:'X1.17.1', measurementRule:'X1.17.1–X1.17.2; Table X1.1', figure:'X3.19' },
  { code:14, name:'Railroad Crossing', unit:'m²', severities:all, severityRule:'X1.18.1; X1.4.6–.7', measurementRule:'X1.18.2', figure:'X3.20' },
  { code:15, name:'Rutting', unit:'m²', severities:all, severityRule:'X1.19.1', measurementRule:'X1.19.2', figure:'X3.21' },
  { code:16, name:'Shoving', unit:'m²', severities:all, severityRule:'X1.20.3; X1.4.6–.7', measurementRule:'X1.20.4', figure:'X3.22' },
  { code:17, name:'Slippage Cracking', unit:'m²', severities:all, severityRule:'X1.21.1', measurementRule:'X1.21.2', figure:'X3.23' },
  { code:18, name:'Swell', unit:'m²', severities:all, severityRule:'X1.22.1; X1.4.6–.7', measurementRule:'X1.22.2', figure:'X3.24' },
  { code:19, name:'Raveling — Dense Mix Asphalt', unit:'m²', severities:['medium','high'], severityRule:'X1.23.1', measurementRule:'X1.23.1–X1.23.2', figure:'X3.25' },
  { code:20, name:'Weathering (Surface Wear) — Dense Mix Asphalt', unit:'m²', severities:all, severityRule:'X1.24.1', measurementRule:'X1.24.1–X1.24.2', figure:'X3.26' },
];
export const RULES = {
  units:'§1.4', area:'§2.1.7', field:'§§5.1, 8.2; X1.1.1–X1.1.6',
  density:'§§9.1–9.2', dv:'§9.3; Appendix X3 (SI figures)',
  shortcut:'§9.5.1', allowable:'§9.5.3, Eq. 4', fractional:'§9.5.4',
  cdv:'§9.5.5.1–9.5.5.5; Fig. X3.27', pci:'§9.6.1',
  mixedSeverity:'§9.6.2.1–9.6.2.2', rating:'Fig. 1; §11.2',
  section:'§11.1, Eqs. 5–7', additional:'§2.1.1; §7.7',
  sampling:'§7.5.2, Eq. 1; §7.5.3, Eq. 3',
} as const;
export function definition(code: number) {
  const item = ASPHALT_CATALOG.find(d => d.code === code);
  if (!item) throw new Error('Unsupported D6433-24 asphalt distress code: '+code);
  return item;
}
export function positive(value: number, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(field+' must be positive and finite');
  return value;
}
export function validPci(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('PCI must be within 0–100');
  return value;
}
/** Fig. 1 boundaries use the better tier at an exact threshold; see validation register. */
export function condition(pci: number) {
  validPci(pci);
  return pci >=85 ? 'Good' : pci >=70 ? 'Satisfactory' : pci >=55 ? 'Fair' : pci >=40 ? 'Poor' : pci >=25 ? 'Very Poor' : pci >=10 ? 'Serious' : 'Failed';
}
export type LargePothole = { diameter_mm: number; depth_mm: number; area_sqm: number };
export type PotholeDetails = { small_count: number; large_holes: LargePothole[] };
/** X1.17.1.2: equivalent holes may be fractional. No premature integer rounding. */
export function potholeQuantity(details: PotholeDetails, severity: Severity) {
  if (!Number.isInteger(details.small_count) || details.small_count < 0 || !Array.isArray(details.large_holes)) throw new Error('Small pothole count must be a nonnegative integer');
  let quantity = details.small_count;
  for (const hole of details.large_holes) {
    if (!(positive(hole.diameter_mm,'Pothole diameter') > 750)) throw new Error('Equivalent-hole rule requires diameter >750 mm; exactly 750 mm requires engineering classification');
    positive(hole.depth_mm,'Pothole depth'); positive(hole.area_sqm,'Pothole area');
    if (severity !== (hole.depth_mm <=25 ? 'medium' : 'high')) throw new Error('Large pothole severity disagrees with X1.17.1.2');
    quantity += hole.area_sqm / 0.5;
  }
  return positive(quantity,'Equivalent pothole count');
}
