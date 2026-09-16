export type PciCondition = 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Very Poor' | 'Failed';

export type PciConditionCategory = {
  rating: PciCondition;
  minPCI: number;
  maxPCI: number;
  range: string;
  color: string;
  darkColor: string;
  description: string;
};

/** Manuscript-authoritative ASTM D6433-07 PCI condition presentation. */
export const PCI_CONDITION_SCALE: readonly PciConditionCategory[] = [
  { rating: 'Excellent', minPCI: 85, maxPCI: 100, range: '85–100', color: '#166534', darkColor: '#4ADE80', description: 'The pavement is in excellent condition.' },
  { rating: 'Very Good', minPCI: 70, maxPCI: 84.99, range: '70–below 85', color: '#65A30D', darkColor: '#A3E635', description: 'The pavement is in very good condition.' },
  { rating: 'Good', minPCI: 55, maxPCI: 69.99, range: '55–below 70', color: '#EAB308', darkColor: '#FACC15', description: 'The pavement is in good condition with some signs of deterioration.' },
  { rating: 'Fair', minPCI: 40, maxPCI: 54.99, range: '40–below 55', color: '#F87171', darkColor: '#FCA5A5', description: 'The pavement is in fair condition and requires maintenance planning.' },
  { rating: 'Poor', minPCI: 25, maxPCI: 39.99, range: '25–below 40', color: '#DC2626', darkColor: '#F87171', description: 'The pavement is in poor condition and requires corrective attention.' },
  { rating: 'Very Poor', minPCI: 10, maxPCI: 24.99, range: '10–below 25', color: '#991B1B', darkColor: '#EF4444', description: 'The pavement is in very poor condition and needs urgent engineering review.' },
  { rating: 'Failed', minPCI: 0, maxPCI: 9.99, range: '0–below 10', color: '#374151', darkColor: '#9CA3AF', description: 'The pavement has failed and requires immediate engineering assessment.' },
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
