import { Text, View } from 'react-native';
import { AdminButton, type AdminPalette } from '@/components/admin/admin-shell';
import { PhotoCard } from '@/components/workflow/photo-card';
import type { Photo } from '@/lib/data/workflow-data';

type GroupPhoto = Pick<Photo, 'id' | 'photo_path' | 'caption'> & { distress_record_id?: string | null };
export type PhotoGroup = { key: string; title: string; recordId: string | null; photos: GroupPhoto[] };

const SEVERITY_WORDS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
/** "Alligator Cracking · High"; distresses without severity show only their name. */
export function distressLabel(name: string, severity?: string | null) {
  return severity ? `${name} · ${SEVERITY_WORDS[severity] ?? severity}` : name;
}

/**
 * One group per distress record (a type and severity in this sample unit), each with its own photos,
 * then the photos not linked to any distress as "General photos".
 */
export function photoGroups(distresses: { id: string; label: string }[], photos: GroupPhoto[]): PhotoGroup[] {
  const ids = new Set(distresses.map(d => d.id));
  const groups: PhotoGroup[] = distresses.map(d => ({ key: d.id, title: d.label, recordId: d.id, photos: photos.filter(photo => photo.distress_record_id === d.id) }));
  const general = photos.filter(photo => !photo.distress_record_id || !ids.has(photo.distress_record_id));
  if (general.length) groups.push({ key: 'general', title: 'General photos', recordId: null, photos: general });
  return groups;
}

/** Photos grouped under their distress. With `onAdd`, each distress gets an "Add photo" button. */
export function PhotoGroups({ palette: p, groups, busy = false, onAdd, onRemove, empty = 'No photos yet.' }: {
  palette: AdminPalette; groups: PhotoGroup[]; busy?: boolean;
  onAdd?: (group: PhotoGroup) => void; onRemove?: (photo: GroupPhoto) => void; empty?: string;
}) {
  if (!groups.length) return <Text style={{ color: p.muted }}>{empty}</Text>;
  return <View style={{ gap: 14 }}>
    {groups.map(group => <View key={group.key} accessibilityLabel={`${group.title}: ${group.photos.length} photo${group.photos.length === 1 ? '' : 's'}`}
      style={{ gap: 10, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{group.title} <Text style={{ color: p.muted, fontWeight: '400' }}>({group.photos.length})</Text></Text>
        {onAdd && group.recordId ? <AdminButton disabled={busy} icon="camera" label="Add photo" onPress={() => onAdd(group)} palette={p} tone="secondary" /> : null}
      </View>
      {group.photos.length
        ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {group.photos.map(photo => <PhotoCard key={photo.id} busy={busy} canRemove={!!onRemove} onRemove={onRemove ? () => onRemove(photo) : undefined} photo={photo} />)}
        </View>
        : <Text style={{ color: p.muted, fontSize: 13 }}>{onAdd ? 'No photo for this distress yet.' : 'No photo for this distress.'}</Text>}
    </View>)}
  </View>;
}
