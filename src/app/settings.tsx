import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { loadDashboardData } from '@/lib/dashboard';
import { useAppTheme } from '@/providers/ThemeProvider';

type Counts = { branches: number; sections: number; inspections: number; profiles: number };

export default function SettingsScreen() {
  const router = useRouter();
  const palette = useAdminPalette();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const [counts, setCounts] = useState<Counts>({ branches: 0, sections: 0, inspections: 0, profiles: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isCompact = width < 820;

  const refresh = useCallback(async () => {
    try {
      const data = await loadDashboardData();
      setError('');
      setCounts({ branches: data.branches.length, sections: data.sections.length, inspections: data.inspections.length, profiles: data.profiles.length });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'System status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return (
    <AdminShell loading={loading} onRefresh={() => void refresh()} subtitle="Manage safe application preferences and inspect the connected data environment." title="System Settings">
      {error ? <View style={[styles.notice, { backgroundColor: palette.redSoft, borderColor: palette.red }]}><Feather color={palette.red} name="alert-circle" size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{error}</Text></View> : null}
      <View style={[styles.columns, isCompact && styles.stack]}>
        <AdminPanel palette={palette} style={styles.column} subtitle="Saved locally and applied across the LAKAD interface" title="Appearance">
          <View style={[styles.settingRow, { borderBottomColor: palette.border }]}><View style={[styles.settingIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={colorScheme === 'dark' ? 'moon' : 'sun'} size={19} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Color theme</Text><Text style={[styles.settingText, { color: palette.muted }]}>Currently using {colorScheme} mode. Your selection persists after refresh.</Text></View><AdminButton label={`Use ${colorScheme === 'dark' ? 'light' : 'dark'} mode`} onPress={toggleColorScheme} palette={palette} tone="secondary" /></View>
          <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: palette.greenSoft }]}><Feather color={palette.green} name="monitor" size={19} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Responsive layout</Text><Text style={[styles.settingText, { color: palette.muted }]}>Navigation and data panels adapt automatically to the active screen size.</Text></View><View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}><Text style={[styles.statusText, { color: palette.green }]}>Enabled</Text></View></View>
        </AdminPanel>

        <AdminPanel palette={palette} style={styles.column} subtitle="Live record visibility through the current authenticated session" title="Data connection">
          <View style={styles.countGrid}><Count label="Branches" palette={palette} value={counts.branches} /><Count label="Sections" palette={palette} value={counts.sections} /><Count label="Inspections" palette={palette} value={counts.inspections} /><Count label="Profiles" palette={palette} value={counts.profiles} /></View>
          <Pressable onPress={() => router.push('/rls-test')} style={[styles.diagnosticLink, { backgroundColor: palette.blueSoft, borderColor: palette.blue }]}><Feather color={palette.blue} name="database" size={18} /><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Open data access check</Text><Text style={[styles.settingText, { color: palette.muted }]}>Run the project’s existing Row Level Security diagnostics.</Text></View><Feather color={palette.blue} name="arrow-right" size={17} /></Pressable>
        </AdminPanel>
      </View>

      <AdminPanel palette={palette} subtitle="These values describe the classifications used by the maintenance view" title="PCI interpretation guide">
        <View style={styles.scale}>
          <Scale color="#E52535" label="Failed / Very Poor" range="0–39" palette={palette} />
          <Scale color="#F47B20" label="Poor" range="40–54" palette={palette} />
          <Scale color="#F0AE32" label="Fair" range="55–69" palette={palette} />
          <Scale color="#2878F0" label="Satisfactory" range="70–84" palette={palette} />
          <Scale color="#16A765" label="Good" range="85–100" palette={palette} />
        </View>
        <Text style={[styles.disclaimer, { color: palette.muted }]}>This page does not alter the database schema, security policies, or PCI computation source data.</Text>
      </AdminPanel>
    </AdminShell>
  );
}

function Count({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: number }) {
  return <View style={[styles.count, { backgroundColor: palette.panelAlt }]}><Text style={[styles.countValue, { color: palette.text }]}>{value.toLocaleString()}</Text><Text style={[styles.countLabel, { color: palette.muted }]}>{label}</Text></View>;
}

function Scale({ color, label, palette, range }: { color: string; label: string; palette: ReturnType<typeof useAdminPalette>; range: string }) {
  return <View style={styles.scaleItem}><View style={[styles.scaleColor, { backgroundColor: color }]} /><Text style={[styles.scaleRange, { color: palette.text }]}>{range}</Text><Text style={[styles.scaleLabel, { color: palette.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 16 },
  stack: { flexDirection: 'column' },
  column: { flex: 1 },
  settingRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 83, paddingVertical: 10 },
  settingIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  settingCopy: { flex: 1 },
  settingTitle: { fontSize: 12.5, fontWeight: '800' },
  settingText: { fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  statusPill: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  count: { alignItems: 'center', borderRadius: 9, flexBasis: '46%', flexGrow: 1, padding: 12 },
  countValue: { fontSize: 20, fontWeight: '900' },
  countLabel: { fontSize: 10, marginTop: 3 },
  diagnosticLink: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 15, padding: 12 },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  scaleItem: { flex: 1, minWidth: 130 },
  scaleColor: { borderRadius: 4, height: 8, marginBottom: 8 },
  scaleRange: { fontSize: 13, fontWeight: '900' },
  scaleLabel: { fontSize: 10.5, marginTop: 2 },
  disclaimer: { fontSize: 10.5, marginTop: 18 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  noticeText: { flex: 1, fontSize: 12 },
});
