import { usePathname } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAdminPalette } from '@/components/admin/admin-shell';
import { loadWorkflow, type WorkflowPage, type WorkflowScope } from '@/lib/workflow-data';

export function useWorkflow(sampleId?: string, sectionId?: string) {
  const pathname = usePathname();
  const { role } = useAuth();
  const scope: WorkflowScope = pathname === '/settings' ? 'types' : ['/sampling', '/road-network'].includes(pathname) ? 'sections' : 'samples';
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [referenceCursors, setReferenceCursors] = useState<(string | null)[]>([null]);
  const after = cursors[cursors.length - 1];
  const referenceAfter = referenceCursors[referenceCursors.length - 1];
  const [data, setData] = useState<WorkflowPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      if (role === 'viewer') throw new Error('Viewers use published reports.');
      const nextData = await loadWorkflow(scope, after, sampleId, sectionId, referenceAfter);
      if (request === requestSequence.current) { setData(nextData); setError(''); }
    } catch (reason) {
      if (request === requestSequence.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load live data.'); }
    } finally { if (request === requestSequence.current) setLoading(false); }
  }, [scope, after, sampleId, sectionId, referenceAfter, role]);
  useEffect(() => {
    // Synchronization with a selected, bounded workspace page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++requestSequence.current; };
  }, [refresh]);
  async function run(task: () => Promise<unknown>, success = 'Saved successfully.') {
    setBusy(true); setError(''); setMessage('');
    try { await task(); await refresh(); setMessage(success); }
    catch (reason) { await refresh(); setError(reason instanceof Error ? reason.message : 'Operation failed.'); }
    finally { setBusy(false); }
  }
  return { data, loading, busy, message, error, refresh, run, setError,
    pagination: { page: cursors.length, hasNext: data?.hasNext ?? false, busy: loading || busy,
      next: () => { if (data?.pageLastId) setCursors([...cursors, data.pageLastId]); },
      previous: () => setCursors(cursors.slice(0, -1)) },
    referencesPagination: { page: referenceCursors.length, hasNext: data?.referenceHasNext ?? false, busy: loading || busy,
      next: () => { if (data?.referenceLastId) setReferenceCursors([...referenceCursors, data.referenceLastId]); },
      previous: () => setReferenceCursors(referenceCursors.slice(0, -1)) },
  };
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const p = useAdminPalette();
  return <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 10, backgroundColor: error ? p.redSoft : p.blueSoft }}><Text selectable style={{ color: error ? p.red : p.text, lineHeight: 21 }}>{children}</Text></View>;
}
export function Choices({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const p = useAdminPalette();
  return <View style={{ gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} key={option.value} onPress={() => onChange(option.value)} style={{ padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 8, borderColor: p.border, backgroundColor: option.value === value ? p.blue : p.panel }}><Text style={{ color: option.value === value ? '#fff' : p.text }}>{option.label}</Text></Pressable>)}</View>{!options.length && <Text style={{ color: p.muted }}>No available records.</Text>}</View>;
}
