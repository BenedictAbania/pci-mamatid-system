export type PciCondition = 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Very Poor' | 'Failed';

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

/** Manuscript-authoritative ASTM D6433-07 PCI condition presentation. */
export const PCI_CONDITION_SCALE: readonly PciConditionCategory[] = [
  { rating: 'Excellent', minPCI: 85, maxPCI: 100, range: '85–100', color: '#166534', softColor: '#DCFCE7', foregroundColor: '#FFFFFF', darkColor: '#4ADE80', darkForegroundColor: '#052E16', description: 'The pavement is in excellent condition.' },
  { rating: 'Very Good', minPCI: 70, maxPCI: 84.99, range: '70–below 85', color: '#15803D', softColor: '#DCFCE7', foregroundColor: '#FFFFFF', darkColor: '#86EFAC', darkForegroundColor: '#052E16', description: 'The pavement is in very good condition.' },
  { rating: 'Good', minPCI: 55, maxPCI: 69.99, range: '55–below 70', color: '#65A30D', softColor: '#ECFCCB', foregroundColor: '#1A2E05', darkColor: '#BEF264', darkForegroundColor: '#1A2E05', description: 'The pavement is in good condition with some signs of deterioration.' },
  { rating: 'Fair', minPCI: 40, maxPCI: 54.99, range: '40–below 55', color: '#CA8A04', softColor: '#FEF9C3', foregroundColor: '#422006', darkColor: '#FDE047', darkForegroundColor: '#422006', description: 'The pavement is in fair condition and requires maintenance planning.' },
  { rating: 'Poor', minPCI: 25, maxPCI: 39.99, range: '25–below 40', color: '#EA580C', softColor: '#FFEDD5', foregroundColor: '#431407', darkColor: '#FB923C', darkForegroundColor: '#431407', description: 'The pavement is in poor condition and requires corrective attention.' },
  { rating: 'Very Poor', minPCI: 10, maxPCI: 24.99, range: '10–below 25', color: '#DC2626', softColor: '#FEE2E2', foregroundColor: '#FFFFFF', darkColor: '#F87171', darkForegroundColor: '#450A0A', description: 'The pavement is in very poor condition and needs urgent engineering review.' },
  { rating: 'Failed', minPCI: 0, maxPCI: 9.99, range: '0–below 10', color: '#7F1D1D', softColor: '#FECACA', foregroundColor: '#FFFFFF', darkColor: '#FCA5A5', darkForegroundColor: '#450A0A', description: 'The pavement has failed and requires immediate engineering assessment.' },
] as const;

export function clampPci(pci: number) {
  if (!Number.isFinite(pci)) throw new RangeError('PCI must be a finite number.');
  return Math.max(0, Math.min(100, pci));
}

export function getPciCondition(pci: number): PciCondition {
  const value = clampPci(pci);
  if (value >= 85) return 'Excellent';
  if (value >= 70) return 'Very Good';
  if (value >= 55) return 'Good';
  if (value >= 40) return 'Fair';
  if (value >= 25) return 'Poor';
  if (value >= 10) return 'Very Poor';
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
