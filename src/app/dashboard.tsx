import { AdminShell } from '@/components/admin/admin-shell';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DimensionValue,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  DashboardData,
  DashboardInspection,
  loadDashboardData,
} from '@/lib/dashboard';
import { getPciCondition, PCI_CONDITION_SCALE } from '@/lib/pci-classification';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';

const emptyDashboard: DashboardData = {
  branches: [],
  sections: [],
  inspections: [],
  profiles: [],
  results: [],
};

const monthLabels = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
type Palette = ReturnType<typeof getPalette>;

function getPalette(isDark: boolean) {
  return {
    background: isDark ? '#071127' : '#F5F8FC',
    panel: isDark ? '#0D1B36' : '#FFFFFF',
    panelAlt: isDark ? '#10213F' : '#F8FAFD',
    text: isDark ? '#F4F7FF' : '#071A43',
    muted: isDark ? '#91A4C8' : '#4E668F',
    border: isDark ? '#21365C' : '#DCE5F2',
    blue: '#1769E8',
    blueSoft: isDark ? '#122D59' : '#EAF3FF',
    green: '#0A9B5B',
    greenSoft: isDark ? '#10392F' : '#EAF8F2',
    amber: '#E18A00',
    amberSoft: isDark ? '#3D2C11' : '#FFF6E7',
    red: '#D92D3E',
    redSoft: isDark ? '#40202A' : '#FFF0F2',
    input: isDark ? '#0A1730' : '#F8FAFD',
  };
}

