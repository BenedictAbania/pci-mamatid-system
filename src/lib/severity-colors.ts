export type DistressSeverity = 'Low' | 'Medium' | 'High';

export type DistressSeverityColors = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

export const DISTRESS_SEVERITY_COLORS: Readonly<Record<DistressSeverity, DistressSeverityColors>> = {
  Low: { backgroundColor: '#DCFCE7', textColor: '#166534', borderColor: '#86EFAC' },
  Medium: { backgroundColor: '#FEF3C7', textColor: '#92400E', borderColor: '#FCD34D' },
  High: { backgroundColor: '#FEE2E2', textColor: '#991B1B', borderColor: '#FCA5A5' },
};

export function normalizeDistressSeverity(severity: string | null | undefined): DistressSeverity | null {
  if (!severity) return null;
  const normalized = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
  return normalized === 'Low' || normalized === 'Medium' || normalized === 'High' ? normalized : null;
}

export function getDistressSeverityColors(severity: string): DistressSeverityColors {
  const normalized = normalizeDistressSeverity(severity);
  if (!normalized) throw new RangeError(`Unknown distress severity: ${severity}`);
  return DISTRESS_SEVERITY_COLORS[normalized];
}
