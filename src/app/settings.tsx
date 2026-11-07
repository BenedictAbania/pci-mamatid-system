import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View, type TextStyle } from 'react-native';

import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { PageControls } from '@/components/workflow/pagination';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { ASPHALT_CATALOG, RULES } from '@/lib/d6433-07/catalog';
import { CDV_PREVIEW_Q, CDV_PREVIEW_ROWS } from '@/lib/d6433-07/cdv-preview';
import { d07MeasureFor } from '@/lib/d6433-07/measure-guidance';
import { d07GuidanceFor } from '@/lib/d6433-07/severity-guidance';
import { supabase } from '@/lib/data/supabase';
import { callWorkflow, type CatalogType } from '@/lib/data/workflow-data';
import { PCI_CONDITION_SCALE } from '@/lib/pci/pci-classification';
import { SAMPLE_UNIT_MAX_AREA, SAMPLE_UNIT_MIN_AREA, SAMPLE_UNIT_TARGET_AREA } from '@/lib/pci/pci-service';
import { getDistressSeverityColors, normalizeDistressSeverity } from '@/lib/pci/severity-colors';
import { brand, layout } from '@/lib/ui/design-system';
import { useAppTheme } from '@/providers/ThemeProvider';

type Tab = 'parameters' | 'distress' | 'dv' | 'cdv' | 'pci' | 'history';
const tabs: { id: Tab; label: string }[] = [
  { id: 'parameters', label: 'Parameters' },
  { id: 'distress', label: 'Distress Types' },
  { id: 'dv', label: 'Deduct Curves' },
  { id: 'cdv', label: 'Corrected Deduct Value' },
  { id: 'pci', label: 'PCI Computation' },
  { id: 'history', label: 'History' },
];
type Level = 'low' | 'medium' | 'high';
const levels: Level[] = ['low', 'medium', 'high'];
const levelNames: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };
/** L, M and H badges step from light to dark brand blue. */
const levelColors: Record<Level, { bg: string; fg: string }> = {
  low: { bg: '#C9DAFF', fg: brand.navy },
  medium: { bg: brand.royal, fg: '#FFFFFF' },
  high: { bg: brand.navy, fg: '#FFFFFF' },
};
const unitLabel = (unit: string | null) => unit === 'No.' ? 'count' : unit || '—';
/** #, Distress type, Measured in, Severity levels, Criteria. */
const distressColumns = [{ width: 44 }, { flex: 2.4 }, { flex: 1 }, { flex: 1 }, { flex: 0.8 }] as const;

/** Values the calculation code uses (src/lib/d6433-07, src/lib/pci/pci-service.ts). Fixed by ASTM D6433-07. */
const parameters: [string, string, string][] = [
  ['Sample unit size', `${SAMPLE_UNIT_TARGET_AREA} m² ± ${SAMPLE_UNIT_TARGET_AREA - SAMPLE_UNIT_MIN_AREA} m² (${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m²)`, `Dividing sections into sample units (${RULES.area})`],
  ['Confidence level', '95%', `Units to inspect (${RULES.sampling})`],
  ['Acceptable error (e)', '± 5 PCI points', 'Units to inspect'],
  ['Assumed standard deviation (s)', '10', 'First inspection of a section'],
  ['Minimum counted deduct value', '2.0', 'Which deducts count in q'],
  ['Maximum allowable deducts (m)', '1 + (9/98)(100 − HDV), up to 10', `Limit when correcting deducts (${RULES.allowable})`],
  ['Rounding', 'Full precision; n rounded up', 'Sample units and units to inspect'],
];


type AuditRow = { id: string; action: string; actor_id: string | null; detail: Record<string, unknown> | null; created_at: string };