function displayName(name: string | undefined, email: string | undefined) {
  return name?.trim() || email?.split('@')[0] || 'Administrator';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildConicGradient(
  groups: { color: string; count: number }[],
  total: number
) {
  let start = 0;
  const stops = groups.map((group) => {
    const end = start + (group.count / total) * 100;
    const stop = `${group.color} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const { profile, role, user } = useAuth();
  const { colorScheme } = useAppTheme();
  const palette = useMemo(() => getPalette(colorScheme === 'dark'), [colorScheme]);
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');

  const isNarrow = width < 980;
  const isPhone = width < 680;
  const name = displayName(profile?.full_name, user?.email);

  const fetchDashboard = useCallback(async (_isRefresh = false) => {
    setLoading(true);
    setErrorMessage('');

    try {
      setData(await loadDashboardData());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;

    let isMounted = true;
    loadDashboardData()
      .then((dashboardData) => {
        if (isMounted) setData(dashboardData);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'The dashboard could not be loaded.'
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [role]);

  const branchById = useMemo(
    () => new Map(data.branches.map((branch) => [branch.id, branch.name])),
    [data.branches]
  );
  const sectionById = useMemo(
    () => new Map(data.sections.map((section) => [section.id, section])),
    [data.sections]
  );
  const profileById = useMemo(
    () => new Map(data.profiles.map((item) => [item.id, item.full_name])),
    [data.profiles]
  );

  const assessedResults = useMemo(() => {
    const latestResultBySection = new Map<string, DashboardData['results'][number]>();
    data.results.forEach((result) => {
      if (!latestResultBySection.has(result.section_id) || latestResultBySection.get(result.section_id)!.published_at < result.published_at) latestResultBySection.set(result.section_id, result);
    });
    return [...latestResultBySection.values()];
  }, [data.results]);
  const averagePci = assessedResults.length
    ? assessedResults.reduce((sum, result) => sum + Number(result.pci), 0) /
      assessedResults.length
    : null;
  const maintenanceSections = assessedResults.filter((result) => Number(result.pci) < 55).length;

  const conditionGroups = useMemo(() => {
    const grouped = new Map<string, number>();
    assessedResults.forEach((result) => {
      const condition = getPciCondition(Number(result.pci));
      grouped.set(condition, (grouped.get(condition) ?? 0) + 1);
    });
    return PCI_CONDITION_SCALE
      .filter(({ rating }) => grouped.has(rating))
      .map(({ rating, range, color, darkColor }) => ({
        label: rating,
        range,
        count: grouped.get(rating) ?? 0,
        color: colorScheme === 'dark' ? darkColor : color,
      }));
  }, [assessedResults, colorScheme]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const monthCounts = Array.from({ length: 12 }, () => 0);
  data.inspections.forEach((inspection) => {
    const timestamp = inspection.surveyed_at ?? inspection.submitted_at ?? inspection.created_at;
    const date = new Date(timestamp);
    if (date.getFullYear() === currentYear) monthCounts[date.getMonth()] += 1;
  });
  const visibleMonths = monthCounts.slice(0, now.getMonth() + 1);
  const maxMonthCount = Math.max(...visibleMonths, 1);

  const normalizedQuery = query.trim().toLowerCase();
  const recentInspections = useMemo(() => {
    return data.inspections
      .filter((inspection) => {
        if (!normalizedQuery) return true;
        const section = sectionById.get(inspection.section_id);
        const searchable = [
          section?.name,
          section ? branchById.get(section.branch_id) : '',
          inspection.unit_number,
          inspection.workflow_state,
          inspection.surveyed_by ? profileById.get(inspection.surveyed_by) : '',
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [branchById, data.inspections, normalizedQuery, profileById, sectionById]);

  const usersByRole = useMemo(() => {
    const grouped = new Map<string, number>();
    data.profiles.forEach((item) => grouped.set(item.role, (grouped.get(item.role) ?? 0) + 1));
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data.profiles]);

  const activities = useMemo(() => {
    const items = [
      ...data.inspections.map((inspection) => {
        const section = sectionById.get(inspection.section_id);
        return {
          id: `inspection-${inspection.id}`,
          icon: 'clipboard' as const,
          title: `Inspection ${titleCase(inspection.workflow_state)}`,
          detail: `${section?.name ?? `Unit ${inspection.unit_number}`}${
            inspection.surveyed_by
              ? ` · ${profileById.get(inspection.surveyed_by) ?? 'Inspector'}`
              : ''
          }`,
          date: inspection.submitted_at ?? inspection.surveyed_at ?? inspection.created_at,
        };
      }),
      ...data.sections.map((section) => ({
        id: `section-${section.id}`,
        icon: 'map' as const,
        title: 'Road Section Added',
        detail: `${section.name} · ${branchById.get(section.branch_id) ?? 'Road network'}`,
        date: section.created_at,
      })),
      ...data.branches.map((branch) => ({
        id: `branch-${branch.id}`,
        icon: 'git-branch' as const,
        title: 'Road Branch Added',
        detail: branch.name,
        date: branch.created_at,
      })),
      ...data.profiles.map((item) => ({
        id: `profile-${item.id}`,
        icon: 'user-plus' as const,
        title: 'User Account Added',
        detail: `${item.full_name || 'Unnamed user'} · ${titleCase(item.role)}`,
        date: item.created_at,
      })),
    ];

    return items
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.detail}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [branchById, data, normalizedQuery, profileById, sectionById]);


  const workflowCounts = useMemo(() => {
    const counts = { planned: 0, draft: 0, submitted: 0, returned: 0, approved: 0, published: 0 };
    data.inspections.forEach(i => {
      if (i.workflow_state in counts) counts[i.workflow_state as keyof typeof counts]++;
    });
    return counts;
  }, [data.inspections]);

  return (
    <AdminShell loading={loading} onRefresh={() => fetchDashboard(true)} onSearchChange={setQuery} searchValue={query} subtitle="Monitor road data, inspections, and LAKAD users from one place." title="Dashboard">
      <View style={[styles.welcomeRow, isNarrow && styles.stack]}>
        <View style={styles.welcomeCopy}>
          <Text style={[styles.eyebrow, { color: palette.muted }]}>
            {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now).toUpperCase()}
          </Text>
          <Text style={[styles.welcomeTitle, isPhone && styles.welcomeTitlePhone, { color: palette.text }]}>
            Welcome back, {name.split(' ')[0]}!
          </Text>
          <Text style={[styles.welcomeSubtitle, { color: palette.muted }]}>
            Monitor road data, inspections, and LAKAD users from one place.
          </Text>
        </View>
        <View style={styles.heroBanner}>
          <Image contentFit="cover" source={require('../../assets/images/lakad_hero_bg.jpg')} style={styles.absoluteFill} />
          <View style={styles.heroOverlay} />
          <Text style={styles.heroQuote}>“Better data.\nSafer roads.\nStronger communities.”</Text>
          <Text style={styles.heroBrand}>LAKAD</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={[styles.errorBanner, { backgroundColor: palette.redSoft, borderColor: palette.red }]}>
          <Feather color={palette.red} name="alert-circle" size={19} />
          <Text style={[styles.errorText, { color: palette.text }]}>{errorMessage}</Text>
          <Pressable onPress={() => fetchDashboard()}>
            <Text style={[styles.retryText, { color: palette.red }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && (
        <>
          <View style={styles.metricGrid}>
            <MetricCard color={palette.blue} icon="git-branch" label="Road Branches" palette={palette} softColor={palette.blueSoft} value={data.branches.length.toLocaleString()} />
            <MetricCard color={palette.blue} icon="map" label="Road Sections" palette={palette} softColor={palette.blueSoft} value={data.sections.length.toLocaleString()} />
            <MetricCard color={palette.green} icon="clipboard" label="Sample Units" palette={palette} softColor={palette.greenSoft} value={data.inspections.length.toLocaleString()} />
            <MetricCard color={palette.amber} icon="pie-chart" label="Avg. Official Section PCI" palette={palette} softColor={palette.amberSoft} value={averagePci === null ? '—' : averagePci.toFixed(1)} />
            <MetricCard color={palette.red} icon="alert-triangle" label="Sections Needing Maintenance" palette={palette} softColor={palette.redSoft} value={maintenanceSections.toLocaleString()} />
          </View>

          <Panel palette={palette} title="Workflow Status" style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <View style={[styles.statusPill, { backgroundColor: palette.panelAlt }]}>
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{workflowCounts.planned} Planned</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.panelAlt }]}>
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{workflowCounts.draft} Draft</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.blueSoft }]}>
                <Text style={{ color: palette.blue, fontSize: 13, fontWeight: '700' }}>{workflowCounts.submitted} Submitted</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.amberSoft }]}>
                <Text style={{ color: palette.amber, fontSize: 13, fontWeight: '700' }}>{workflowCounts.returned} Returned</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}>
                <Text style={{ color: palette.green, fontSize: 13, fontWeight: '700' }}>{workflowCounts.approved} Approved</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}>
                <Text style={{ color: palette.green, fontSize: 13, fontWeight: '700' }}>{workflowCounts.published} Published</Text>
              </View>
            </View>
          </Panel>

          <View style={[styles.panelGrid, { marginTop: 16 }, isNarrow && styles.stack]}>
            <Panel palette={palette} style={!isNarrow ? styles.halfPanel : undefined} subtitle="Based only on persisted published section results" title="Road Condition Distribution">
              {conditionGroups.length ? (
                <View style={[styles.conditionChart, isPhone && styles.conditionChartPhone]}>
                  {Platform.OS === 'web' ? (
                    <View
                      style={[
                        styles.donut,
                        {
                          backgroundImage: buildConicGradient(conditionGroups, assessedResults.length),
                        } as never,
                      ]}>
                      <View style={[styles.donutCenter, { backgroundColor: palette.panel }]}>
                        <Text style={[styles.donutValue, { color: palette.text }]}>{assessedResults.length}</Text>
                        <Text style={[styles.donutLabel, { color: palette.muted }]}>Sections</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.conditionBar, { backgroundColor: palette.panelAlt }]}>
                      {conditionGroups.map((group) => (
                        <View
                          key={group.label}
                          style={{
                            backgroundColor: group.color,
                            width: `${(group.count / assessedResults.length) * 100}%` as DimensionValue,
                          }}
                        />
                      ))}
                    </View>
                  )}
                  <View style={styles.legendList}>
                    {conditionGroups.map((group) => (
                      <View key={group.label} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: group.color }]} />
                        <Text style={[styles.legendLabel, { color: palette.text }]}>{group.label} · {group.range}</Text>
                        <Text style={[styles.legendValue, { color: palette.text }]}>{group.count}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <EmptyState icon="pie-chart" message="PCI condition data will appear after road sections are assessed." palette={palette} />
              )}
            </Panel>

            <Panel palette={palette} style={!isNarrow ? styles.halfPanel : undefined} subtitle={`Inspections conducted in ${currentYear}`} title="Inspection Trend">
              {visibleMonths.some(Boolean) ? (
                <View style={styles.barChart}>
                  {visibleMonths.map((count, index) => (
                    <View key={monthLabels[index]} style={styles.barColumn}>
                      <Text style={[styles.barValue, { color: palette.muted }]}>{count || ''}</Text>
                      <View style={[styles.barTrack, { backgroundColor: palette.panelAlt }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${Math.max((count / maxMonthCount) * 100, count ? 8 : 0)}%` as DimensionValue,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, { color: palette.muted }]}>{monthLabels[index]}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState icon="bar-chart-2" message={`No inspections have been recorded in ${currentYear}.`} palette={palette} />
              )}
            </Panel>
          </View>

          <View style={[styles.panelGrid, { marginTop: 16 }, isNarrow && styles.stack]}>
            <Panel palette={palette} style={!isNarrow ? styles.widePanel : undefined} title="Recent Inspections">
              <InspectionList
                branchById={branchById}
                inspections={recentInspections}
                isPhone={isPhone}
                palette={palette}
                profileById={profileById}
                sectionById={sectionById}
              />
            </Panel>
            <Panel palette={palette} style={!isNarrow ? styles.sidePanel : undefined} title="User Management">
              {usersByRole.length ? usersByRole.map(([userRole, count]) => (
                <View key={userRole} style={[styles.userRow, { borderBottomColor: palette.border }]}>
                  <View style={[styles.roleIcon, { backgroundColor: palette.blueSoft }]}>
                    <Feather color={palette.blue} name="users" size={17} />
                  </View>
                  <Text style={[styles.userRole, { color: palette.text }]}>{titleCase(userRole)}</Text>
                  <Text style={[styles.userCount, { color: palette.text }]}>{count}</Text>
                </View>
              )) : (
                <EmptyState icon="users" message="No user profiles are available." palette={palette} />
              )}
            </Panel>
            <Panel palette={palette} style={!isNarrow ? styles.sidePanel : undefined} title="System Activity">
              {activities.length ? activities.map((item) => (
                <View key={item.id} style={[styles.activityRow, { borderBottomColor: palette.border }]}>
                  <Feather color={palette.blue} name={item.icon} size={18} />
                  <View style={styles.activityCopy}>
                    <Text numberOfLines={1} style={[styles.activityTitle, { color: palette.text }]}>{item.title}</Text>
                    <Text numberOfLines={1} style={[styles.activityDetail, { color: palette.muted }]}>{item.detail}</Text>
                  </View>
                  <Text style={[styles.activityDate, { color: palette.muted }]}>{formatDateTime(item.date)}</Text>
                </View>
              )) : (
                <EmptyState icon="activity" message="No matching activity was found." palette={palette} />
              )}
            </Panel>
          </View>
        </>
      )}
    </AdminShell>
  );
}
function MetricCard({
  color,
  icon,
  label,
  palette,
  softColor,
  value,
}: {
  color: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  palette: Palette;
  softColor: string;
  value: string;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: softColor, borderColor: palette.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: palette.panel }]}>
        <Feather color={color} name={icon} size={22} />
      </View>
      <View style={styles.metricCopy}>
        <Text style={[styles.metricLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function Panel({
  children,
  palette,
  style,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  palette: Palette;
  style?: object;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: palette.panel, borderColor: palette.border }, style]}>
      <View style={styles.panelHeading}>
        <Text style={[styles.panelTitle, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.panelSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function EmptyState({
  icon,
  message,
  palette,
}: {
  icon: keyof typeof Feather.glyphMap;
  message: string;
  palette: Palette;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.blueSoft }]}>
        <Feather color={palette.blue} name={icon} size={23} />
      </View>
      <Text style={[styles.emptyText, { color: palette.muted }]}>{message}</Text>
    </View>
  );
}

