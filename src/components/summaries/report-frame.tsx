import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { AdminButton, type AdminPalette } from '@/components/admin/admin-shell';
import { brand, layout } from '@/lib/ui/design-system';
import { getPciConditionCategory, getPciConditionVisual } from '@/lib/pci/pci-classification';

export const one = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
export const two = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
export const area = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';

/** Navy-headed report popup with three tabs and a Close button. */
export function ReportFrame<T extends string>({ palette: p, title, tabs, tab, onTab, onClose, visible = true, children }: {
  palette: AdminPalette; title: string; tabs: readonly { value: T; label: string }[]; tab: T; onTab: (tab: T) => void;
  onClose: () => void; visible?: boolean; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: layout.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <View accessibilityViewIsModal accessibilityLabel={title} style={{ width: '100%', maxWidth: 820, maxHeight: '92%', backgroundColor: p.panel, borderRadius: 16, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: brand.navy, paddingVertical: 14, paddingHorizontal: 20 }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', flexShrink: 1 }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={{ padding: 4 }}><Feather name="x" size={28} color="#FFFFFF" /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View accessibilityRole="tablist" accessibilityLabel={`${title} sections`} style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {tabs.map(t => <Pressable key={t.value} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.value }} aria-selected={tab === t.value} onPress={() => onTab(t.value)}
              style={{ flexGrow: 1, flexBasis: 150, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: tab === t.value ? brand.navy : p.border, backgroundColor: tab === t.value ? brand.navy : p.panelAlt }}>
              <Text style={{ color: tab === t.value ? '#FFFFFF' : p.text, fontSize: 18, fontWeight: tab === t.value ? '700' : '500' }}>{t.label}</Text>
            </Pressable>)}
          </View>
          {children}
          <View style={{ alignItems: 'flex-end' }}><AdminButton palette={p} tone="secondary" icon="x" label="Close" onPress={onClose} /></View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

export function ReportCard({ palette: p, children, style }: { palette: AdminPalette; children: ReactNode; style?: object }) {
  return <View style={[{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panelAlt, padding: 16, gap: 4 }, style]}>{children}</View>;
}

export function InfoRows({ palette: p, rows }: { palette: AdminPalette; rows: [string, string][] }) {
  return <>{rows.map(([label, value]) => <View key={label} accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: 'row', gap: 12, paddingVertical: 3 }}>
    <Text style={{ color: p.text, fontSize: 16, flex: 1 }}>{label}</Text>
    <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{value}</Text>
  </View>)}</>;
}

/** Big PCI value with its condition pill, coloured by the condition scale. */
export function ScoreCard({ palette: p, label, pci, dark, tinted = false, suffix = ' Condition' }: { palette: AdminPalette; label: string; pci: number; dark: boolean; tinted?: boolean; suffix?: string }) {
  const category = getPciConditionCategory(Number(pci));
  const visual = getPciConditionVisual(category, dark);
  return <ReportCard palette={p} style={{ flex: 1, minWidth: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: tinted ? visual.backgroundColor + (dark ? '33' : '55') : p.panelAlt }}>
    <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>{label}</Text>
    <Text accessibilityLabel={`${label} ${one(Number(pci))}`} style={{ color: visual.accentColor, fontSize: 44, fontWeight: '800', marginVertical: 4 }}>{one(Number(pci))}</Text>
    <View style={{ backgroundColor: visual.backgroundColor, borderColor: visual.borderColor, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18 }}>
      <Text style={{ color: visual.foregroundColor, fontSize: 18, fontWeight: '700' }}>{category.rating}{suffix}</Text>
    </View>
  </ReportCard>;
}

export function ConditionPill({ pci, dark }: { pci: number; dark: boolean }) {
  const category = getPciConditionCategory(Number(pci));
  const visual = getPciConditionVisual(category, dark);
  return <View style={{ backgroundColor: visual.backgroundColor, borderColor: visual.borderColor, borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 }}>
    <Text style={{ color: visual.foregroundColor, fontWeight: '700' }}>{category.rating}</Text>
  </View>;
}
