import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAdminPalette } from '@/components/admin/admin-shell';
import { loadWorkflow, WorkflowData } from '@/lib/workflow-data';

export function useWorkflow() {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const nextData = await loadWorkflow();
      if (request === requestSequence.current) { setData(nextData); setError(''); }
    }
    catch (reason) {
      if (request === requestSequence.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load live data.'); }
    }
    finally { if (request === requestSequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [refresh]);
  async function run(task: () => Promise<unknown>, success = 'Saved successfully.') {
    setBusy(true); setError(''); setMessage('');
    try { await task(); await refresh(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed.'); }
    finally { setBusy(false); }
  }
  return { data, loading, busy, message, error, refresh, run, setError };
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const p = useAdminPalette();
  return <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 10, backgroundColor: error ? p.redSoft : p.blueSoft }}><Text selectable style={{ color: error ? p.red : p.text, lineHeight: 21 }}>{children}</Text></View>;
}
export function Choices({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const p = useAdminPalette();
  return <View style={{ gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} key={option.value} onPress={() => onChange(option.value)} style={{ padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 8, borderColor: p.border, backgroundColor: option.value === value ? p.blue : p.panel }}><Text style={{ color: option.value === value ? '#fff' : p.text }}>{option.label}</Text></Pressable>)}</View>{!options.length && <Text style={{ color: p.muted }}>No available records.</Text>}</View>;
}
