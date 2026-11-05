import { usePathname } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAdminPalette } from '@/components/admin/admin-shell';
import { loadWorkflow, type WorkflowPage, type WorkflowScope } from '@/lib/data/workflow-data';

export function useWorkflow(sampleId?: string, sectionId?: string, status?: string) {
  const pathname = usePathname();
  const { role, user } = useAuth();
  const userId = user?.id;
  const scope: WorkflowScope = pathname === '/settings' ? 'types' : ['/sampling', '/road-network'].includes(pathname) ? 'sections' : 'samples';
  const [samplePage, setSamplePage] = useState<{ status?: string; cursors: (string | null)[] }>(() => ({ status, cursors: [null] }));
  const cursors = samplePage.status === status ? samplePage.cursors : [null];
  const [referenceCursors, setReferenceCursors] = useState<(string | null)[]>([null]);
  const after = cursors[cursors.length - 1];
  const referenceAfter = referenceCursors[referenceCursors.length - 1];
  const [data, setData] = useState<WorkflowPage | null>(null);
  const [loadedSampleId, setLoadedSampleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  useEffect(() => {
    // Changing the server-side status filter starts on the first bounded page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (samplePage.status !== status) setSamplePage({ status, cursors: [null] });
  }, [samplePage.status, status]);
  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      if (role === 'viewer') throw new Error('Viewers use published reports.');
      const nextData = await loadWorkflow(scope, after, sampleId, sectionId, referenceAfter, status, userId);
      if (request === requestSequence.current) { setData(nextData); setLoadedSampleId(sampleId); setError(''); }
    } catch (reason) {
      if (request === requestSequence.current) { setData(null); setLoadedSampleId(undefined); setError(reason instanceof Error ? reason.message : 'Unable to load live data.'); }
    } finally { if (request === requestSequence.current) setLoading(false); }
  }, [scope, after, sampleId, sectionId, referenceAfter, role, status, userId]);
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
    try { await task(); await refresh(); setMessage(success); return true; }
    // Retain unsaved fields on validation/network failures. Stale-action errors
    // remain explicit; the user can refresh before retrying the decision.
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed.'); return false; }
    finally { setBusy(false); }
  }
  const scopeChanging = samplePage.status !== status;
  return { data, loadedSampleId, loading: loading || scopeChanging, scopeChanging, busy, message, error, refresh, run, setError,
    pagination: { page: cursors.length, hasNext: data?.hasNext ?? false, busy: loading || scopeChanging || busy,
      next: () => { if (data?.pageLastId) setSamplePage({ status, cursors: [...cursors, data.pageLastId] }); },
      previous: () => setSamplePage({ status, cursors: cursors.slice(0, -1) }) },
    referencesPagination: { page: referenceCursors.length, hasNext: data?.referenceHasNext ?? false, busy: loading || busy,
      next: () => { if (data?.referenceLastId) setReferenceCursors([...referenceCursors, data.referenceLastId]); },
      previous: () => setReferenceCursors(referenceCursors.slice(0, -1)) },
  };
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const p = useAdminPalette();
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 10, backgroundColor: error ? p.redSoft : p.blueSoft }}><Text selectable style={{ color: error ? p.red : p.text, lineHeight: 21 }}>{children}</Text></View>;
}
export function Choices({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; description?: string }[]; onChange: (value: string) => void }) {
  const p = useAdminPalette();
  return <View style={{ gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable accessibilityRole="radio" accessibilityLabel={option.description ? `${option.label}: ${option.description}` : option.label} accessibilityState={{ checked: option.value === value }} key={option.value} onPress={() => onChange(option.value)} style={{ padding: 12, minHeight: 44, minWidth: option.description ? 220 : undefined, flexGrow: option.description ? 1 : 0, flexBasis: option.description ? 220 : undefined, borderWidth: 1, borderRadius: 8, borderColor: p.border, backgroundColor: option.value === value ? p.action : p.panel, gap: 4 }}><Text style={{ color: option.value === value ? '#fff' : p.text, fontWeight: '700' }}>{option.label}</Text>{option.description && <Text style={{ color: option.value === value ? '#fff' : p.muted, lineHeight: 20 }}>{option.description}</Text>}</Pressable>)}</View>{!options.length && <Text style={{ color: p.muted }}>No available records.</Text>}</View>;
}

/** Native select on web; accessible scrollable choice sheet on phones. */
export function CatalogDropdown({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const p = useAdminPalette();
  const id = `lakad-catalog-${useId()}`;
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <label htmlFor={id} style={{ color: p.text, fontWeight: 700 }}>{label}</label>
    <select id={id} aria-label={label} value={value} onChange={event => onChange(event.currentTarget.value)} style={{ minHeight: 48, width: '100%', maxWidth: 520, borderWidth: 1, borderStyle: 'solid', borderColor: p.border, borderRadius: 8, background: p.panel, color: p.text, padding: 10, fontSize: 16 }}>
      <option value="">Choose a distress type</option>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
  return <View style={{ gap: 7 }}>
    <Text style={{ color: p.text, fontWeight: '700' }}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(option => option.value === value)?.label ?? 'Choose a distress type'}`} onPress={() => setOpen(true)} style={{ minHeight: 48, borderWidth: 1, borderColor: p.border, borderRadius: 8, backgroundColor: p.panel, padding: 12, justifyContent: 'center' }}>
      <Text style={{ color: value ? p.text : p.muted }}>{options.find(option => option.value === value)?.label ?? 'Choose a distress type'} ▾</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ maxHeight: '75%', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: p.panel, gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontWeight: '700', fontSize: 18 }}>{label}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">{options.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === value }} accessibilityLabel={option.label} onPress={() => { onChange(option.value); setOpen(false); }} style={{ minHeight: 48, padding: 12, borderBottomWidth: 1, borderColor: p.border }}><Text style={{ color: p.text, fontSize: 16 }}>{option.label}</Text></Pressable>)}</ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Close distress choices" onPress={() => setOpen(false)} style={{ padding: 12 }}><Text style={{ color: p.blue }}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}
