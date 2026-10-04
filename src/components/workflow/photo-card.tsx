import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';
import { supabase } from '@/lib/supabase';
import type { Photo } from '@/lib/workflow-data';

export function PhotoCard({ busy = false, canRemove = false, onRemove, photo }: { busy?: boolean; canRemove?: boolean; onRemove?: () => void; photo: Photo }) {
  const p = useAdminPalette();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const { data, error: failure } = await supabase.storage.from('sample-unit-photos').createSignedUrl(photo.photo_path, 120);
      if (failure) setError(`Photograph could not be loaded: ${failure.message}`); else { setUrl(data.signedUrl); setError(''); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Photograph could not be loaded.');
    } finally { setLoading(false); }
  }
  return <View style={{ width: 240, maxWidth: '100%', gap: 8, marginBottom: 10 }}>
    {!!url && <Pressable onPress={() => void Linking.openURL(url)}><Image accessibilityLabel={photo.caption ?? 'Pavement photograph'} source={{ uri: url }} style={{ width: '100%', height: 160, borderRadius: 8 }} contentFit="cover" /></Pressable>}
    <Text style={{ color: p.text }}>{photo.caption || 'Pavement evidence'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton disabled={loading || busy} palette={p} tone="secondary" label={loading ? 'Loading photograph…' : url ? 'Refresh image access' : 'Load private photograph'} onPress={() => void open()} />{canRemove && onRemove ? <AdminButton disabled={busy} palette={p} tone="danger" label="Remove" onPress={onRemove} /> : null}</View>
    {!!error && <Text style={{ color: p.red }}>{error}</Text>}
  </View>;
}