export default function ReferenceDataScreen() {
  const palette = useAdminPalette();
  const { colorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const { data, loading, busy, error, message, refresh, run, pagination } = useWorkflow();
  const compact = width < 1100;
  const dark = colorScheme === 'dark';
  const [tab, setTab] = useState<Tab>('parameters');
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<{ rows: AuditRow[]; error: string } | null>(null);
  const [criteria, setCriteria] = useState<CatalogType | null>(null);
  const [curveCode, setCurveCode] = useState(ASPHALT_CATALOG[0].code);

  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [canonical, setCanonical] = useState(false);
  const [referenceCode, setReferenceCode] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [referenceDescription, setReferenceDescription] = useState('');
  const [referenceUnit, setReferenceUnit] = useState('m²');
  const [severityRequired, setSeverityRequired] = useState(true);
  const [allowedSeverities, setAllowedSeverities] = useState(['low', 'medium', 'high']);
  const [referenceActive, setReferenceActive] = useState(true);

  const loadHistory = useCallback(async () => {
    const { data: rows, error: failure } = await supabase.from('lakad_audit')
      .select('id,action,actor_id,detail,created_at')
      .in('action', ['settings_updated', 'distress_reference_saved'])
      .order('created_at', { ascending: false }).limit(25);
    setHistory(failure ? { rows: [], error: 'Change history could not be loaded.' } : { rows: (rows ?? []) as AuditRow[], error: '' });
  }, []);

  useEffect(() => {
    // Load the change history once the History tab is first opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'history' && !history) void loadHistory();
  }, [tab, history, loadHistory]);

  const resetReference = () => {
    setReferenceId(null);
    setCanonical(false);
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
    setCanonical(!!reference.astm_code);
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
    }), `Distress type ${referenceId ? 'updated' : 'added'}.`).then(() => setHistory(null));
  };

  /** Edit opens the distress type editor: the only reference data an admin can change. */
  const toggleEditing = () => {
    if (editing) { setEditing(false); resetReference(); return; }
    setTab('distress');
    setEditing(true);
  };

  const edition = data?.settings?.active_edition ?? 'ASTM D6433-07';
  const year = /-(\d{2})$/.exec(edition)?.[1];
  const updated = data?.settings?.updated_at ? new Date(data.settings.updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
  const names = new Map((data?.profiles ?? []).map((profile) => [profile.id, profile.full_name || 'Unnamed user']));
  const types = [...(data?.types ?? [])].sort((a, b) => (a.astm_code ?? 999) - (b.astm_code ?? 999) || a.name.localeCompare(b.name));

  const summary: [string, string][] = [
    ['Standard in Use', edition.replace(/-\d{2}$/, '')],
    ['Pavement Type', 'Asphalt'],
    ['Reference Data', year ? `20${year} edition` : edition],
    ['Last Updated', updated],
  ];

  return (
    <AdminShell loading={loading} onRefresh={refresh} subtitle="The ASTM values LAKAD uses to compute PCI." title="Reference Data">
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      <AdminPanel palette={palette} style={styles.summary}>
        <View style={[styles.summaryItems, compact && styles.wrap]}>
          {summary.map(([label, value]) => <View key={label} style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: palette.muted }]}>{label}</Text>
            <Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text>
          </View>)}
        </View>
        <AdminButton icon={editing ? 'check' : 'edit-2'} label={editing ? 'Done' : 'Edit'} onPress={toggleEditing} palette={palette} />
      </AdminPanel>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map(({ id, label }) => {
          const selected = tab === id;
          return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(id)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.tab, {
              backgroundColor: selected ? (dark ? palette.action : brand.navy) : hovered ? palette.blueSoft : palette.panel,
            }, pressed && styles.pressed]}>
            <Text style={[styles.tabText, { color: selected ? '#FFFFFF' : palette.text }]}>{label}</Text>
          </Pressable>;
        })}
      </View>

      <View style={styles.main}>
          {tab === 'parameters' ? (
            <AdminPanel palette={palette} title="Computation Parameters">
              <Table palette={palette} head={['Parameter', 'Value', 'Used for']} rows={parameters} strongFirst />
            </AdminPanel>
          ) : null}

          {tab === 'distress' ? <>
            {editing ? (
              <AdminPanel palette={palette} subtitle={referenceId ? 'Change the selected distress type, then save.' : 'Pick a distress type below to change it, or add a new one.'} title={referenceId ? `Edit ${referenceName || 'distress type'}` : 'Add Distress Type'}>
                <View style={styles.form}>
                  <View style={[styles.formRow, compact && styles.stack]}>
                    <View style={styles.formCell}><AdminField editable={!canonical} label="Code" onChangeText={setReferenceCode} palette={palette} placeholder="e.g. AC-01" value={referenceCode} /></View>
                    <View style={styles.formCell}><AdminField label="Distress name" onChangeText={setReferenceName} palette={palette} placeholder="Validated asphalt distress name" value={referenceName} /></View>
                  </View>
                  <AdminField label="Description" multiline onChangeText={setReferenceDescription} palette={palette} placeholder="How inspectors identify it in the field" value={referenceDescription} />
                  {canonical ? <Notice>ASTM D6433-07 fixes the unit and severities for this type: {referenceUnit} · {allowedSeverities.join(', ') || 'no severity'}. You can change its name, description and status.</Notice> : <>
                    <Choices label="Measurement unit" onChange={setReferenceUnit} options={[{ label: 'Area (m²)', value: 'm²' }, { label: 'Length (m)', value: 'm' }, { label: 'Count (No.)', value: 'No.' }]} value={referenceUnit} />
                    <SwitchRow palette={palette} title="Severity is required" text="Inspectors must pick one of the allowed severity levels." value={severityRequired} onChange={setSeverityRequired} disabled={busy} />
                    {severityRequired ? <View style={styles.severityRow}>{['low', 'medium', 'high'].map((severity) => {
                      const label = normalizeDistressSeverity(severity)!;
                      const colors = getDistressSeverityColors(label);
                      const selected = allowedSeverities.includes(severity);
                      return <Pressable accessibilityLabel={`${label} severity`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={severity} onPress={() => toggleSeverity(severity)}
                        style={[styles.severityChoice, { backgroundColor: selected ? colors.backgroundColor : palette.panel, borderColor: selected ? colors.borderColor : palette.border }]}>
                        <Text style={{ color: selected ? colors.textColor : palette.text }}>{selected ? '✓ ' : ''}{label}</Text>
                      </Pressable>;
                    })}</View> : null}
                  </>}
                  <SwitchRow palette={palette} title="Active for field entry" text="Inactive types stay on past records but cannot be picked for new ones." value={referenceActive} onChange={setReferenceActive} disabled={busy} />
                  <View style={styles.actions}>
                    <AdminButton disabled={busy} label="Clear" onPress={resetReference} palette={palette} tone="secondary" />
                    <AdminButton disabled={busy} icon="check" label={referenceId ? 'Save Changes' : 'Add Distress Type'} onPress={handleSaveReference} palette={palette} />
                  </View>
                </View>
              </AdminPanel>
            ) : null}
            <AdminPanel palette={palette} subtitle={editing ? 'Press Edit on a row to change it.' : undefined} title="Distress Types for Asphalt">
              {types.length ? <View>
                <View style={[styles.distressRow, { borderBottomColor: palette.border }]}>
                  {['#', 'Distress type', 'Measured in', 'Severity levels', 'Criteria'].map((label, index) => <Text key={label} style={[styles.distressHead, distressColumns[index], { color: palette.muted }]}>{label}</Text>)}
                </View>
                {types.map((type, index) => <View key={type.id} style={[styles.distressRow, { borderBottomColor: palette.border }, type.id === referenceId && { backgroundColor: palette.blueSoft }]}>
                  <Text style={[styles.distressCell, distressColumns[0], { color: palette.text }]}>{type.astm_code ?? index + 1}</Text>
                  <Text style={[styles.distressCell, distressColumns[1], styles.distressName, { color: type.is_active ? palette.text : palette.muted }]}>{type.name}{type.is_active ? '' : ' (inactive)'}</Text>
                  <Text style={[styles.distressCell, distressColumns[2], { color: palette.text }]}>{unitLabel(type.default_unit_of_measure)}</Text>
                  <View accessibilityLabel={type.severity_required && type.allowed_severities.length ? `Severity levels: ${type.allowed_severities.map(l => levelNames[l as Level]).join(', ')}` : 'No severity levels'} style={[distressColumns[3], styles.badges]}>
                    {type.severity_required && type.allowed_severities.length
                      ? levels.filter(level => type.allowed_severities.includes(level)).map(level => <View key={level} style={[styles.badge, { backgroundColor: levelColors[level].bg }]}><Text style={[styles.badgeText, { color: levelColors[level].fg }]}>{level[0].toUpperCase()}</Text></View>)
                      : <Text style={[styles.distressCell, { color: palette.muted }]}>None</Text>}
                  </View>
                  <View style={[distressColumns[4], styles.links]}>
                    <TextLink label="View" a11y={`View criteria for ${type.name}`} onPress={() => setCriteria(type)} color={palette.blue} />
                    {editing ? <TextLink label="Edit" a11y={`Edit ${type.name}`} onPress={() => editReference(type.id)} color={palette.blue} /> : null}
                  </View>
                </View>)}
              </View> : <Text style={[styles.note, { color: palette.muted }]}>No distress types yet. Press Edit to add one.</Text>}
              <PageControls {...pagination} />
            </AdminPanel>
          </> : null}

          {tab === 'dv' ? <DeductCurves code={curveCode} onChange={setCurveCode} palette={palette} stacked={compact} /> : null}

          {tab === 'cdv' ? <CorrectedCurves palette={palette} stacked={compact} /> : null}

          {tab === 'pci' ? <PciComputation dark={dark} palette={palette} stacked={compact} /> : null}

          {tab === 'history' ? (
            <AdminPanel palette={palette} title="Change History">
              {!history ? <Text style={[styles.note, { color: palette.muted }]}>Loading changes…</Text>
                : history.error ? <Notice error>{history.error}</Notice>
                : history.rows.length ? <View>
                  <Row palette={palette} cells={['Date', 'Changed by', 'Change']} head />
                  {history.rows.map((row) => <Row key={row.id} palette={palette} cells={[
                    new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
                    (row.actor_id && names.get(row.actor_id)) || 'Administrator',
                    describeChange(row),
                  ]} />)}
                </View>
                : <Text style={[styles.note, { color: palette.muted }]}>No reference data changes yet.</Text>}
            </AdminPanel>
          ) : null}
      </View>

      <CriteriaDialog type={criteria} palette={palette} onClose={() => setCriteria(null)} onEdit={(id) => { setCriteria(null); setTab('distress'); setEditing(true); editReference(id); }} />
    </AdminShell>
  );
}

