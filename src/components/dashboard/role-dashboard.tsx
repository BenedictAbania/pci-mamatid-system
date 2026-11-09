import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AdminButton, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { canAccess, type Role } from '@/lib/auth/access';
import { getPciConditionCategory } from '@/lib/pci/pci-classification';
import { currentApprovedResults } from '@/lib/data/approved-results';
import { dashboardLayout, layout } from '@/lib/ui/design-system';
import { loadDashboardData, type DashboardData, type Resource, type WorkSummary } from '@/lib/data/dashboard';
import { useAuth } from '@/providers/AuthProvider';
import { DashboardState, MetricCard, PanelHeader, StatusBadge, WorkflowProgress } from './dashboard-parts';

const roleCopy = {
  admin: ['Manage user accounts and the reference data inspectors use.', 'Manage user accounts', '/users'],
  reviewer: ['Plan sampling and review inspections waiting for your decision.', 'Review submitted inspections', '/field-inspections?status=submitted'],
  encoder: ['Start assigned inspections, finish drafts, and correct returned work.', 'Open my inspections', '/field-inspections'],
  viewer: ['Explore published pavement results and maintenance priorities.', 'Browse sample unit results', '/sample-summaries'],
} as const;
const loading: DashboardData = { work: { status: 'loading' }, results: { status: 'loading' } };
function value<T>(r: Resource<T>, pick: (data: T) => number | string | null): Resource<number | string | null> {
  return r.status === 'ready' ? { status: 'ready', data: pick(r.data) } : r;
}
export function RoleDashboard() {
  const { role, user } = useAuth();
  if (!role || !user) return null;
  return role === 'admin' ? <AdminDashboard key={user.id} userId={user.id} /> : <DashboardContent key={user.id + ':' + role} role={role} userId={user.id} />;
}

const roleOrder: Role[] = ['admin', 'reviewer', 'encoder', 'viewer'];
const roleNames: Record<Role, string> = { admin: 'Admin', reviewer: 'Reviewer', encoder: 'Encoder', viewer: 'Viewer' };