function InspectionList({
  branchById,
  inspections,
  isPhone,
  palette,
  profileById,
  sectionById,
}: {
  branchById: Map<string, string>;
  inspections: DashboardInspection[];
  isPhone: boolean;
  palette: Palette;
  profileById: Map<string, string>;
  sectionById: Map<string, DashboardData['sections'][number]>;
}) {
  if (!inspections.length) {
    return <EmptyState icon="clipboard" message="No inspections match the current view." palette={palette} />;
  }

  if (isPhone) {
    return (
      <View>
        {inspections.map((inspection) => {
          const section = sectionById.get(inspection.section_id);
          return (
            <View key={inspection.id} style={[styles.mobileInspection, { borderBottomColor: palette.border }]}>
              <View style={styles.mobileInspectionTop}>
                <Text style={[styles.inspectionRoad, { color: palette.text }]}>
                  {section?.name ?? `Unit ${inspection.unit_number}`}
                </Text>
                <StatusPill palette={palette} status={inspection.workflow_state} />
              </View>
              <Text style={[styles.inspectionMeta, { color: palette.muted }]}>
                {section ? branchById.get(section.branch_id) : 'Road section unavailable'} ·{' '}
                {inspection.surveyed_by
                  ? profileById.get(inspection.surveyed_by) ?? 'Inspector'
                  : 'Unassigned'}
              </Text>
              <Text style={[styles.inspectionMeta, { color: palette.muted }]}>
                {formatDate(inspection.surveyed_at ?? inspection.created_at)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: palette.panelAlt }]}>
        <Text style={[styles.tableCellDate, styles.tableHeaderText, { color: palette.muted }]}>Date</Text>
        <Text style={[styles.tableCell, styles.tableHeaderText, { color: palette.muted }]}>Road section</Text>
        <Text style={[styles.tableCell, styles.tableHeaderText, { color: palette.muted }]}>Inspector</Text>
        <Text style={[styles.tableCellStatus, styles.tableHeaderText, { color: palette.muted }]}>Status</Text>
      </View>
      {inspections.map((inspection) => {
        const section = sectionById.get(inspection.section_id);
        return (
          <View key={inspection.id} style={[styles.tableRow, { borderBottomColor: palette.border }]}>
            <Text style={[styles.tableCellDate, styles.tableText, { color: palette.text }]}>
              {formatDate(inspection.surveyed_at ?? inspection.created_at)}
            </Text>
            <View style={styles.tableCell}>
              <Text numberOfLines={1} style={[styles.tableText, { color: palette.text }]}>
                {section?.name ?? `Unit ${inspection.unit_number}`}
              </Text>
              <Text numberOfLines={1} style={[styles.tableSubtext, { color: palette.muted }]}>
                {section ? branchById.get(section.branch_id) : ''}
              </Text>
            </View>
            <Text numberOfLines={1} style={[styles.tableCell, styles.tableText, { color: palette.text }]}>
              {inspection.surveyed_by
                ? profileById.get(inspection.surveyed_by) ?? 'Inspector'
                : 'Unassigned'}
            </Text>
            <View style={styles.tableCellStatus}>
              <StatusPill palette={palette} status={inspection.workflow_state} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StatusPill({
  palette,
  status,
}: {
  palette: Palette;
  status: DashboardInspection['workflow_state'];
}) {
  const color = ['approved', 'published'].includes(status)
    ? palette.green
    : status === 'returned'
      ? palette.red
      : status === 'submitted'
        ? palette.blue
        : palette.amber;
  const backgroundColor = ['approved', 'published'].includes(status)
    ? palette.greenSoft
    : status === 'returned'
      ? palette.redSoft
      : status === 'submitted'
        ? palette.blueSoft
        : palette.amberSoft;

  return (
    <View style={[styles.statusPill, { backgroundColor }]}>
      <Text style={[styles.statusText, { color }]}>{titleCase(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  screen: { flex: 1, flexDirection: 'row', minHeight: '100%' },
  mainColumn: { flex: 1, minWidth: 0 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  accessCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, maxWidth: 440, padding: 34, width: '100%' },
  accessIcon: { alignItems: 'center', borderRadius: 30, height: 60, justifyContent: 'center', marginBottom: 18, width: 60 },
  accessTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  accessCopy: { fontSize: 15, lineHeight: 23, marginBottom: 22, marginTop: 8, textAlign: 'center' },
  primaryButton: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  scrim: { backgroundColor: 'rgba(2, 10, 28, 0.55)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  sidebar: { backgroundColor: '#071D43', paddingBottom: 16, width: 260 },
  sidebarOverlay: { bottom: 0, left: 0, position: 'absolute', top: 0, zIndex: 30 },
  sidebarGlow: { backgroundColor: '#0B4A9A', borderRadius: 130, height: 260, left: -100, opacity: 0.3, position: 'absolute', top: -90, width: 260 },
  logoRow: { alignItems: 'center', flexDirection: 'row', height: 92, justifyContent: 'space-between', paddingHorizontal: 22 },
  sidebarBrand: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  logoMark: { height: 54, width: 54 },
  logoWord: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', letterSpacing: 0.4 },
  logoTagline: { color: '#D4E3FA', fontSize: 8.5, marginTop: -1 },
  closeButton: { padding: 6 },
  adminBadge: { alignItems: 'center', backgroundColor: 'rgba(39,112,224,0.42)', borderColor: 'rgba(126,178,255,0.25)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 18, padding: 13 },
  adminBadgeCopy: { flex: 1 },
  adminBadgeName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  adminBadgeRole: { color: '#AFC6E9', fontSize: 11, marginTop: 2 },
  navList: { gap: 3, paddingHorizontal: 12, paddingTop: 16 },
  navItem: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 13, paddingHorizontal: 15, paddingVertical: 10 },
  navItemActive: { backgroundColor: '#1755A9' },
  navText: { color: '#C9D9F5', fontSize: 14 },
  navTextActive: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sidebarBottom: { alignItems: 'center', bottom: 58, height: 220, justifyContent: 'center', left: 0, overflow: 'hidden', paddingTop: 35, position: 'absolute', right: 0 },
  sidebarBottomOverlay: { backgroundColor: 'rgba(5,28,65,0.55)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sidebarMotto: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 9, textAlign: 'center' },
  sidebarPlace: { color: '#C6D7EF', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  signOut: { alignItems: 'center', bottom: 10, flexDirection: 'row', gap: 10, left: 22, padding: 10, position: 'absolute' },
  signOutText: { color: '#D7E5FF', fontSize: 14, fontWeight: '600' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, height: 66, paddingHorizontal: 22 },
  headerIconButton: { padding: 6 },
  searchBox: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, maxWidth: 520, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13, height: 38 },
  roundButton: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  account: { alignItems: 'center', borderLeftWidth: 1, flexDirection: 'row', gap: 10, marginLeft: 'auto', paddingLeft: 16 },
  avatar: { alignItems: 'center', backgroundColor: '#2878F0', borderRadius: 20, height: 39, justifyContent: 'center', width: 39 },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  accountName: { fontSize: 13, fontWeight: '700', maxWidth: 150 },
  accountRole: { fontSize: 10, marginTop: 2 },
  content: { gap: 16, padding: 24, paddingBottom: 40 },
  contentPhone: { padding: 14 },
  welcomeRow: { flexDirection: 'row', gap: 18 },
  stack: { flexDirection: 'column' },
  welcomeCopy: { flex: 1, justifyContent: 'center', minHeight: 126 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10 },
  welcomeTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.7 },
  welcomeTitlePhone: { fontSize: 27 },
  welcomeSubtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  heroBanner: { borderRadius: 14, flex: 1, justifyContent: 'center', minHeight: 134, overflow: 'hidden', padding: 24 },
  heroOverlay: { backgroundColor: 'rgba(4,25,58,0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  heroQuote: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  heroBrand: { bottom: 18, color: '#FFFFFF', fontSize: 18, fontWeight: '900', position: 'absolute', right: 22 },
  errorBanner: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 },
  errorText: { flex: 1, fontSize: 13 },
  retryText: { fontSize: 13, fontWeight: '800' },
  loadingBlock: { alignItems: 'center', justifyContent: 'center', minHeight: 390 },
  loadingText: { fontSize: 14, marginTop: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, flexBasis: 210, flexDirection: 'row', gap: 13, minHeight: 112, padding: 16 },
  metricIcon: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  metricCopy: { flex: 1 },
  metricLabel: { fontSize: 13, fontWeight: '600' },
  metricValue: { fontSize: 27, fontWeight: '900', marginTop: 7 },
  panelGrid: { flexDirection: 'row', gap: 16 },
  panel: { borderRadius: 13, borderWidth: 1, minHeight: 265, overflow: 'hidden', padding: 18 },
  halfPanel: { flex: 1 },
  widePanel: { flex: 1.4 },
  sidePanel: { flex: 1 },
  panelHeading: { marginBottom: 14 },
  panelTitle: { fontSize: 17, fontWeight: '800' },
  panelSubtitle: { fontSize: 12, marginTop: 3 },
  conditionChart: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 30, justifyContent: 'center' },
  conditionChartPhone: { flexDirection: 'column', gap: 18 },
  conditionBar: { borderRadius: 7, flexDirection: 'row', height: 20, overflow: 'hidden', width: '42%' },
  donut: { alignItems: 'center', borderRadius: 80, height: 150, justifyContent: 'center', width: 150 },
  donutCenter: { alignItems: 'center', borderRadius: 52, height: 96, justifyContent: 'center', width: 96 },
  donutValue: { fontSize: 25, fontWeight: '900' },
  donutLabel: { fontSize: 11, marginTop: 1 },
  legendList: { flex: 1, gap: 9, maxWidth: 240 },
  legendRow: { alignItems: 'center', flexDirection: 'row' },
  legendDot: { borderRadius: 5, height: 10, marginRight: 9, width: 10 },
  legendLabel: { flex: 1, fontSize: 13 },
  legendValue: { fontSize: 13, fontWeight: '800' },
  barChart: { alignItems: 'flex-end', flex: 1, flexDirection: 'row', gap: 5, minHeight: 185 },
  barColumn: { alignItems: 'center', flex: 1, height: 180, justifyContent: 'flex-end' },
  barValue: { fontSize: 9, height: 14 },
  barTrack: { borderRadius: 4, flex: 1, justifyContent: 'flex-end', maxWidth: 30, overflow: 'hidden', width: '70%' },
  barFill: { backgroundColor: '#2878F0', borderRadius: 4, width: '100%' },
  barLabel: { fontSize: 9, marginTop: 7 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 170, paddingHorizontal: 20 },
  emptyIcon: { alignItems: 'center', borderRadius: 25, height: 50, justifyContent: 'center', marginBottom: 10, width: 50 },
  emptyText: { fontSize: 13, lineHeight: 20, maxWidth: 330, textAlign: 'center' },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 9 },
  tableHeader: { borderBottomWidth: 0, borderRadius: 7, minHeight: 34 },
  tableHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  tableCell: { flex: 1.2, paddingHorizontal: 5 },
  tableCellDate: { flex: 0.85, paddingHorizontal: 5 },
  tableCellStatus: { alignItems: 'flex-start', flex: 0.8, paddingHorizontal: 5 },
  tableText: { fontSize: 12 },
  tableSubtext: { fontSize: 10, marginTop: 2 },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: '800' },
  mobileInspection: { borderBottomWidth: 1, paddingVertical: 12 },
  mobileInspectionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  inspectionRoad: { flex: 1, fontSize: 13, fontWeight: '700', marginRight: 8 },
  inspectionMeta: { fontSize: 11, marginTop: 4 },
  userRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 51 },
  roleIcon: { alignItems: 'center', borderRadius: 17, height: 34, justifyContent: 'center', marginRight: 10, width: 34 },
  userRole: { flex: 1, fontSize: 13, fontWeight: '600' },
  userCount: { fontSize: 14, fontWeight: '800' },
  activityRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 55 },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: 12, fontWeight: '700' },
  activityDetail: { fontSize: 10, marginTop: 3 },
  activityDate: { fontSize: 9, maxWidth: 78, textAlign: 'right' },
});
