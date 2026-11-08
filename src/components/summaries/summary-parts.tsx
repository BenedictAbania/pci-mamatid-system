import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AdminButton, type AdminPalette } from '@/components/admin/admin-shell';
import { CatalogDropdown } from '@/components/workflow/shared';
import { brand } from '@/lib/ui/design-system';
import { PCI_CONDITION_SCALE } from '@/lib/pci/pci-classification';

export const CONDITION_OPTIONS = PCI_CONDITION_SCALE.map(c => ({ value: c.rating, label: c.rating }));
export type Column = { label: string; flex: number; align?: 'left' | 'center' };

export function FilterSelect({ label, value, options, placeholder, onChange }: { label: string; value: string; options: { value: string; label: string }[]; placeholder: string; onChange: (value: string) => void }) {
  return <View style={{ flexGrow: 1, flexBasis: 160, maxWidth: 220 }}>
    <CatalogDropdown label={label} value={value} options={options} placeholder={placeholder} onChange={onChange} />
  </View>;
}

export function FilterBar({ palette: p, children, onApply, onClear, busy }: { palette: AdminPalette; children: ReactNode; onApply: () => void; onClear: () => void; busy: boolean }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
    {children}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <AdminButton palette={p} icon="filter" label="Apply" disabled={busy} onPress={onApply} />
      <AdminButton palette={p} tone="secondary" icon="refresh-cw" label="Clear" disabled={busy} onPress={onClear} />
    </View>
  </View>;
}

/** Navy-headed results table; scrolls sideways on narrow screens. */
export function SummaryTable({ palette: p, title, icon, columns, label, children, footer, aside }: { palette: AdminPalette; title: string; icon: keyof typeof Feather.glyphMap; columns: Column[]; label: string; children: ReactNode; footer?: ReactNode; aside?: string }) {
  return <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 6, backgroundColor: p.panel, padding: 20, gap: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Feather name={icon} size={24} color={p.blue} />
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 22, fontWeight: '700', flex: 1 }}>{title}</Text>
      {!!aside && <Text style={{ color: p.text, fontSize: 16 }}>{aside}</Text>}
    </View>
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View accessibilityLabel={label} style={{ minWidth: 720, flex: 1 }}>
        <View style={{ flexDirection: 'row', backgroundColor: brand.navy, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
          {columns.map(c => <Text key={c.label} style={{ flex: c.flex, color: '#FFFFFF', fontWeight: '700', fontSize: 16, textAlign: c.align ?? 'left' }}>{c.label}</Text>)}
        </View>
        {children}
      </View>
    </ScrollView>
    {footer}
  </View>;
}

export function SummaryRow({ palette: p, columns, cells, label, onView, selected }: { palette: AdminPalette; columns: Column[]; cells: string[]; label: string; onView: () => void; selected: boolean }) {
  return <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: selected ? p.blueSoft : 'transparent', borderRadius: 6 }}>
    {cells.map((cell, i) => <Text key={i} style={{ flex: columns[i].flex, color: p.text, fontSize: 16, textAlign: columns[i].align ?? 'left' }}>{cell}</Text>)}
    <View style={{ flex: columns[cells.length].flex, alignItems: columns[cells.length].align === 'center' ? 'center' : 'flex-start' }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${label}`} onPress={onView}>
        <Text style={{ color: p.blue, fontSize: 16, fontWeight: '700', textDecorationLine: 'underline' }}>View</Text>
      </Pressable>
    </View>
  </View>;
}

export function SummaryFooter({ palette: p, shown, total, expanded, onToggle }: { palette: AdminPalette; shown: number; total: number; expanded: boolean; onToggle: () => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: p.text, fontSize: 15 }}>Showing {shown} of {total} results</Text>
    {total > shown || expanded ? <Pressable accessibilityRole="link" accessibilityLabel={expanded ? 'Show fewer results' : 'View all results'} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: p.blue, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' }}>{expanded ? 'Show fewer' : 'View all'}</Text>
      <Feather name={expanded ? 'arrow-up' : 'arrow-right'} size={20} color={p.text} />
    </Pressable> : null}
  </View>;
}