/** Admin home: four system totals and active users by role. Kept simple on purpose. */
function AdminDashboard({ userId }: { userId: string }) {
  const p = useAdminPalette(), { width } = useWindowDimensions(), responsive = dashboardLayout(width);
  const [work, setWork] = useState<Resource<WorkSummary>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async (initial = false) => {
    const current = ++request.current;
    if (!initial) setRefreshing(true);
    const next = await loadDashboardData('admin', userId);
    if (current === request.current) { setWork(next.work); setRefreshing(false); }
  }, [userId]);
  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(true);
    const current = request;
    return () => { ++current.current; };
  }, [refresh]);

  const stats: [string, (d: WorkSummary) => number | null][] = [
    ['Active Accounts', d => d.activeAccounts],
    ['Road Sections', d => d.sections],
    ['Approved Inspections', d => d.states.approved + d.states.published],
    ['Awaiting Review', d => d.states.submitted],
  ];
  const cardWidth = responsive.metricColumns === 4 ? '23.8%' : responsive.metricColumns === 2 ? '48.7%' : '100%';
  const roleCounts = work.status === 'ready' ? work.data.roles : null;
  const most = roleCounts ? Math.max(1, ...roleOrder.map(r => roleCounts[r])) : 1;

  return <AdminShell dashboard title="Dashboard" subtitle="LAKAD at a glance." onRefresh={() => void refresh()}>
    {refreshing && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: p.muted }]}>Updating overview…</Text>}
    {work.status === 'error' || work.status === 'unavailable'
      ? <AdminPanel palette={p}><DashboardState palette={p} status={work.status} title="Totals unavailable" message={work.message} retry={() => void refresh()} /></AdminPanel>
      : <>
        <View style={styles.metricGrid}>
          {stats.map(([label, pick]) => <View key={label} style={[styles.stat, { width: cardWidth, backgroundColor: p.panel, borderColor: p.border }]}>
            <Text style={[styles.statLabel, { color: p.text }]}>{label}</Text>
            {work.status === 'ready'
              ? <Text accessibilityLabel={`${label}: ${pick(work.data) ?? 'not available'}`} style={[styles.statValue, { color: p.text }]}>{pick(work.data) ?? '—'}</Text>
              : <ActivityIndicator accessibilityLabel={`Loading ${label}`} color={p.blue} style={styles.statLoading} />}
          </View>)}
        </View>
        <AdminPanel palette={p} style={[styles.rolePanel, responsive.phone && styles.rolePanelFull]}>
          <Text accessibilityRole="header" aria-level={2} style={[styles.roleTitle, { color: p.text }]}>Users by Role</Text>
          {roleCounts ? roleOrder.map(r => <View key={r} style={styles.roleRow}>
            <Text style={[styles.roleName, { color: p.text }]}>{roleNames[r]}</Text>
            <View aria-hidden accessibilityElementsHidden style={[styles.roleTrack, { backgroundColor: p.panelAlt }]}>
              <View style={[styles.roleFill, { width: `${roleCounts[r] / most * 100}%`, backgroundColor: p.blue }]} />
            </View>
            <Text accessibilityLabel={`${roleNames[r]}: ${roleCounts[r]} active accounts`} style={[styles.roleCount, { color: p.text }]}>{roleCounts[r]}</Text>
          </View>) : <ActivityIndicator accessibilityLabel="Loading users by role" color={p.blue} style={styles.statLoading} />}
        </AdminPanel>
      </>}
  </AdminShell>;
}
function DashboardContent({ role, userId }: { role: Role; userId: string }) {
  const p = useAdminPalette(), router = useRouter(), { width } = useWindowDimensions(), copy = roleCopy[role];
  const responsive = dashboardLayout(width);
  const [data, setData] = useState<DashboardData>(loading);
  const [refreshing, setRefreshing] = useState(false);
  const requests = useRef(0);
  const go = (route: string) => { if (canAccess(role, route.split('?')[0])) router.push(route as never); };
  const refresh = useCallback(async () => {
    const request = ++requests.current;
    setRefreshing(true);
    const next = await loadDashboardData(role, userId);
    if (request === requests.current) { setData(next); setRefreshing(false); }
  }, [role, userId]);
  useEffect(() => {
    const current = requests, request = ++current.current;
    void loadDashboardData(role, userId).then(next => { if (request === current.current) setData(next); });
    return () => { ++current.current; };
  }, [role, userId]);
  const { work, results } = data;
  const primary = role === 'encoder' && work.status === 'ready' ? work.data.states.returned > 0
    ? ['Correct returned inspections', '/field-inspections?status=returned']
    : work.data.states.draft > 0 ? ['Continue draft inspections', '/field-inspections?status=draft']
      : work.data.states.planned > 0 ? ['Start assigned inspections', '/field-inspections?status=planned'] : [copy[1], copy[2]]
    : role === 'reviewer' && work.status === 'ready' && work.data.states.submitted === 0 && work.data.plansRequiringAttention > 0
      ? ['Prepare sampling plans', '/sampling?attention=unconfirmed'] : [copy[1], copy[2]];
  const metric = (title: string, subtitle: string, source: Resource<number | string | null>) => ({ title, subtitle, value: source });
  const metrics = role === 'encoder' ? [
    metric('Assigned inspections', 'All units assigned to you', value(work, d => d.samples)),
    metric('Ready to start', 'Planned sample units', value(work, d => d.states.planned)),
    metric('Drafts', 'Continue saved work', value(work, d => d.states.draft)),
    metric('Returned', 'Corrections requested', value(work, d => d.states.returned)),
  ] : role === 'reviewer' ? [
    metric('Plans needing attention', 'Sections without a confirmed plan', value(work, d => d.plansRequiringAttention)),
    metric('Awaiting your review', 'Submitted and assigned to you', value(work, d => d.states.submitted)),
    metric('Returned for correction', 'Your review assignments', value(work, d => d.states.returned)),
    metric('Review assignments', 'All units assigned for your review', value(work, d => d.samples)),
  ] : [
    metric('Published results', 'Sample units with a published PCI', value(results, d => d.published)),
    metric('Average published PCI', 'Across published sample units; — if none', value(results, d => d.average === null ? null : d.average.toFixed(2))),
  ];
  // Cards share the row evenly, whatever their number.
  const columns = Math.min(responsive.metricColumns, metrics.length);
  const metricWidth = columns === 1 ? '100%' : `${(100 - (columns - 1) * 1.6) / columns}%`;
  const state = <T,>(r: Resource<T>, title: string) => r.status !== 'ready' ? <DashboardState palette={p} status={r.status} title={r.status === 'loading' ? undefined : title} message={r.status === 'loading' ? 'Loading authorized live data…' : r.message} retry={r.status === 'loading' ? undefined : () => void refresh()} /> : null;
  return <AdminShell dashboard title="Dashboard" subtitle={copy[0]} onRefresh={() => void refresh()}>
    {refreshing && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: p.muted }]}>Updating overview…</Text>}
    <View style={styles.intro}><Text style={[styles.body, styles.lead, { color: p.muted }]}>{role === 'viewer' ? 'Published information only. Internal inspection and review records are excluded.' : 'Choose your next task. Counts cover your full authorized scope.'}</Text><AdminButton label={primary[0]} palette={p} onPress={() => go(primary[1])} /></View>
    <View style={styles.metricGrid}>{metrics.map(item => <View key={item.title} style={{ width: metricWidth as `${number}%` }}><MetricCard {...item} palette={p} compact={responsive.phone} /></View>)}</View>
    {role === 'viewer'
      ? <AdminPanel palette={p}><PanelHeader title="Published pavement results" palette={p} />{state(results, 'Results unavailable')}{results.status === 'ready' && (results.data.published ? currentApprovedResults(results.data.rows, true).map(row => <View key={row.id} style={[styles.task, { borderColor: p.border }]}><Text style={[styles.rowTitle, { color: p.text }]}>{row.report_snapshot.road.section_name} · SU-{row.report_snapshot.sample.unit_number}</Text><Text style={[styles.body, { color: p.muted }]}>PCI {row.report_snapshot.output.pci.toFixed(2)} · {row.report_snapshot.output.condition || getPciConditionCategory(row.report_snapshot.output.pci).rating}</Text><StatusBadge state="published" palette={p} /></View>) : <DashboardState palette={p} status="empty" title="No published results yet" message="Results appear after eligible calculation approval and separate publication." />)}</AdminPanel>
      : <AdminPanel palette={p}><PanelHeader title="Your inspection status" subtitle="Latest revision; approval and publication are separate" palette={p} />{state(work, 'Status unavailable')}{work.status === 'ready' ? <WorkflowProgress states={work.data.states} palette={p} /> : null}</AdminPanel>}
  </AdminShell>;
}
const styles = StyleSheet.create({
  intro: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }, lead: { flex: 1, minWidth: 180 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: layout.spacing.sm },
  task: { paddingVertical: 16, borderBottomWidth: 1, gap: 8 },
  stat: { ...layout.shadow, borderRadius: layout.radius.card, borderWidth: 1, gap: 6, minHeight: 112, paddingHorizontal: 20, paddingVertical: 18 },
  statLabel: { fontSize: 16 }, statValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1, lineHeight: 46 }, statLoading: { alignSelf: 'flex-start', minHeight: 46 },
  rolePanel: { gap: 12, maxWidth: 440, width: '100%' }, rolePanelFull: { maxWidth: '100%' as const },
  roleTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  roleRow: { alignItems: 'center', flexDirection: 'row', gap: 12 }, roleName: { fontSize: 15, width: 80 },
  roleTrack: { borderRadius: 4, flex: 1, height: 8, overflow: 'hidden' }, roleFill: { borderRadius: 4, height: '100%' },
  roleCount: { fontSize: 15, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  rowTitle: { fontSize: 15, fontWeight: '700', lineHeight: 23 }, body: { fontSize: 14, lineHeight: 22 },
});
