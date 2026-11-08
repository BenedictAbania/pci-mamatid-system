import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';
import { supabase } from '@/lib/data/supabase';
import type { Photo } from '@/lib/data/workflow-data';

/** Thumbnail of a private inspection photo; tapping it opens the photo large. */
export function PhotoCard({ busy = false, canRemove = false, onRemove, photo }: { busy?: boolean; canRemove?: boolean; onRemove?: () => void; photo: Pick<Photo, 'id' | 'photo_path' | 'caption'> }) {
  const p = useAdminPalette();
  const { width, height } = useWindowDimensions();
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const caption = photo.caption || 'Pavement evidence';
  useEffect(() => {
    let live = true;
    supabase.storage.from('sample-unit-photos').createSignedUrl(photo.photo_path, 600).then(
      ({ data, error }) => { if (!live) return; if (error || !data?.signedUrl) setFailed(`Photograph could not be loaded${error ? `: ${error.message}` : '.'}`); else { setLoaded({ path: photo.photo_path, url: data.signedUrl }); setFailed(''); } },
      reason => { if (live) setFailed(reason instanceof Error ? reason.message : 'Photograph could not be loaded.'); },
    );
    return () => { live = false; };
  }, [photo.photo_path, attempt]);
  const url = loaded?.path === photo.photo_path ? loaded.url : '';

  return <View style={{ width: 220, maxWidth: '100%', gap: 8, marginBottom: 10 }}>
    {url
      ? <Pressable accessibilityHint="Opens the photo large" accessibilityLabel={`View photo: ${caption}`} accessibilityRole="button" onPress={() => setOpen(true)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: hovered ? p.blue : p.border }, pressed && { opacity: 0.85 }]}>
        <Image accessibilityLabel={caption} contentFit="cover" source={{ uri: url }} style={{ width: '100%', height: 150 }} />
      </Pressable>
      : <View style={{ height: 150, borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.panelAlt, alignItems: 'center', justifyContent: 'center', padding: 10 }}>
        <Text style={{ color: failed ? p.red : p.muted, textAlign: 'center', fontSize: 13 }}>{failed || 'Loading photo…'}</Text>
      </View>}
    <Text numberOfLines={2} style={{ color: p.text, fontSize: 13 }}>{caption}</Text>
    {(failed || (canRemove && onRemove)) ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {failed ? <AdminButton disabled={busy} palette={p} tone="secondary" label="Retry" onPress={() => { setFailed(''); setAttempt(a => a + 1); }} /> : null}
      {canRemove && onRemove ? <AdminButton disabled={busy} palette={p} tone="danger" label="Remove" onPress={onRemove} /> : null}
    </View> : null}

    {open && url ? <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible>
      <Pressable accessibilityLabel="Close photo" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(3,8,28,0.88)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: Math.min(width - 32, 1100), gap: 12 }}>
          <Image accessibilityLabel={`${caption}, enlarged`} contentFit="contain" source={{ uri: url }} style={{ width: '100%', height: Math.max(240, height - 160), borderRadius: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, flex: 1 }}>{caption}</Text>
            <AdminButton palette={p} label="Close" onPress={() => setOpen(false)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal> : null}
  </View>;
}
