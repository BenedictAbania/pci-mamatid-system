export type PciCondition = 'Good' | 'Satisfactory' | 'Fair' | 'Poor' | 'Very Poor' | 'Serious' | 'Failed';

export type PciConditionCategory = {
  rating: PciCondition;
  minPCI: number;
  maxPCI: number;
  range: string;
  /** Solid light-mode accent used for charts, gauges, and score markers. */
  color: string;
  /** Light-mode surface used for condition badges and highlighted rows. */
  softColor: string;
  /** Accessible foreground for the solid light-mode accent. */
  foregroundColor: string;
  /** Brighter solid accent used on dark application surfaces. */
  darkColor: string;
  /** Accessible foreground for the dark-mode accent. */
  darkForegroundColor: string;
  description: string;
};

export type PciConditionVisual = {
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
  foregroundColor: string;
};

/** ASTM D6433-24 Fig. 1 labels; exact thresholds use the better tier (provisional policy). Colors are application presentation, not normative ASTM colors. */
export const PCI_CONDITION_SCALE: readonly PciConditionCategory[] = [
  { rating: 'Good', minPCI: 85, maxPCI: 100, range: '85–100', color: '#166534', softColor: '#DCFCE7', foregroundColor: '#FFFFFF', darkColor: '#4ADE80', darkForegroundColor: '#052E16', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Satisfactory', minPCI: 70, maxPCI: 84.99, range: '70–below 85', color: '#15803D', softColor: '#DCFCE7', foregroundColor: '#FFFFFF', darkColor: '#86EFAC', darkForegroundColor: '#052E16', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Fair', minPCI: 55, maxPCI: 69.99, range: '55–below 70', color: '#65A30D', softColor: '#ECFCCB', foregroundColor: '#1A2E05', darkColor: '#BEF264', darkForegroundColor: '#1A2E05', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Poor', minPCI: 40, maxPCI: 54.99, range: '40–below 55', color: '#CA8A04', softColor: '#FEF9C3', foregroundColor: '#422006', darkColor: '#FDE047', darkForegroundColor: '#422006', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Very Poor', minPCI: 25, maxPCI: 39.99, range: '25–below 40', color: '#EA580C', softColor: '#FFEDD5', foregroundColor: '#431407', darkColor: '#FB923C', darkForegroundColor: '#431407', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Serious', minPCI: 10, maxPCI: 24.99, range: '10–below 25', color: '#DC2626', softColor: '#FEE2E2', foregroundColor: '#FFFFFF', darkColor: '#F87171', darkForegroundColor: '#450A0A', description: 'Provisional pavement condition; engineering assessment required.' },
  { rating: 'Failed', minPCI: 0, maxPCI: 9.99, range: '0–below 10', color: '#7F1D1D', softColor: '#FECACA', foregroundColor: '#FFFFFF', darkColor: '#FCA5A5', darkForegroundColor: '#450A0A', description: 'Provisional pavement condition; engineering assessment required.' },
] as const;

export function clampPci(pci: number) {
  if (!Number.isFinite(pci)) throw new RangeError('PCI must be a finite number.');
  return Math.max(0, Math.min(100, pci));
}

export function getPciCondition(pci: number): PciCondition {
  const value = clampPci(pci);
  if (value >= 85) return 'Good';
  if (value >= 70) return 'Satisfactory';
  if (value >= 55) return 'Fair';
  if (value >= 40) return 'Poor';
  if (value >= 25) return 'Very Poor';
  if (value >= 10) return 'Serious';
  return 'Failed';
}

export function getPciConditionCategory(pci: number): PciConditionCategory {
  const condition = getPciCondition(pci);
  return PCI_CONDITION_SCALE.find((category) => category.rating === condition)!;
}

/** Resolves accessible condition colors without duplicating palettes in screens. */
export function getPciConditionVisual(category: PciConditionCategory, isDark: boolean): PciConditionVisual {
  return isDark
    ? {
        accentColor: category.darkColor,
        backgroundColor: category.darkColor,
        borderColor: category.darkColor,
        foregroundColor: category.darkForegroundColor,
      }
    : {
        accentColor: category.color,
        backgroundColor: category.softColor,
        borderColor: category.color,
        foregroundColor: category.color,
      };
}
