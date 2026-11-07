import { Feather } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AdminButton, AdminPalette } from '@/components/admin/admin-shell';
import { layout } from '@/lib/ui/design-system';
import type { Resource } from '@/lib/data/dashboard';
import type { WorkflowState } from '@/lib/data/workflow-data';

export type DashboardIcon = keyof typeof Feather.glyphMap;
export function IconCircle({ icon, palette, large = false }: { icon: DashboardIcon; palette: AdminPalette; large?: boolean }) {
  return <View aria-hidden accessibilityElementsHidden style={[styles.icon, large && styles.iconLarge, { backgroundColor: palette.icon }]}><Feather name={icon} size={large ? 30 : 22} color={palette.blue} /></View>;
}
export function PanelHeader({ title, subtitle, icon, palette, action }: { title: string; subtitle?: string; icon: DashboardIcon; palette: AdminPalette; action?: ReactNode }) {
  return <View style={styles.panelHeader}><IconCircle icon={icon} palette={palette} /><View style={styles.copy}>
    <Text accessibilityRole="header" aria-level={2} style={[styles.panelTitle, { color: palette.text }]}>{title}</Text>
    {subtitle ? <Text style={[styles.small, { color: palette.muted }]}>{subtitle}</Text> : null}
  </View>{action}</View>;
}
export function MetricCard({ title, subtitle, value, icon, palette, compact = false }: { title: string; subtitle: string; value: Resource<number | string | null>; icon: DashboardIcon; palette: AdminPalette; compact?: boolean }) {
  return <View style={[styles.metric, compact && styles.metricCompact, { backgroundColor: palette.panel, borderColor: palette.border }]}>
    {!compact && <IconCircle icon={icon} palette={palette} large />}
    <View style={styles.copy}><Text style={[styles.metricTitle, { color: palette.muted }]}>{title}</Text>
      {value.status === 'loading' ? <ActivityIndicator accessibilityLabel={`Loading ${title}`} color={palette.blue} style={styles.metricLoading} />
        : <Text style={[styles.metricValue, (value.status !== 'ready' || typeof value.data === 'string') && styles.metricStatus, { color: palette.text }]}>{value.status === 'ready' ? (value.data ?? '—') : value.status === 'error' ? 'Load failed' : 'Unavailable'}</Text>}
      <Text numberOfLines={compact ? 2 : undefined} style={[styles.small, { color: palette.muted }]}>{value.status === 'error' || value.status === 'unavailable' ? value.message : subtitle}</Text>
    </View>
    {!compact && <View aria-hidden accessibilityElementsHidden style={[styles.watermark, { pointerEvents: 'none' }]}><Feather name={icon} color={palette.blue} size={58} /></View>}
  </View>;
}
export function DashboardState({ status, title, message, palette, retry, icon = 'file-text' }: { status: 'loading' | 'empty' | 'error' | 'unavailable'; title?: string; message: string; palette: AdminPalette; retry?: () => void; icon?: DashboardIcon }) {
  return <View accessibilityRole={status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.state}>
    {status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading dashboard data" color={palette.blue} /> : <View aria-hidden accessibilityElementsHidden style={[styles.stateIcon, { backgroundColor: status === 'error' ? palette.redSoft : palette.panelAlt }]}><Feather color={status === 'error' ? palette.red : palette.muted} name={status === 'error' ? 'alert-circle' : icon} size={36} /></View>}
    {title ? <Text style={[styles.stateTitle, { color: palette.text }]}>{title}</Text> : null}
    <Text style={[styles.stateMessage, { color: palette.muted }]}>{message}</Text>
    {retry ? <AdminButton label="Retry dashboard" icon="refresh-cw" onPress={retry} palette={palette} tone="secondary" /> : null}
  </View>;
}
export function DashboardNotice({ title, children, palette, error = false }: { title: string; children: ReactNode; palette: AdminPalette; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: error ? palette.redSoft : palette.amberSoft, borderColor: error ? palette.red : palette.amber }]}>
    <View aria-hidden accessibilityElementsHidden style={[styles.noticeIcon, { backgroundColor: error ? palette.red : palette.amber }]}><Feather color={error ? palette.redSoft : palette.amberSoft} name="alert-circle" size={24} /></View>
    <View style={styles.copy}><Text style={[styles.noticeTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.small, { color: palette.muted }]}>{children}</Text></View>
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
  copy: { flex: 1, minWidth: 0, zIndex: 1 }, icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  iconLarge: { width: 64, height: 64, borderRadius: 32 }, panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  panelTitle: { fontSize: layout.type.panel, fontWeight: '800' }, small: { fontSize: layout.type.caption, lineHeight: 18, marginTop: 4 },
  metric: { ...layout.shadow, borderRadius: layout.radius.card, borderWidth: 1, padding: 18, flexDirection: 'row', gap: 16, minHeight: 138, overflow: 'hidden', height: '100%' },
  metricTitle: { fontSize: 13, fontWeight: '600' }, metricValue: { fontSize: layout.type.metric, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  metricCompact: { minHeight: 130, padding: 14, gap: 6 },
  metricStatus: { fontSize: 21, letterSpacing: 0, marginVertical: 8 }, metricLoading: { alignSelf: 'flex-start', minHeight: 48 },
  watermark: { opacity: 0.1, position: 'absolute', right: 12, bottom: 12 },
  state: { alignItems: 'center', justifyContent: 'center', minHeight: 215, paddingVertical: 20, gap: 12 },
  stateIcon: { borderRadius: 14, width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' }, stateMessage: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 400 },
  notice: { padding: 16, borderRadius: layout.radius.control, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  noticeIcon: { borderRadius: 22, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }, noticeTitle: { fontSize: 17, fontWeight: '800' },
  badge: { borderRadius: layout.radius.badge, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' }, badgeText: { fontSize: 12, fontWeight: '700' },
  progressList: { gap: 14 }, progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, progressLabel: { fontSize: 13, width: 78 },
  progressCount: { fontSize: 13, fontWeight: '700', minWidth: 30, textAlign: 'right' }, track: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 7 },
});
