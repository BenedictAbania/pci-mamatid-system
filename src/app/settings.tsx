import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { PCI_CONDITION_SCALE } from '@/lib/pci-classification';
import { getDistressSeverityColors, normalizeDistressSeverity } from '@/lib/severity-colors';
import { callWorkflow } from '@/lib/workflow-data';
import { useAppTheme } from '@/providers/ThemeProvider';

export default function SettingsScreen() {
  const router = useRouter();
  const palette = useAdminPalette();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const { data, loading, busy, error, message, refresh, run } = useWorkflow();
  const isCompact = width < 820;

  const [edition, setEdition] = useState('');
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [referenceDescription, setReferenceDescription] = useState('');
  const [referenceUnit, setReferenceUnit] = useState('m²');
  const [severityRequired, setSeverityRequired] = useState(true);
  const [allowedSeverities, setAllowedSeverities] = useState(['low', 'medium', 'high']);
  const [referenceActive, setReferenceActive] = useState(true);

  useEffect(() => {
    if (data?.settings) {
      // Synchronize editable fields after the remote settings record arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEdition(data.settings.active_edition || '');
    }
  }, [data]);

  const handleSaveSettings = () => {
    void run(() => callWorkflow('lakad_save_settings', { payload: { edition, priority_safety: true, priority_area: true } }), 'Settings saved successfully.');
  };

  const resetReference = () => {
    setReferenceId(null);
    setReferenceCode('');
    setReferenceName('');
    setReferenceDescription('');
    setReferenceUnit('m²');
    setSeverityRequired(true);
    setAllowedSeverities(['low', 'medium', 'high']);
    setReferenceActive(true);
  };

  const editReference = (id: string) => {
    const reference = data?.types.find((item) => item.id === id);
    if (!reference) return;
    setReferenceId(reference.id);
    setReferenceCode(reference.code || '');
    setReferenceName(reference.name);
    setReferenceDescription(reference.description || '');
    setReferenceUnit(reference.default_unit_of_measure || 'm²');
    setSeverityRequired(reference.severity_required);
    setAllowedSeverities(reference.allowed_severities || []);
    setReferenceActive(reference.is_active);
  };

  const toggleSeverity = (severity: string) => {
    setAllowedSeverities((current) => current.includes(severity) ? current.filter((item) => item !== severity) : [...current, severity]);
  };

  const handleSaveReference = () => {
    void run(() => callWorkflow('lakad_save_distress_type', {
      target: referenceId,
      payload: {
        code: referenceCode,
        name: referenceName,
        description: referenceDescription,
        default_unit_of_measure: referenceUnit,
        severity_required: severityRequired,
        allowed_severities: severityRequired ? allowedSeverities : [],
        is_active: referenceActive,
      },
    }), `Distress reference ${referenceId ? 'updated' : 'created'} successfully.`);
  };

  return (
    <AdminShell loading={loading} onRefresh={refresh} subtitle="Manage safe application preferences and workflow configurations." title="System Settings">
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      <View style={[styles.columns, isCompact && styles.stack]}>

        {/* Left Column */}
        <View style={styles.column}>
          <AdminPanel palette={palette} subtitle="Application configuration" title="System Settings">
            <View style={{ gap: 16 }}>
              <AdminField label="ASTM Reference Edition" onChangeText={setEdition} palette={palette} value={edition} />

              <View style={[styles.settingRow, { borderBottomColor: palette.border }]}>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: palette.text }]}>Prioritize Safety</Text>
                  <Text style={[styles.settingText, { color: palette.muted }]}>Required tie-breaker after approved section PCI: high-severity or safety-related distress.</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}><Text style={[styles.statusText, { color: palette.green }]}>Required</Text></View>
              </View>

              <View style={[styles.settingRow, { borderBottomColor: palette.border }]}>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: palette.text }]}>Prioritize Affected Area</Text>
                  <Text style={[styles.settingText, { color: palette.muted }]}>Required final tie-breaker: greater affected pavement area.</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}><Text style={[styles.statusText, { color: palette.green }]}>Required</Text></View>
              </View>

              <AdminButton disabled={busy} label="Save Settings" onPress={handleSaveSettings} palette={palette} />
            </View>
          </AdminPanel>

          <AdminPanel palette={palette} style={{ marginTop: 16 }} subtitle="Saved locally and applied across the LAKAD interface" title="Appearance">
            <View style={[styles.settingRow, { borderBottomColor: palette.border }]}><View style={[styles.settingIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={colorScheme === 'dark' ? 'moon' : 'sun'} size={19} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Color theme</Text><Text style={[styles.settingText, { color: palette.muted }]}>Currently using {colorScheme} mode. Your selection persists after refresh.</Text></View><AdminButton label={`Use ${colorScheme === 'dark' ? 'light' : 'dark'} mode`} onPress={toggleColorScheme} palette={palette} tone="secondary" /></View>
            <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: palette.greenSoft }]}><Feather color={palette.green} name="monitor" size={19} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Responsive layout</Text><Text style={[styles.settingText, { color: palette.muted }]}>Navigation and data panels adapt automatically to the active screen size.</Text></View><View style={[styles.statusPill, { backgroundColor: palette.greenSoft }]}><Text style={[styles.statusText, { color: palette.green }]}>Enabled</Text></View></View>
          </AdminPanel>
        </View>

        {/* Right Column */}
        <View style={styles.column}>
          <AdminPanel palette={palette} subtitle="Live record visibility through the current authenticated session" title="Data Connection">
            <View style={styles.countGrid}>
              <Count label="Branches" palette={palette} value={data?.branches?.length || 0} />
              <Count label="Sections" palette={palette} value={data?.sections?.length || 0} />
              <Count label="Inspections" palette={palette} value={data?.samples?.length || 0} />
              <Count label="Profiles" palette={palette} value={data?.profiles?.length || 0} />
            </View>
            <Pressable onPress={() => router.push('/rls-test')} style={[styles.diagnosticLink, { backgroundColor: palette.blueSoft, borderColor: palette.blue }]}><Feather color={palette.blue} name="database" size={18} /><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Open data access check</Text><Text style={[styles.settingText, { color: palette.muted }]}>Run the project’s existing Row Level Security diagnostics.</Text></View><Feather color={palette.blue} name="arrow-right" size={17} /></Pressable>
          </AdminPanel>

          <AdminPanel palette={palette} style={{ marginTop: 16 }} subtitle="These values describe the classifications used by the maintenance view" title="PCI Interpretation Guide">
            <View style={styles.scale}>
              {PCI_CONDITION_SCALE.map((condition) => <Scale color={colorScheme === 'dark' ? condition.darkColor : condition.color} key={condition.rating} label={condition.rating} range={condition.range} palette={palette} />)}
            </View>
          </AdminPanel>
        </View>
      </View>

      <AdminPanel palette={palette} style={{ marginTop: 16 }} subtitle="Maintain validated field-entry descriptors. Deduct-value and CDV reference data remain separate and must be independently verified before official PCI approval." title="Distress Reference Catalog">
        <View style={[styles.columns, isCompact && styles.stack]}>
          <View style={styles.column}>
            <View style={{ gap: 13 }}>
              <AdminField label="Reference Code" onChangeText={setReferenceCode} palette={palette} placeholder="e.g. AC-01" value={referenceCode} />
              <AdminField label="Distress Name" onChangeText={setReferenceName} palette={palette} placeholder="Validated asphalt distress name" value={referenceName} />
              <AdminField label="Description" multiline onChangeText={setReferenceDescription} palette={palette} placeholder="Field identification guidance" value={referenceDescription} />
              <Choices label="Default Measurement Unit" onChange={setReferenceUnit} options={[{ label: 'Area (m²)', value: 'm²' }, { label: 'Length (m)', value: 'm' }, { label: 'Count (No.)', value: 'No.' }]} value={referenceUnit} />
              <View style={[styles.settingRow, { borderBottomColor: palette.border }]}>
                <View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Severity is required</Text><Text style={[styles.settingText, { color: palette.muted }]}>Require inspectors to classify the record using the allowed levels below.</Text></View>
                <Switch disabled={busy} onValueChange={setSeverityRequired} value={severityRequired} trackColor={{ false: palette.border, true: palette.blue }} />
              </View>
              {severityRequired ? <View style={{ gap: 8 }}><Text style={[styles.settingTitle, { color: palette.text }]}>Allowed Severity Levels</Text><View style={styles.severityRow}>{['low', 'medium', 'high'].map((severity) => {
                const label = normalizeDistressSeverity(severity)!;
                const colors = getDistressSeverityColors(label);
                const selected = allowedSeverities.includes(severity);
                return <Pressable accessibilityLabel={`${label} severity`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={severity} onPress={() => toggleSeverity(severity)} style={[styles.severityChoice, { backgroundColor: selected ? colors.backgroundColor : palette.panel, borderColor: selected ? colors.borderColor : palette.border }]}><Text style={{ color: selected ? colors.textColor : palette.text, fontWeight: '700' }}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
              })}</View></View> : null}
              <View style={[styles.settingRow, { borderBottomColor: palette.border }]}>
                <View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Active for field entry</Text><Text style={[styles.settingText, { color: palette.muted }]}>Inactive references remain attached to historical records but cannot be selected for new entries.</Text></View>
                <Switch disabled={busy} onValueChange={setReferenceActive} value={referenceActive} trackColor={{ false: palette.border, true: palette.green }} />
              </View>
              <View style={styles.actionRow}><AdminButton disabled={busy} label={referenceId ? 'Update Reference' : 'Add Reference'} onPress={handleSaveReference} palette={palette} /><AdminButton disabled={busy} label="Clear" onPress={resetReference} palette={palette} tone="secondary" /></View>
            </View>
          </View>
          <View style={styles.column}>
            <Text style={[styles.catalogHeading, { color: palette.text }]}>Configured references ({data?.types.length || 0})</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {data?.types.map((reference) => <Pressable key={reference.id} onPress={() => editReference(reference.id)} style={[styles.catalogItem, { backgroundColor: reference.id === referenceId ? palette.blueSoft : palette.panelAlt, borderColor: reference.id === referenceId ? palette.blue : palette.border }]}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>{reference.code || 'No code'} · {reference.name}</Text><Text style={[styles.settingText, { color: palette.muted }]}>{reference.default_unit_of_measure || 'No unit'} · {reference.severity_required ? reference.allowed_severities.join(', ') : 'No severity'} · {reference.is_active ? 'Active' : 'Inactive'}</Text></View><Feather color={palette.blue} name="edit-2" size={16} /></Pressable>)}
              {!data?.types.length ? <Text style={[styles.settingText, { color: palette.muted }]}>No distress references are configured. Add only engineer-validated asphalt descriptors.</Text> : null}
            </View>
          </View>
        </View>
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
  settingRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 70, paddingVertical: 10 },
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
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  severityChoice: { borderRadius: 8, borderWidth: 1, minHeight: 42, minWidth: 88, paddingHorizontal: 14, paddingVertical: 11 },
  catalogHeading: { fontSize: 14, fontWeight: '900' },
  catalogItem: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58, padding: 11 },
  disclaimer: { fontSize: 10.5, marginTop: 18 },
});