/** Subscript: smaller text lowered on the baseline (web honours verticalAlign; elsewhere it is simply smaller). */
function Sub({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, verticalAlign: 'sub' } as unknown as TextStyle}>{children}</Text>;
}

/** PCI of a sample unit, the condition scale, and the section PCI equations (ASTM D6433-07 §9.6, Fig. 1, §11.1 Eqs. 5-7). */
function PciComputation({ dark, palette, stacked }: { dark: boolean; palette: AdminPalette; stacked: boolean }) {
  const text = [styles.stepText, { color: palette.text }];
  const formula = (value: ReactNode) => <View style={[styles.formula, styles.formulaLeft, { backgroundColor: palette.blueSoft }]}><Text style={[styles.formulaText, { color: palette.text }]}>{value}</Text></View>;
  const term = (name: ReactNode, meaning: string) => <Text style={text}><Text style={styles.strong}>{name}</Text> = {meaning}</Text>;
  return <View style={[styles.curveRow, stacked && styles.stack]}>
    <View style={[styles.curveCell, styles.stepColumn, !stacked && { flex: 1.5 }]}>
      <Step n={1} palette={palette} title="PCI of a sample unit">
        {formula('PCI = 100 − Max CDV')}
        <Text style={[styles.dialogMeta, { color: palette.muted }]}>The Max CDV comes from the Corrected Deduct Value tab.</Text>
      </Step>
      <Step n={3} palette={palette} title="PCI of a section">
        {formula(<>PCI<Sub>s</Sub> = ∑(PCI<Sub>ri</Sub> × A<Sub>ri</Sub>) ÷ ∑A<Sub>ri</Sub></>)}
        {term(<>PCI<Sub>s</Sub></>, 'PCI of the section')}
        {term(<>PCI<Sub>ri</Sub></>, 'PCI of random sample unit i')}
        {term(<>A<Sub>ri</Sub></>, 'area of random sample unit i')}
      </Step>
      <Step n={4} palette={palette} title="Additional sample units">
        <Text style={text}>A sample unit inspected in addition to the random ones, when a condition is not representative or an unusual distress is found. For example:</Text>
        {['Unusually poor pavement', 'Unusually good pavement', 'Unusual distress', 'Utility cuts'].map(item => <Text key={item} style={text}>•  {item}</Text>)}
        <Text style={text}>Each sample unit is computed the same way. Only the section PCI changes.</Text>
        {formula(<>PCI<Sub>s</Sub> = [(N − A) × PCI<Sub>r</Sub> + A × PCI<Sub>a</Sub>] ÷ N</>)}
        {term('N', 'total number of sample units in the section')}
        {term('A', 'number of additional sample units')}
        {term(<>PCI<Sub>r</Sub></>, '∑(PCI × area) ÷ ∑area for the random units')}
        {term(<>PCI<Sub>a</Sub></>, '∑(PCI × area) ÷ ∑area for the additional units')}
      </Step>
    </View>
    <View style={[styles.curveCell, styles.stepColumn]}>
      <Step n={2} palette={palette} title="Condition rating">
        {PCI_CONDITION_SCALE.map(condition => <View key={condition.rating} style={styles.ratingRow}>
          <View style={[styles.swatch, { backgroundColor: dark ? condition.darkColor : condition.color }]} />
          <Text style={[styles.stepText, styles.ratingName, { color: palette.text }]}>{condition.rating}</Text>
          <Text style={[styles.stepText, { color: palette.text }]}>{condition.range.replace('–', ' to ')}</Text>
        </View>)}
      </Step>
    </View>
  </View>;
}

