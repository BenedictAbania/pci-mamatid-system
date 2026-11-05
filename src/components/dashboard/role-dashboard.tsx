import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AdminButton, AdminPanel, AdminShell, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { canAccess, type Role } from '@/lib/auth/access';
import { formatDate } from '@/lib/utils/admin-utils';
import { getPciConditionCategory } from '@/lib/pci/pci-classification';
import { currentApprovedResults } from '@/lib/data/approved-results';
import { dashboardLayout, layout } from '@/lib/ui/design-system';
import { loadDashboardData, loadDashboardRegister, resource, type DashboardData, type RegisterPage, type Resource, type ResultSummary } from '@/lib/data/dashboard';
import { useAuth } from '@/providers/AuthProvider';
import { DashboardNotice, DashboardState, MetricCard, PanelHeader, StatusBadge, WorkflowProgress, type DashboardIcon } from './dashboard-parts';

const roleCopy = {
  admin: ['View roads, manage accounts, and check system tasks.', 'View roads', '/road-network'],
  reviewer: ['Plan sampling and review inspections waiting for your decision.', 'Review submitted inspections', '/field-inspections?status=submitted'],
  encoder: ['Start assigned inspections, finish drafts, and correct returned work.', 'Open my inspections', '/field-inspections'],
  viewer: ['Explore published pavement results and maintenance priorities.', 'Browse published results', '/pci-results'],
} as const;
const loading: DashboardData = { work: { status: 'loading' }, results: { status: 'loading' } };
function value<T>(r: Resource<T>, pick: (data: T) => number | string | null): Resource<number | string | null> {
  return r.status === 'ready' ? { status: 'ready', data: pick(r.data) } : r;
}
function MaintenancePriorityPanel({ results, palette, retry, viewer }: { results: Resource<ResultSummary>; palette: AdminPalette; retry: () => void; viewer: boolean }) {
  return <AdminPanel palette={palette}>
    <PanelHeader title="Maintenance priorities" subtitle="Current eligible section rankings" icon="alert-triangle" palette={palette} />
    {results.status !== 'ready'
      ? <DashboardState palette={palette} status={results.status} title={results.status === 'loading' ? undefined : 'Priorities unavailable'} message={results.status === 'loading' ? 'Loading eligible priorities…' : results.message} retry={results.status === 'loading' ? undefined : retry} />
      : results.data.sections.length
        ? results.data.sections.map(section => <View key={section.id} style={[styles.task, { borderColor: palette.border }]}>
            <Text style={[styles.rowTitle, { color: palette.text }]}>#{section.rank} · {section.road_snapshot?.section_name ?? 'Saved label unavailable'}</Text>
            <Text style={[styles.body, { color: palette.muted }]}>PCI {section.pci.toFixed(1)} · {section.condition}</Text>
          </View>)
        : <DashboardState palette={palette} status="empty" title="No eligible priorities yet" message={viewer
            ? 'Published section results must satisfy the current approval rules before appearing here.'
            : 'Rankings appear when validated sample calculations and an eligible section result are available.'} />}
  </AdminPanel>;
}
export function RoleDashboard() {
  const { role, user } = useAuth();
  return role && user ? <DashboardContent key={user.id + ':' + role} role={role} userId={user.id} /> : null;
}
function DashboardContent({ role, userId }: { role: Role; userId: string }) {
  const p = useAdminPalette(), router = useRouter(), { width } = useWindowDimensions(), copy = roleCopy[role];
  const responsive = dashboardLayout(width);
  const [data, setData] = useState<DashboardData>(loading);
  const [register, setRegister] = useState<Resource<RegisterPage>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const requests = useRef({ summary: 0, register: 0 });
  const go = (route: string) => { if (canAccess(role, route.split('?')[0])) router.push(route as never); };
  const loadRegister = useCallback(async (after: string | null) => {
    const request = ++requests.current.register; setRegister({ status: 'loading' });
    const next = await resource(() => loadDashboardRegister(role, userId, after));
    if (request === requests.current.register) setRegister(next);
  }, [role, userId]);
  const refresh = useCallback(async () => {
    const summaryRequest = ++requests.current.summary;
    const registerRequest = ++requests.current.register;
    setRefreshing(true);
    const [next, nextRegister] = await Promise.all([
      loadDashboardData(role, userId),
      role === 'viewer' ? Promise.resolve(null) : resource(() => loadDashboardRegister(role, userId, cursors[pageIndex] ?? null)),
    ]);
    if (summaryRequest === requests.current.summary) { setData(next); setRefreshing(false); }
    if (nextRegister && registerRequest === requests.current.register) setRegister(nextRegister);
  }, [role, userId, cursors, pageIndex]);
  useEffect(() => {
    const current = requests.current, summaryRequest = ++current.summary, registerRequest = ++current.register;
    void loadDashboardData(role, userId).then(next => { if (summaryRequest === current.summary) setData(next); });
    if (role !== 'viewer') void resource(() => loadDashboardRegister(role, userId)).then(next => { if (registerRequest === current.register) setRegister(next); });
    return () => { ++current.summary; ++current.register; };
  }, [role, userId]);
  function changePage(direction: -1 | 1) {
    if (register.status !== 'ready') return;
    const target = pageIndex + direction;
    if (target < 0 || (direction === 1 && !register.data.next)) return;
    const next = direction === 1 ? [...cursors.slice(0, target), register.data.next] : cursors;
    setCursors(next); setPageIndex(target); void loadRegister(next[target]);
  }
  const { work, results } = data;
  const primary = role === 'encoder' && work.status === 'ready' ? work.data.states.returned > 0
    ? ['Correct returned inspections', '/field-inspections?status=returned']
    : work.data.states.draft > 0 ? ['Continue draft inspections', '/field-inspections?status=draft']
      : work.data.states.planned > 0 ? ['Start assigned inspections', '/field-inspections?status=planned'] : [copy[1], copy[2]]
    : role === 'reviewer' && work.status === 'ready' && work.data.states.submitted === 0 && work.data.plansRequiringAttention > 0
      ? ['Prepare sampling plans', '/sampling?attention=unconfirmed'] : [copy[1], copy[2]];
  const metric = (title: string, subtitle: string, icon: DashboardIcon, source: Resource<number | string | null>) => ({ title, subtitle, icon, value: source });
  const metrics = role === 'encoder' ? [
    metric('Assigned inspections', 'All units assigned to you', 'clipboard', value(work, d => d.samples)),
    metric('Ready to start', 'Planned sample units', 'play', value(work, d => d.states.planned)),
    metric('Drafts', 'Continue saved work', 'edit-3', value(work, d => d.states.draft)),
    metric('Returned', 'Corrections requested', 'rotate-ccw', value(work, d => d.states.returned)),
  ] : role === 'reviewer' ? [
    metric('Plans needing attention', 'Sections without a confirmed plan', 'layers', value(work, d => d.plansRequiringAttention)),
    metric('Awaiting your review', 'Submitted and assigned to you', 'clipboard', value(work, d => d.states.submitted)),
    metric('Returned for correction', 'Your review assignments', 'rotate-ccw', value(work, d => d.states.returned)),
    metric('Review assignments', 'All units assigned for your review', 'users', value(work, d => d.samples)),
  ] : role === 'admin' ? [
    metric('Road sections', 'Full authorized inventory', 'layers', value(work, d => d.sections)),
    metric('Accounts', 'Current account records', 'users', value(work, d => d.accounts)),
    metric('Awaiting review', 'Submitted across plans', 'clipboard', value(work, d => d.states.submitted)),
    metric('Published results', 'Current approved publications', 'file-text', value(results, d => d.published)),
  ] : [
    metric('Published results', 'Current published approvals', 'file-text', value(results, d => d.published)),
    metric('Average published PCI', 'Full eligible scope; — if none', 'activity', value(results, d => d.average === null ? null : d.average.toFixed(1))),
    metric('Published snapshots', 'Includes saved published history', 'archive', value(results, d => d.history)),
    metric('Access', 'Reviewer approval and publication required', 'shield', { status: 'ready', data: 'Published only' }),
  ];
  const state = <T,>(r: Resource<T>, title: string) => r.status !== 'ready' ? <DashboardState palette={p} status={r.status} title={r.status === 'loading' ? undefined : title} message={r.status === 'loading' ? 'Loading authorized live data…' : r.message} retry={r.status === 'loading' ? undefined : () => void refresh()} /> : null;
  const tasks = work.status === 'ready' ? role === 'encoder' ? [
    [work.data.states.returned + ' returned inspections', 'Read comments and correct saved inputs.', '/field-inspections?status=returned'],
    [work.data.states.draft + ' drafts to continue', 'Finish measurements and submit when ready.', '/field-inspections?status=draft'],
    [work.data.states.planned + ' inspections ready to start', 'Open a sample unit from your assigned plan.', '/field-inspections?status=planned'],
  ] : role === 'reviewer' ? [
    [work.data.states.submitted + ' inspections awaiting your review', 'Check evidence and the next eligible decision.', '/field-inspections?status=submitted'],
    [work.data.plansRequiringAttention + ' plans needing attention', 'Review boundaries, sampling counts, and assignments.', '/sampling?attention=unconfirmed'],
  ] : [
    ['View ' + work.data.sections + ' road sections', 'Check the Civil Engineer-maintained inventory.', '/road-network'],
    ['Manage ' + work.data.accounts + ' accounts', 'Review active accounts and role assignments.', '/users'],
    ['Review system settings', 'Check catalog and workflow configuration.', '/settings'],
  ] : [];
  return <AdminShell dashboard title={role === 'viewer' ? 'Overview' : 'Home'} subtitle={copy[0]} onRefresh={() => void refresh()}>
    {refreshing && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: p.muted }]}>Updating overview…</Text>}
    <View style={styles.intro}><Text style={[styles.body, styles.lead, { color: p.muted }]}>{role === 'viewer' ? 'Published information only. Internal inspection and review records are excluded.' : 'Choose your next task. Counts cover your full authorized scope.'}</Text><AdminButton label={primary[0]} palette={p} onPress={() => go(primary[1])} /></View>
    <View style={styles.metricGrid}>{metrics.map(item => <View key={item.title} style={{ width: responsive.metricColumns === 4 ? '23.8%' : responsive.metricColumns === 2 ? '48.7%' : '100%' }}><MetricCard {...item} palette={p} compact={responsive.phone} /></View>)}</View>
    <View style={[styles.columns, !responsive.twoColumns && styles.stack]}>
      <View style={styles.column}>
        <AdminPanel palette={p}><PanelHeader title="Next actions" icon="arrow-right-circle" palette={p} />
          {role === 'viewer' ? <>{state(results, 'Published information unavailable')}{results.status === 'ready' && <Text style={[styles.body, { color: p.muted }]}>{results.data.published ? 'Open Published Results for saved snapshots, downloads, and printable reports.' : 'No current published results yet. Check Published Results again after eligible results are published.'}</Text>}<AdminButton tone="secondary" label="Open maintenance priorities" palette={p} onPress={() => go('/maintenance-plan')} /></> : <>{state(work, 'Tasks unavailable')}{tasks.map(([label, detail, route]) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={label} onPress={() => go(route)} style={[styles.task, { borderColor: p.border }]}><Text style={[styles.rowTitle, { color: p.text }]}>{label} →</Text><Text style={[styles.body, { color: p.muted }]}>{detail}</Text></Pressable>)}{work.status === 'ready' && work.data.samples === 0 ? <Text style={[styles.body, { color: p.muted }]}>{role === 'encoder' ? 'No assignments yet. Ask your Reviewer to confirm a plan and assign sample units, then refresh.' : role === 'reviewer' ? 'No review assignments yet. Open Sampling Plans to prepare or check assignments.' : 'No inspections have been planned yet. Start with the road inventory.'}</Text> : null}</>}
        </AdminPanel>
        {role !== 'viewer' && <AdminPanel palette={p}><PanelHeader title={role === 'reviewer' ? 'Submitted inspections' : role === 'encoder' ? 'Your pending work' : 'System inspection register'} subtitle={role === 'admin' ? 'Saved revisions in stable ID order' : 'Pending work within your assignments'} icon="clipboard" palette={p} />
          {state(register, 'Inspection list unavailable')}
          {register.status === 'ready' && (register.data.rows.length ? register.data.rows.map(row => <Pressable key={row.id} accessibilityRole={role === 'admin' ? undefined : 'button'} accessibilityLabel={'Open ' + row.section_name + ', sample ' + row.unit_number} disabled={role === 'admin'} onPress={() => go('/field-inspections?sample=' + row.id)} style={[styles.task, { borderColor: p.border }]}>
            <Text style={[styles.rowTitle, { color: p.text }]}>{row.section_name}</Text><Text style={[styles.body, { color: p.muted }]}>SU-{row.unit_number} · Revision {row.input_revision} · Updated {formatDate(row.updated_at)}</Text><StatusBadge state={row.workflow_state} palette={p} />
          </Pressable>) : <DashboardState palette={p} status="empty" title="No pending inspections" message={role === 'encoder' ? 'Open My Inspections to check all assignments, including submitted work.' : role === 'reviewer' ? 'Nothing is waiting for your review. Check Sampling Plans or open the review register for other states.' : 'Saved inspections appear after sampling plans are created.'} />)}
          {register.status === 'ready' && (pageIndex > 0 || register.data.next) ? <View style={styles.pagination}><AdminButton label="Previous inspections" palette={p} tone="secondary" disabled={pageIndex === 0} onPress={() => changePage(-1)} /><Text style={{ color: p.muted }}>Page {pageIndex + 1}</Text><AdminButton label="Next inspections" palette={p} tone="secondary" disabled={!register.data.next} onPress={() => changePage(1)} /></View> : null}
        </AdminPanel>}
      </View>
      <View style={styles.column}>
        {role === 'viewer' ? <>
          <AdminPanel palette={p}><PanelHeader title="Published pavement results" icon="file-text" palette={p} />{state(results, 'Results unavailable')}{results.status === 'ready' && (results.data.published ? currentApprovedResults(results.data.rows, true).map(row => <View key={row.id} style={[styles.task, { borderColor: p.border }]}><Text style={[styles.rowTitle, { color: p.text }]}>{row.report_snapshot.road.section_name} · SU-{row.report_snapshot.sample.unit_number}</Text><Text style={[styles.body, { color: p.muted }]}>PCI {row.report_snapshot.output.pci.toFixed(1)} · {row.report_snapshot.output.condition || getPciConditionCategory(row.report_snapshot.output.pci).rating}</Text><StatusBadge state="published" palette={p} /></View>) : <DashboardState palette={p} status="empty" title="No published results yet" message="Results appear after eligible calculation approval and separate publication." />)}</AdminPanel>
        </> : <>
          <AdminPanel palette={p}><PanelHeader title={role === 'admin' ? 'System overview' : 'Your inspection status'} subtitle="Latest revision; approval and publication are separate" icon="activity" palette={p} />{state(work, 'Status unavailable')}{work.status === 'ready' ? <WorkflowProgress states={work.data.states} palette={p} /> : null}</AdminPanel>
          <DashboardNotice palette={p} title="Provisional calculations">Reference calculations still require civil-engineering validation. Provisional output cannot be approved or published. Inspection inputs can be saved, submitted, and returned for correction.</DashboardNotice>
        </>}
        {role !== 'encoder' && <MaintenancePriorityPanel results={results} palette={p} retry={() => void refresh()} viewer={role === 'viewer'} />}
      </View>
    </View>
  </AdminShell>;
}
const styles = StyleSheet.create({
  intro: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }, lead: { flex: 1, minWidth: 180 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: layout.spacing.sm },
  columns: { flexDirection: 'row', gap: layout.spacing.lg, alignItems: 'flex-start' }, stack: { flexDirection: 'column', alignItems: 'stretch' },
  column: { flex: 1, minWidth: 0, gap: layout.spacing.lg }, task: { paddingVertical: 16, borderBottomWidth: 1, gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700', lineHeight: 23 }, body: { fontSize: 14, lineHeight: 22 }, pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 16 },
});
