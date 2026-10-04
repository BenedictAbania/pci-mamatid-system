import { Text, View } from 'react-native';
import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';

export function PageControls({ page, hasNext, busy, next, previous, label = "Records" }: { label?: string; page: number; hasNext: boolean; busy: boolean; next: () => void; previous: () => void }) {
  const palette = useAdminPalette();
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginVertical: 14 }}>
    <AdminButton palette={palette} tone="secondary" label="Previous page" disabled={busy || page <= 1} onPress={previous} />
    <Text style={{ color: palette.muted }}>{label} · Page {page}</Text>
    <AdminButton palette={palette} tone="secondary" label="Next page" disabled={busy || !hasNext} onPress={next} />
  </View>;
}
