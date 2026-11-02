import { Feather } from '@expo/vector-icons';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';
import { layout } from '@/lib/design-system';

export type PageControlsProps = { label?: string; page: number; hasNext: boolean; busy: boolean; next: () => void; previous: () => void };

export function PageControls({ page, hasNext, busy, next, previous, label = 'Records' }: PageControlsProps) {
  const palette = useAdminPalette();
  const { width } = useWindowDimensions();
  if (page <= 1 && !hasNext) return null;
  if (width < layout.phone) return <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
    <Pressable accessibilityLabel="Previous page" accessibilityHint={`Previous ${label.toLowerCase()} page`} accessibilityRole="button" accessibilityState={{ disabled: busy || page <= 1 }} disabled={busy || page <= 1} onPress={previous} style={{ alignItems: 'center', borderColor: palette.border, borderRadius: 9, borderWidth: 1, height: 44, justifyContent: 'center', opacity: busy || page <= 1 ? 0.45 : 1, width: 44 }}><Feather color={palette.blue} name="chevron-left" size={21} /></Pressable>
    <Text numberOfLines={1} style={{ color: palette.muted, flexShrink: 1, fontSize: 12 }}>{label} · Page {page}</Text>
    <Pressable accessibilityLabel="Next page" accessibilityHint={`Next ${label.toLowerCase()} page`} accessibilityRole="button" accessibilityState={{ disabled: busy || !hasNext }} disabled={busy || !hasNext} onPress={next} style={{ alignItems: 'center', borderColor: palette.border, borderRadius: 9, borderWidth: 1, height: 44, justifyContent: 'center', opacity: busy || !hasNext ? 0.45 : 1, width: 44 }}><Feather color={palette.blue} name="chevron-right" size={21} /></Pressable>
  </View>;
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginVertical: 14 }}>
    <AdminButton palette={palette} tone="secondary" label="Previous page" disabled={busy || page <= 1} onPress={previous} />
    <Text style={{ color: palette.muted }}>{label} · Page {page}</Text>
    <AdminButton palette={palette} tone="secondary" label="Next page" disabled={busy || !hasNext} onPress={next} />
  </View>;
}