/** The ASTM D6433-07 correction procedure (§9.5), step by step, with the CDV curve values read so far. */
function Step({ n, title, palette, children }: { n: number; title: string; palette: AdminPalette; children: ReactNode }) {
  return <AdminPanel palette={palette}>
    <View style={styles.stepHead}>
      <View style={[styles.stepNumber, { backgroundColor: brand.navy }]}><Text style={styles.stepNumberText}>{n}</Text></View>
      <Text accessibilityRole="header" style={[styles.stepTitle, { color: palette.text }]}>{title}</Text>
    </View>
    <View style={styles.stepBody}>{children}</View>
  </AdminPanel>;
}

function CorrectedCurves({ palette, stacked }: { palette: AdminPalette; stacked: boolean }) {
  const text = [styles.stepText, { color: palette.text }];
  const strong = styles.strong;
  const formula = (value: string) => <View style={[styles.formula, styles.formulaLeft, { backgroundColor: palette.blueSoft }]}><Text style={[styles.formulaText, { color: palette.text }]}>{value}</Text></View>;
  return <View style={[styles.curveRow, stacked && styles.stack]}>
    <View style={[styles.curveCell, styles.stepColumn]}>
      <Step n={1} palette={palette} title="When is correction needed?">
        <Text style={text}>Count the deduct values above 2.0. This number is called <Text style={strong}>q</Text>.</Text>
        <View style={[styles.branch, { borderColor: palette.border }]}>
          <Text style={[styles.branchTitle, { color: palette.text }]}>q is 0 or 1: no correction</Text>
          {formula('Max CDV = TDV')}
          <Text style={[styles.dialogMeta, { color: palette.muted }]}>TDV is the total deduct value, or the single largest deduct value.</Text>
        </View>
        <View style={[styles.branch, { borderColor: palette.border }]}>
          <Text style={[styles.branchTitle, { color: palette.text }]}>q is 2 or more: correct it</Text>
          <Text style={[styles.dialogMeta, { color: palette.muted }]}>Follow steps 2 to 5.</Text>
        </View>
      </Step>
      <Step n={2} palette={palette} title="Allowable number of deducts (m)">
        {formula('m = 1 + (9 ÷ 98) × (100 − HDV)')}
        <Text style={text}><Text style={strong}>HDV</Text> is the highest deduct value. Arrange the deduct values from highest to lowest first.</Text>
        <Text style={text}><Text style={strong}>m</Text> can never be more than 10.</Text>
      </Step>
      <Step n={3} palette={palette} title="Use only the allowed deducts">
        <Table palette={palette} head={['Compare m with the number of deduct values', 'Use']} rows={[
          ['Fewer deduct values than m', 'All of them'],
          ['More deduct values than m', 'The whole number part of m, then the decimal part × the next deduct value'],
          ['m is a whole number', 'Exactly that many, with no decimal part'],
        ]} strongFirst />
      </Step>
      <Step n={4} palette={palette} title="Reduce the deducts and find the CDV (repeat)">
        {[
          <>Add the deduct values to get the <Text style={strong}>total deduct value (TDV)</Text>.</>,
          <>Count the deduct values above 2.0. This is <Text style={strong}>q</Text>.</>,
          <>Read the <Text style={strong}>CDV</Text> on the curve, using the TDV and the line for q.</>,
          <>Change the <Text style={strong}>smallest deduct value above 2.0</Text> to 2.0.</>,
          <><Text style={strong}>Repeat</Text> from step 1 until q is 1.</>,
        ].map((line, index) => <Text key={index} style={text}>{index + 1}. {line}</Text>)}
      </Step>
    </View>

    <View style={[styles.curveCell, styles.stepColumn]}>
      <AdminPanel palette={palette} title="CDV curves">
        <Text style={[styles.dialogMeta, { color: palette.muted }]}>Corrected deduct value (CDV)</Text>
        <View accessibilityLabel="CDV curve image not loaded yet" style={[styles.figure, { borderColor: palette.border, backgroundColor: palette.panelAlt }]}>
          <Text style={[styles.figureText, { color: palette.muted }]}>Curve image not loaded yet</Text>
          <Text style={[styles.figureText, { color: palette.muted }]}>ASTM D6433-07 Fig. X3.26</Text>
        </View>
        <Text style={[styles.dialogMeta, styles.axisLabel, { color: palette.muted }]}>Total deduct value (TDV)</Text>
      </AdminPanel>
      <AdminPanel palette={palette} title="Curve points">
        <View style={[styles.distressRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.distressHead, styles.densityCell, { color: palette.muted }]}>TDV</Text>
          {CDV_PREVIEW_Q.map(q => <Text key={q} style={[styles.distressHead, styles.pointCell, { color: palette.muted }]}>q={q}</Text>)}
        </View>
        {CDV_PREVIEW_ROWS.map(row => <View key={row.tdv} style={[styles.distressRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.distressCell, styles.densityCell, styles.distressName, { color: palette.text }]}>{row.tdv}</Text>
          {row.cdv.map((value, index) => <Text key={CDV_PREVIEW_Q[index]} style={[styles.distressCell, styles.pointCell, { color: value === null ? palette.muted : palette.text }]}>{value ?? '—'}</Text>)}
        </View>)}
        <Text style={[styles.note, { color: palette.muted }]}>Provisional values read from a scan of Fig. X3.26 and rounded. Not approved by the civil engineer and never used in a calculation. A dash means the value is outside the traced range or not reliable. When q is 1, CDV equals TDV (up to 100).</Text>
      </AdminPanel>
      <Step n={5} palette={palette} title="Take the highest CDV">
        <Text style={text}>The <Text style={strong}>Max CDV</Text> is the highest CDV from all the repeats. It is used to get the PCI: PCI = 100 − Max CDV.</Text>
      </Step>
    </View>
  </View>;
}

