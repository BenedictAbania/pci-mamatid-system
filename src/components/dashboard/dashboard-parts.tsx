import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AdminButton, AdminPalette } from '@/components/admin/admin-shell';
import { layout } from '@/lib/ui/design-system';
import type { Resource } from '@/lib/data/dashboard';
import type { WorkflowState } from '@/lib/data/workflow-data';

// Dashboard text stays plain: no decorative icons beside titles, metrics or notices.
export function PanelHeader({ title, subtitle, palette, action }: { title: string; subtitle?: string; palette: AdminPalette; action?: ReactNode }) {
  return <View style={styles.panelHeader}><View style={styles.copy}>
    <Text accessibilityRole="header" aria-level={2} style={[styles.panelTitle, { color: palette.text }]}>{title}</Text>
    {subtitle ? <Text style={[styles.small, { color: palette.muted }]}>{subtitle}</Text> : null}
  </View>{action}</View>;
}
export function MetricCard({ title, subtitle, value, palette, compact = false }: { title: string; subtitle: string; value: Resource<number | string | null>; palette: AdminPalette; compact?: boolean }) {
  return <View style={[styles.metric, compact && styles.metricCompact, { backgroundColor: palette.panel, borderColor: palette.border }]}>
    <View style={styles.copy}><Text style={[styles.metricTitle, { color: palette.muted }]}>{title}</Text>
      {value.status === 'loading' ? <ActivityIndicator accessibilityLabel={`Loading ${title}`} color={palette.blue} style={styles.metricLoading} />
        : <Text style={[styles.metricValue, (value.status !== 'ready' || typeof value.data === 'string') && styles.metricStatus, { color: palette.text }]}>{value.status === 'ready' ? (value.data ?? '—') : value.status === 'error' ? 'Load failed' : 'Unavailable'}</Text>}
      <Text numberOfLines={compact ? 2 : undefined} style={[styles.small, { color: palette.muted }]}>{value.status === 'error' || value.status === 'unavailable' ? value.message : subtitle}</Text>
    </View>
  </View>;
}
export function DashboardState({ status, title, message, palette, retry }: { status: 'loading' | 'empty' | 'error' | 'unavailable'; title?: string; message: string; palette: AdminPalette; retry?: () => void }) {
  return <View accessibilityRole={status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.state}>
    {status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading dashboard data" color={palette.blue} /> : null}
    {title ? <Text style={[styles.stateTitle, { color: status === 'error' ? palette.red : palette.text }]}>{title}</Text> : null}
    <Text style={[styles.stateMessage, { color: palette.muted }]}>{message}</Text>
    {retry ? <AdminButton label="Retry dashboard" icon="refresh-cw" onPress={retry} palette={palette} tone="secondary" /> : null}
  </View>;
}
const stateLabels: Record<WorkflowState, string> = { planned: 'Planned', draft: 'Draft', submitted: 'Submitted', returned: 'Returned', approved: 'Approved', published: 'Published' };
export function StatusBadge({ state, palette }: { state: WorkflowState; palette: AdminPalette }) {
  const colors = statusColors(state, palette);
  return <View style={[styles.badge, { backgroundColor: colors.background }]}><Text style={[styles.badgeText, { color: colors.text }]}>{stateLabels[state]}</Text></View>;
}
export function statusColors(state: WorkflowState, p: AdminPalette) {
  if (state === 'returned') return { background: p.amberSoft, text: p.amber };
  if (state === 'submitted') return { background: p.blueSoft, text: p.blue };
  if (state === 'approved' || state === 'published') return { background: p.greenSoft, text: p.green };
  if (state === 'draft') return { background: p.panelAlt, text: p.text };
  return { background: p.panelAlt, text: p.muted };
}
export function WorkflowProgress({ states, palette }: { states: Record<WorkflowState, number>; palette: AdminPalette }) {
  const total = Object.values(states).reduce((sum, value) => sum + value, 0);
  return <View style={styles.progressList}>{(Object.keys(stateLabels) as WorkflowState[]).map(state => <View key={state} style={styles.progressRow}>
    <Text style={[styles.progressLabel, { color: palette.text }]}>{stateLabels[state]}</Text>
    <View aria-hidden accessibilityElementsHidden style={[styles.track, { backgroundColor: palette.panelAlt }]}><View style={[styles.fill, { width: `${total ? states[state] / total * 100 : 0}%`, backgroundColor: statusColors(state, palette).text }]} /></View>
    <Text accessibilityLabel={`${stateLabels[state]}: ${states[state]} of ${total} authorized sample units`} style={[styles.progressCount, { color: palette.text }]}>{states[state]}</Text>
  </View>)}</View>;
}
const styles = StyleSheet.create({
  copy: { flex: 1, minWidth: 0, zIndex: 1 }, panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  panelTitle: { fontSize: layout.type.panel, fontWeight: '800' }, small: { fontSize: layout.type.caption, lineHeight: 18, marginTop: 4 },
  metric: { ...layout.shadow, borderRadius: layout.radius.card, borderWidth: 1, padding: 18, flexDirection: 'row', gap: 16, minHeight: 138, overflow: 'hidden', height: '100%' },
  metricTitle: { fontSize: 13, fontWeight: '600' }, metricValue: { fontSize: layout.type.metric, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  metricCompact: { minHeight: 130, padding: 14, gap: 6 },
  metricStatus: { fontSize: 21, letterSpacing: 0, marginVertical: 8 }, metricLoading: { alignSelf: 'flex-start', minHeight: 48 },
  state: { alignItems: 'center', justifyContent: 'center', minHeight: 215, paddingVertical: 20, gap: 12 },
  stateTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' }, stateMessage: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 400 },
  badge: { borderRadius: layout.radius.badge, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' }, badgeText: { fontSize: 12, fontWeight: '700' },
  progressList: { gap: 14 }, progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, progressLabel: { fontSize: 13, width: 78 },
  progressCount: { fontSize: 13, fontWeight: '700', minWidth: 30, textAlign: 'right' }, track: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 7 },
});