/** Deduct value curves per distress. Values and the figure image stay empty until the licensed curves are approved and loaded. */
const curveDensities = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
function DeductCurves({ code, onChange, palette, stacked }: { code: number; onChange: (code: number) => void; palette: AdminPalette; stacked: boolean }) {
  const item = ASPHALT_CATALOG.find(entry => entry.code === code) ?? ASPHALT_CATALOG[0];
  const columns: { key: string; label: string }[] = item.severities.length
    ? item.severities.map(level => ({ key: level, label: levelNames[level as Level] }))
    : [{ key: 'none', label: 'Value' }];
  return <>
    <AdminPanel palette={palette} title="How density is computed">
      <View style={[styles.formula, { backgroundColor: palette.blueSoft }]}>
        <Text style={[styles.formulaText, { color: palette.text }]}>Density % = Q ÷ A × 100</Text>
      </View>
      <Text style={[styles.note, { color: palette.muted }]}>Q is the distress quantity and A is the sample unit area. The deduct value is read from the curve for the distress and its severity.</Text>
    </AdminPanel>
    <View style={[styles.curveRow, stacked && styles.stack]}>
      <View style={styles.curveCell}>
        <AdminPanel palette={palette} title="Curve points">
          <View style={[styles.distressRow, { borderBottomColor: palette.border }]}>
            <Text style={[styles.distressHead, styles.densityCell, { color: palette.muted }]}>Density</Text>
            {columns.map(column => <Text key={column.key} style={[styles.distressHead, styles.pointCell, { color: palette.muted }]}>{column.label}</Text>)}
          </View>
          {curveDensities.map(density => <View key={density} style={[styles.distressRow, { borderBottomColor: palette.border }]}>
            <Text style={[styles.distressCell, styles.densityCell, styles.distressName, { color: palette.text }]}>{density}</Text>
            {columns.map(column => <Text key={column.key} style={[styles.distressCell, styles.pointCell, { color: palette.muted }]}>—</Text>)}
          </View>)}
          <Text style={[styles.note, { color: palette.muted }]}>Points appear here once the licensed D6433-07 curves are reviewed and approved. LAKAD does not publish them in the app.</Text>
        </AdminPanel>
      </View>
      <View style={styles.curveCell}>
        <AdminPanel palette={palette}>
          <DistressPicker code={code} onChange={onChange} palette={palette} />
          <View accessibilityLabel={`${item.name} curve image not loaded yet`} style={[styles.figure, { borderColor: palette.border, backgroundColor: palette.panelAlt }]}>
            <Text style={[styles.figureText, { color: palette.muted }]}>Curve image not loaded yet</Text>
            <Text style={[styles.figureText, { color: palette.muted }]}>ASTM D6433-07 Fig. {item.figure}</Text>
          </View>
        </AdminPanel>
      </View>
    </View>
  </>;
}

function DistressPicker({ code, onChange, palette }: { code: number; onChange: (code: number) => void; palette: AdminPalette }) {
  const [open, setOpen] = useState(false);
  const current = ASPHALT_CATALOG.find(entry => entry.code === code) ?? ASPHALT_CATALOG[0];
  if (Platform.OS === 'web') {
    return <select aria-label="Distress type" onChange={event => onChange(Number(event.currentTarget.value))} value={code}
      style={{ alignSelf: 'flex-start', appearance: 'auto', background: palette.input, borderColor: palette.border, borderRadius: 9, borderStyle: 'solid', borderWidth: 1, color: palette.text, fontSize: 15, fontWeight: 600, minHeight: 42, padding: '0 12px' }}>
      {ASPHALT_CATALOG.map(entry => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
    </select>;
  }
  return <>
    <Pressable accessibilityLabel={`Distress type: ${current.name}`} accessibilityRole="button" onPress={() => setOpen(true)}
      style={[styles.pickerButton, { backgroundColor: palette.input, borderColor: palette.border }]}>
      <Text numberOfLines={1} style={[styles.pickerText, { color: palette.text }]}>{current.name}</Text>
      <Feather color={palette.muted} name="chevron-down" size={18} />
    </Pressable>
    <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close distress choices" accessibilityRole="button" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.dialog, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <ScrollView>
            {ASPHALT_CATALOG.map(entry => <Pressable key={entry.code} accessibilityRole="button" accessibilityState={{ selected: entry.code === code }} onPress={() => { onChange(entry.code); setOpen(false); }}
              style={[styles.pickerOption, { borderBottomColor: palette.border }]}>
              <Text style={[styles.pickerText, { color: palette.text, fontWeight: entry.code === code ? '700' : '400' }]}>{entry.name}</Text>
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

function TextLink({ label, a11y, onPress, color }: { label: string; a11y: string; onPress: () => void; color: string }) {
  return <Pressable accessibilityLabel={a11y} accessibilityRole="button" hitSlop={6} onPress={onPress}>
    {({ hovered }: { hovered?: boolean }) => <Text style={[styles.link, { color, textDecorationLine: hovered ? 'underline' : 'none' }]}>{label}</Text>}
  </Pressable>;
}

/** Criteria for one distress type: how to measure it, each severity level, and what it is not. */
function CriteriaDialog({ type, palette, onClose, onEdit }: { type: CatalogType | null; palette: AdminPalette; onClose: () => void; onEdit: (id: string) => void }) {
  if (!type) return null;
  const guidance = d07GuidanceFor(type.astm_edition, type.astm_code);
  const measure = d07MeasureFor(type.astm_edition, type.astm_code);
  const allowed = levels.filter(level => type.severity_required && type.allowed_severities.includes(level));
  const textFor = (level: Level) => guidance?.[level] ?? type.severity_descriptions?.[level];
  const howTo = measure?.measure ?? type.description;
  const year = /-(\d{2})$/.exec(type.astm_edition ?? '')?.[1];
  const changed = type.updated_at ? new Date(type.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Close criteria" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <ScrollView contentContainerStyle={styles.dialogBody}>
          <Text accessibilityRole="header" style={[styles.dialogTitle, { color: palette.text }]}>{type.name}</Text>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>How to measure</Text>
            <Text style={[styles.dialogText, { color: palette.text }]}>{howTo ?? 'Not written yet.'}{`
Measured in ${unitLabel(type.default_unit_of_measure)}.`}</Text>
            {guidance?.context ? <Text style={[styles.dialogText, { color: palette.muted }]}>{guidance.context}</Text> : null}
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Severity levels</Text>
            {allowed.length ? allowed.map(level => <View key={level} style={[styles.criterion, { borderColor: palette.border }]}>
              <View style={[styles.levelPill, { backgroundColor: levelColors[level].bg }]}><Text style={[styles.levelPillText, { color: levelColors[level].fg }]}>{levelNames[level]}</Text></View>
              <Text style={[styles.dialogText, styles.criterionCopy, { color: palette.text }]}>{textFor(level) ?? 'Not written yet.'}</Text>
            </View>) : <Text style={[styles.dialogText, { color: palette.text }]}>{guidance?.none ?? 'This distress has no severity levels.'}</Text>}
          </View>
          {measure?.confuse.length ? <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Do not confuse with</Text>
            {measure.confuse.map(item => <Text key={item.name} style={[styles.dialogText, { color: palette.text }]}><Text style={styles.confuseName}>{item.name}: </Text>{item.difference}</Text>)}
          </View> : null}
          {guidance || measure ? <Text style={[styles.dialogMeta, { color: palette.muted }]}>Short field cues checked against ASTM D6433-07 Appendix X1. Provisional until reviewed by the civil engineer.</Text> : null}
        </ScrollView>
        <View style={[styles.dialogFooter, { borderTopColor: palette.border }]}>
          <Text style={[styles.dialogMeta, styles.footerMeta, { color: palette.muted }]}>{year ? `20${year} edition` : type.astm_edition ?? 'Custom type'}{changed ? ` • Last changed ${changed}` : ''}</Text>
          <View style={styles.footerActions}>
            <AdminButton label="Close" onPress={onClose} palette={palette} tone="secondary" />
            <AdminButton icon="edit-2" label="Edit" onPress={() => onEdit(type.id)} palette={palette} />
          </View>
        </View>
      </View>
    </View>
  </Modal>;
}

function describeChange(row: AuditRow) {
  if (row.action === 'distress_reference_saved') {
    const code = typeof row.detail?.code === 'string' ? row.detail.code : 'a distress type';
    return `Saved distress type ${code}${row.detail?.active === false ? ' (inactive)' : ''}`;
  }
  return 'Updated reference settings';
}

function Table({ palette, head, rows, strongFirst = false }: { palette: AdminPalette; head: string[]; rows: string[][]; strongFirst?: boolean }) {
  return <View>
    <Row palette={palette} cells={head} head />
    {rows.map((cells) => <Row key={cells.join('|')} palette={palette} cells={cells} strongFirst={strongFirst} />)}
  </View>;
}

function Row({ palette, cells, head = false, strongFirst = false, selected = false, onPress }: {
  palette: AdminPalette; cells: string[]; head?: boolean; strongFirst?: boolean; selected?: boolean; onPress?: () => void;
}) {
  const content = cells.map((cell, index) => <Text key={index} style={[styles.cell, index === 0 && styles.firstCell, {
    color: head ? palette.muted : palette.text,
    fontWeight: !head && strongFirst && index === 0 ? '700' : '400',
  }]}>{cell}</Text>);
  const style = [styles.row, { borderBottomColor: palette.border }, selected && { backgroundColor: palette.blueSoft }];
  if (!onPress) return <View accessibilityRole={head ? 'header' : undefined} style={style}>{content}</View>;
  return <Pressable accessibilityLabel={`Edit ${cells[1]}`} accessibilityRole="button" onPress={onPress}
    style={({ hovered }: { hovered?: boolean }) => [...style, hovered && !selected && { backgroundColor: palette.panelAlt }]}>{content}</Pressable>;
}

function SwitchRow({ palette, title, text, value, onChange, disabled }: { palette: AdminPalette; title: string; text: string; value: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return <View style={[styles.switchRow, { borderBottomColor: palette.border }]}>
    <View style={styles.switchCopy}>
      <Text style={[styles.switchTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.switchText, { color: palette.muted }]}>{text}</Text>
    </View>
    <Switch disabled={disabled} onValueChange={onChange} value={value} trackColor={{ false: palette.border, true: palette.blue }} />
  </View>;
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
  summaryItems: { flex: 1, flexDirection: 'row', gap: 40, minWidth: 260 },
  wrap: { flexWrap: 'wrap', rowGap: 14 },
  summaryItem: { gap: 4, minWidth: 120 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 17, fontWeight: '700' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tab: { borderRadius: 10, justifyContent: 'center', minHeight: 42, paddingHorizontal: 16 },
  tabText: { fontSize: 15, fontWeight: '600' },
  pressed: { transform: [{ scale: 0.97 }] },
  stack: { alignItems: 'stretch', flexDirection: 'column' },
  main: { flex: 1, gap: 16, minWidth: 0 },
  row: { borderBottomWidth: 1, flexDirection: 'row', gap: 16, paddingVertical: 12 },
  cell: { flex: 1, fontSize: 15, lineHeight: 21, minWidth: 0 },
  firstCell: { flex: 1.2 },
  note: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  swatch: { borderRadius: 4, height: 18, width: 18 },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  ratingName: { flex: 1 },
  distressRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 44, paddingVertical: 6 },
  distressHead: { fontSize: 15 },
  distressCell: { fontSize: 15 },
  distressName: { fontWeight: '700' },
  badges: { flexDirection: 'row', gap: 3 },
  badge: { alignItems: 'center', borderRadius: 4, height: 22, justifyContent: 'center', width: 22 },
  badgeText: { fontSize: 13, fontWeight: '800' },
  links: { flexDirection: 'row', gap: 16 },
  link: { fontSize: 15 },
  backdrop: { alignItems: 'center', backgroundColor: layout.scrim, flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { borderRadius: 16, borderWidth: 1, maxHeight: '85%', maxWidth: 560, width: '100%' },
  dialogBody: { gap: 20, padding: 24 },
  dialogTitle: { fontSize: 20, fontWeight: '800' },
  dialogMeta: { fontSize: 13, lineHeight: 19 },
  dialogText: { fontSize: 14.5, lineHeight: 21 },
  stepColumn: { gap: 16 },
  stepHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  stepNumber: { alignItems: 'center', borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  stepNumberText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stepTitle: { fontSize: 17, fontWeight: '700' },
  stepBody: { gap: 10, marginTop: 12 },
  stepText: { fontSize: 14.5, lineHeight: 22 },
  strong: { fontWeight: '700' },
  branch: { borderTopWidth: 1, gap: 8, paddingTop: 10 },
  branchTitle: { fontSize: 15.5, fontWeight: '700' },
  formulaLeft: { alignItems: 'flex-start' },
  axisLabel: { marginTop: 8, textAlign: 'center' },
  formula: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  formulaText: { fontSize: 20, fontWeight: '700' },
  curveRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 16 },
  curveCell: { flex: 1, minWidth: 0 },
  densityCell: { flex: 1 },
  pointCell: { flex: 1 },
  figure: { alignItems: 'center', aspectRatio: 1.5, borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, gap: 4, justifyContent: 'center', marginTop: 12 },
  figureText: { fontSize: 14 },
  pickerButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 42, paddingHorizontal: 12 },
  pickerText: { fontSize: 15 },
  pickerOption: { borderBottomWidth: 1, paddingHorizontal: 20, paddingVertical: 14 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  criterion: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingTop: 10 },
  criterionCopy: { flex: 1 },
  levelPill: { alignItems: 'center', borderRadius: 999, minWidth: 80, paddingHorizontal: 14, paddingVertical: 5 },
  levelPillText: { fontSize: 13, fontWeight: '700' },
  confuseName: { fontWeight: '700' },
  dialogFooter: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14 },
  footerMeta: { flexShrink: 1 },
  footerActions: { flexDirection: 'row', gap: 10 },
  form: { gap: 14 },
  formRow: { flexDirection: 'row', gap: 14 },
  formCell: { flex: 1 },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  severityChoice: { borderRadius: 8, borderWidth: 1, minHeight: 42, minWidth: 88, paddingHorizontal: 14, paddingVertical: 11 },
  switchRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 12 },
  switchCopy: { flex: 1 },
  switchTitle: { fontSize: 14.5, fontWeight: '700' },
  switchText: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
});
