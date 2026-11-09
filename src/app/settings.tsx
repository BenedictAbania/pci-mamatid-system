import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View, type TextStyle } from 'react-native';

import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { PageControls } from '@/components/workflow/pagination';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { ASPHALT_CATALOG, RULES } from '@/lib/d6433-07/catalog';
import { d07MeasureFor } from '@/lib/d6433-07/measure-guidance';
import { d07GuidanceFor } from '@/lib/d6433-07/severity-guidance';
import { newPhotoFolder, photoSlots, REFERENCE_PHOTO_BUCKET, removeReferencePhotos, slotPath, uploadReferencePhoto, type PhotoSlot, type PhotoSlotKey, type SeverityPhotos } from '@/lib/data/reference-photos';
import { supabase } from '@/lib/data/supabase';
import { callWorkflow, type CatalogType } from '@/lib/data/workflow-data';
import { PCI_CONDITION_SCALE } from '@/lib/pci/pci-classification';
import { SAMPLE_UNIT_MAX_AREA, SAMPLE_UNIT_MIN_AREA, SAMPLE_UNIT_TARGET_AREA } from '@/lib/pci/pci-service';
import { roleLabels } from '@/lib/auth/access';
import { brand, layout } from '@/lib/ui/design-system';
import { useAppTheme } from '@/providers/ThemeProvider';

type Tab = 'parameters' | 'distress' | 'dv' | 'cdv' | 'pci' | 'history';
const tabs: { id: Tab; label: string }[] = [
  { id: 'parameters', label: 'Parameters' },
  { id: 'distress', label: 'Distress Types' },
  { id: 'dv', label: 'Deduct Value Curves' },
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


type AuditRow = { id: string; action: string; actor_id: string | null; target_id: string | null; detail: Record<string, unknown> | null; created_at: string };
/** Who made a change: from the admin-only account list, so the email and role are shown too. */
type Person = { name: string; email: string | null; role: string };
type HistoryState = { rows: AuditRow[]; people: Map<string, Person>; error: string };

export default function ReferenceDataScreen() {
  const palette = useAdminPalette();
  const { colorScheme } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const { data, loading, busy, error, message, refresh, run, pagination } = useWorkflow();
  // The distress rows get exactly the room left in the window, so only the table scrolls, not the page.
  // Measured: where the rows start, and how much of the panel sits below them (pagination, padding).
  const tableRef = useRef<ComponentRef<typeof View>>(null);
  const tablePanelRef = useRef<ComponentRef<typeof View>>(null);
  const [tableFit, setTableFit] = useState({ top: 420, below: 40 });
  const measureTable = () => {
    tableRef.current?.measureInWindow((_x: number, top: number, _w: number, rowsHeight: number) => {
      tablePanelRef.current?.measureInWindow((_px: number, panelTop: number, _pw: number, panelHeight: number) => {
        const below = Math.max(0, panelTop + panelHeight - (top + rowsHeight));
        setTableFit((current) => (Math.abs(current.top - top) < 1 && Math.abs(current.below - below) < 1 ? current : { top, below }));
      });
    });
  };
  const PAGE_BOTTOM_PADDING = 44 + 4; // AdminShell content paddingBottom, plus a little slack.
  const tableHeight = Math.max(200, height - tableFit.top - tableFit.below - PAGE_BOTTOM_PADDING);
  const compact = width < 1100;
  const dark = colorScheme === 'dark';
  const [tab, setTab] = useState<Tab>('parameters');
  const [editorOpen, setEditorOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState | null>(null);
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
  /** Wording per severity level, shown in the editor; prefilled with the saved or built-in text. */
  const [severityText, setSeverityText] = useState<Record<Level, string>>({ low: '', medium: '', high: '' });
  /** Photo changes waiting for Save: new picks, removals and ASTM restores, per slot. */
  const [photoEdits, setPhotoEdits] = useState<Partial<Record<PhotoSlotKey, PhotoEdit>>>({});

  const loadHistory = useCallback(async () => {
    const { data: rows, error: failure } = await supabase.from('lakad_audit')
      .select('id,action,actor_id,target_id,detail,created_at')
      .in('action', ['settings_updated', 'distress_reference_saved'])
      .order('created_at', { ascending: false }).limit(25);
    if (failure) { setHistory({ rows: [], people: new Map(), error: 'Change history could not be loaded.' }); return; }
    // Names, emails and roles of the people who made the changes (admin-only list, a few pages at most).
    const people = new Map<string, Person>();
    let after: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const reply = await supabase.rpc('lakad_accounts_page', { page_after: after, page_size: 50 });
      if (reply.error || !Array.isArray(reply.data)) break;
      const accounts = reply.data as { id: string; full_name: string | null; email: string | null; role: string }[];
      for (const account of accounts) {
        people.set(account.id, { name: account.full_name || 'Unnamed user', email: account.email, role: account.role });
      }
      if (accounts.length < 50) break;
      after = accounts[accounts.length - 1].id;
    }
    setHistory({ rows: (rows ?? []) as AuditRow[], people, error: '' });
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
    setSeverityText({ low: '', medium: '', high: '' });
    setPhotoEdits({});
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
    setPhotoEdits({});
    const builtIn = d07GuidanceFor(reference.astm_edition, reference.astm_code);
    setSeverityText({
      low: reference.severity_descriptions?.low ?? builtIn?.low ?? '',
      medium: reference.severity_descriptions?.medium ?? builtIn?.medium ?? '',
      high: reference.severity_descriptions?.high ?? builtIn?.high ?? '',
    });
  };

  /** Only wording that differs from the built-in cue is saved, so built-in text keeps following its version. */
  const severityDescriptionsPayload = () => {
    const reference = referenceId ? data?.types.find((item) => item.id === referenceId) : undefined;
    const builtIn = reference ? d07GuidanceFor(reference.astm_edition, reference.astm_code) : undefined;
    const result: Partial<Record<Level, string>> = {};
    if (!severityRequired) return result;
    for (const level of levels) {
      const text = severityText[level].trim();
      if (allowedSeverities.includes(level) && text && text !== builtIn?.[level]) result[level] = text;
    }
    return result;
  };

  const toggleSeverity = (severity: string) => {
    setAllowedSeverities((current) => current.includes(severity) ? current.filter((item) => item !== severity) : [...current, severity]);
  };

  const editingType = referenceId ? data?.types.find((item) => item.id === referenceId) : undefined;
  const editorSlots = photoSlots(
    { astm_edition: editingType?.astm_edition, astm_code: editingType?.astm_code },
    severityRequired ? levels.filter((level) => allowedSeverities.includes(level)) : [],
  );

  /** Uploads newly picked photos and works out the saved photo choices. Returns what to clean up afterwards. */
  const applyPhotoEdits = async () => {
    const saved: SeverityPhotos = editingType?.severity_photos ?? {};
    const next: SeverityPhotos = { ...saved };
    const uploaded: string[] = [];
    const folder = referenceId ?? newPhotoFolder();
    try {
      for (const slot of editorSlots) {
        const edit = photoEdits[slot.key];
        if (!edit) continue;
        if (edit.kind === 'new') {
          const path = await uploadReferencePhoto(edit.uri, folder, slot.key);
          uploaded.push(path);
          next[slot.key] = path;
        } else if (edit.kind === 'remove') next[slot.key] = null;
        else delete next[slot.key];
      }
    } catch (reason) {
      await removeReferencePhotos(uploaded);
      throw reason;
    }
    const kept = new Set(Object.values(next));
    return { next, uploaded, replaced: Object.values(saved).filter((path) => path && !kept.has(path)) };
  };

  const handleSaveReference = () => {
    void run(async () => {
      const photos = await applyPhotoEdits();
      try {
        await saveReference(photos.next);
      } catch (reason) {
        await removeReferencePhotos(photos.uploaded);
        throw reason;
      }
      await removeReferencePhotos(photos.replaced);
    }, `Distress type ${referenceId ? 'updated' : 'added'}.`).then((saved) => {
      setHistory(null);
      // Close only on success; a failed save keeps the dialog open with its message and the typed values.
      if (saved) { setEditorOpen(false); resetReference(); }
    });
  };

  const saveReference = (severityPhotos: SeverityPhotos) => callWorkflow('lakad_save_distress_type', {
      target: referenceId,
      payload: {
        code: referenceCode,
        name: referenceName,
        description: referenceDescription,
        default_unit_of_measure: referenceUnit,
        severity_required: severityRequired,
        allowed_severities: severityRequired ? allowedSeverities : [],
        is_active: referenceActive,
        severity_descriptions: severityDescriptionsPayload(),
        severity_photos: severityPhotos,
      },
    });

  /** Distress types are the only reference data an admin can change: Add and per-row Edit open the editor dialog. */
  const openAdd = () => { resetReference(); setTab('distress'); setEditorOpen(true); };
  const openEdit = (id: string) => { editReference(id); setTab('distress'); setEditorOpen(true); };
  const closeEditor = () => { if (busy) return; setEditorOpen(false); resetReference(); };

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
            <View collapsable={false} onLayout={measureTable} ref={tablePanelRef}>
            <AdminPanel palette={palette}>
              {/* Distress types are the only reference data stored in the database, so Add and Edit live here only. */}
              <View style={styles.panelHead}>
                <View style={styles.panelHeadText}>
                  <Text accessibilityRole="header" style={[styles.panelHeadTitle, { color: palette.text }]}>Distress Types for Asphalt</Text>
                </View>
                <AdminButton label="Add Distress" onPress={openAdd} palette={palette} />
              </View>
              {/* Five columns need about 640 px; narrower screens scroll the table sideways, like the other tables. */}
              {types.length ? <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}><View style={{ minWidth: 640, flex: 1 }}>
                <View style={[styles.distressRow, { borderBottomColor: palette.border }]}>
                  {['#', 'Distress type', 'Measured in', 'Severity levels', 'Criteria'].map((label, index) => <Text key={label} style={[styles.distressHead, distressColumns[index], { color: palette.muted }]}>{label}</Text>)}
                </View>
                {/* Header stays put; only the rows scroll, so the page itself does not grow with the list. */}
                <View collapsable={false} onLayout={measureTable} ref={tableRef}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: tableHeight }}>
                {types.map((type, index) => <View key={type.id} style={[styles.distressRow, { borderBottomColor: palette.border }]}>
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
                    <TextLink label="Edit" a11y={`Edit ${type.name}`} onPress={() => openEdit(type.id)} color={palette.blue} />
                  </View>
                </View>)}
                </ScrollView>
                </View>
              </View></ScrollView> : <Text style={[styles.note, { color: palette.muted }]}>No distress types yet. Press Add Distress to add one.</Text>}
              <PageControls {...pagination} />
            </AdminPanel>
            </View>
          </> : null}

          {tab === 'dv' ? <DeductCurves code={curveCode} onChange={setCurveCode} palette={palette} /> : null}

          {tab === 'cdv' ? <CorrectedCurves palette={palette} stacked={compact} /> : null}

          {tab === 'pci' ? <PciComputation dark={dark} palette={palette} stacked={compact} /> : null}

          {tab === 'history' ? (
            <AdminPanel palette={palette} title="Change History">
              {!history ? <Text style={[styles.note, { color: palette.muted }]}>Loading changes…</Text>
                : history.error ? <Notice error>{history.error}</Notice>
                : history.rows.length ? <View>
                  {!compact ? <View accessibilityRole="header" style={[styles.row, { borderBottomColor: palette.border }]}>
                    {['Date', 'Changed by', 'Change'].map((label, index) => <Text key={label} style={[styles.cell, historyColumns[index], { color: palette.muted }]}>{label}</Text>)}
                  </View> : null}
                  {history.rows.map((row) => <HistoryRow key={row.id} compact={compact} palette={palette} row={row}
                    person={(row.actor_id && history.people.get(row.actor_id)) || null}
                    fallbackName={(row.actor_id && names.get(row.actor_id)) || 'Unknown user'}
                    types={types} />)}
                </View>
                : <Text style={[styles.note, { color: palette.muted }]}>No reference data changes yet.</Text>}
            </AdminPanel>
          ) : null}
      </View>

      <CriteriaDialog type={criteria} palette={palette} onClose={() => setCriteria(null)} onEdit={(id) => { setCriteria(null); openEdit(id); }} />
      {/* Add / edit distress type: same dialog shell as the criteria view, with editable content. */}
      <Modal animationType="fade" onRequestClose={closeEditor} transparent visible={editorOpen}>
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="Close distress type editor" accessibilityRole="button" onPress={closeEditor} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.dialog, styles.editorDialog, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <ScrollView contentContainerStyle={styles.dialogBody} keyboardShouldPersistTaps="handled">
              <View>
                <Text accessibilityRole="header" style={[styles.dialogTitle, { color: palette.text }]}>{referenceId ? `Edit ${referenceName || 'distress type'}` : 'Add Distress Type'}</Text>
                <Text style={[styles.dialogMeta, { color: palette.muted }]}>{referenceId ? 'Change the details below, then update.' : 'Fill in the details of the new asphalt distress type.'}</Text>
              </View>
              {error ? <Notice error>{error}</Notice> : null}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Details</Text>
                <View style={[styles.formRow, compact && styles.stack]}>
                  <View style={styles.formCell}><AdminField editable={!canonical} label="Code" onChangeText={setReferenceCode} palette={palette} placeholder="e.g. AC-01" value={referenceCode} /></View>
                  <View style={styles.formCell}><AdminField label="Distress name" onChangeText={setReferenceName} palette={palette} placeholder="Validated asphalt distress name" value={referenceName} /></View>
                </View>
                <AdminField label="How to measure / description" multiline onChangeText={setReferenceDescription} palette={palette} placeholder="How inspectors identify and measure it in the field" value={referenceDescription} />
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Measurement and severity</Text>
                {canonical ? <Notice>ASTM D6433-07 fixes the unit and severities for this type: {referenceUnit} · {allowedSeverities.join(', ') || 'no severity'}. You can change its name, description and status.</Notice> : <>
                  <Choices label="Measurement unit" onChange={setReferenceUnit} options={[{ label: 'Area (m²)', value: 'm²' }, { label: 'Length (m)', value: 'm' }, { label: 'Count (No.)', value: 'No.' }]} value={referenceUnit} />
                  <SwitchRow palette={palette} title="Severity is required" text="Inspectors must pick one of the allowed severity levels." value={severityRequired} onChange={setSeverityRequired} disabled={busy} />
                  {severityRequired ? <View style={styles.severityRow}>{['low', 'medium', 'high'].map((severity) => {
                    // Same light-to-dark brand blues as the L, M and H badges in the table.
                    const level = severity as Level;
                    const label = levelNames[level];
                    const selected = allowedSeverities.includes(severity);
                    return <Pressable accessibilityLabel={`${label} severity`} accessibilityRole="checkbox" aria-checked={selected} key={severity} onPress={() => toggleSeverity(severity)}
                      style={[styles.severityChoice, { backgroundColor: selected ? levelColors[level].bg : palette.panel, borderColor: selected ? levelColors[level].bg : palette.border }]}>
                      <Text style={[styles.severityChoiceText, { color: selected ? levelColors[level].fg : palette.text }]}>{label}</Text>
                    </Pressable>;
                  })}</View> : null}
                </>}
              </View>

              {severityRequired && allowedSeverities.length ? <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Severity levels</Text>
                <Text style={[styles.dialogMeta, { color: palette.muted }]}>What inspectors see when they choose a level. Leave the built-in wording, or write your own (up to 600 characters).</Text>
                {levels.filter((level) => allowedSeverities.includes(level)).map((level) => <View key={level} style={[styles.criterion, styles.criterionEdit, { borderColor: palette.border }]}>
                  <View style={[styles.levelPill, { backgroundColor: levelColors[level].bg }]}><Text style={[styles.levelPillText, { color: levelColors[level].fg }]}>{levelNames[level]}</Text></View>
                  <TextInput
                    accessibilityLabel={`${levelNames[level]} severity description`}
                    maxLength={600}
                    multiline
                    onChangeText={(value) => setSeverityText((current) => ({ ...current, [level]: value }))}
                    placeholder={`How ${levelNames[level].toLowerCase()} severity looks in the field`}
                    placeholderTextColor={palette.muted}
                    style={[styles.severityInput, { backgroundColor: palette.input, borderColor: palette.border, color: palette.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                    value={severityText[level]}
                  />
                </View>)}
              </View> : null}

              <PhotoEditor busy={busy} edits={photoEdits} palette={palette} saved={editingType?.severity_photos} slots={editorSlots} typeName={referenceName}
                onChange={(key, edit) => setPhotoEdits((current) => { const next = { ...current }; if (edit) next[key] = edit; else delete next[key]; return next; })} />

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Status</Text>
                <SwitchRow palette={palette} title="Active for field entry" text="Inactive types stay on past records but cannot be picked for new ones." value={referenceActive} onChange={setReferenceActive} disabled={busy} />
              </View>
            </ScrollView>
            <View style={[styles.dialogFooter, { borderTopColor: palette.border }]}>
              <Text style={[styles.dialogMeta, styles.footerMeta, { color: palette.muted }]}>{canonical ? 'ASTM D6433-07 type' : referenceId ? 'Custom type' : 'New type'}</Text>
              <View style={styles.footerActions}>
                <AdminButton disabled={busy} label="Cancel" onPress={closeEditor} palette={palette} tone="secondary" />
                <AdminButton disabled={busy} label={busy ? 'Saving…' : referenceId ? 'Update Distress' : 'Add Distress Type'} onPress={handleSaveReference} palette={palette} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
        <CurveFigure figure="X3.26" name="CDV" palette={palette} />
        <Text style={[styles.dialogMeta, styles.axisLabel, { color: palette.muted }]}>Total deduct value (TDV)</Text>
      </AdminPanel>
      <Step n={5} palette={palette} title="Take the highest CDV">
        <Text style={text}>The <Text style={strong}>Max CDV</Text> is the highest CDV from all the repeats. It is used to get the PCI: PCI = 100 − Max CDV.</Text>
      </Step>
    </View>
  </View>;
}

/** Deduct value curves per distress. The figure image comes from the private 'astm-figures' bucket. */
function DeductCurves({ code, onChange, palette }: { code: number; onChange: (code: number) => void; palette: AdminPalette }) {
  const item = ASPHALT_CATALOG.find(entry => entry.code === code) ?? ASPHALT_CATALOG[0];
  return <>
    <AdminPanel palette={palette} title="How density is computed">
      <View style={[styles.formula, { backgroundColor: palette.blueSoft }]}>
        <Text style={[styles.formulaText, { color: palette.text }]}>Density % = Q ÷ A × 100</Text>
      </View>
      <Text style={[styles.note, { color: palette.muted }]}>Q is the distress quantity and A is the sample unit area. The deduct value is read from the curve for the distress and its severity.</Text>
    </AdminPanel>
    <AdminPanel palette={palette}>
      <DistressPicker code={code} onChange={onChange} palette={palette} />
      <CurveFigure key={item.figure} figure={item.figure} name={item.name} palette={palette} />
    </AdminPanel>
  </>;
}

/**
 * ASTM D6433-07 figure from the private 'astm-figures' bucket (admin only, see
 * supabase/migrations/20261108170000_astm_figures.sql). Fig. X3.1 is stored as d6433-07/X3_01.png.
 */
function CurveFigure({ figure, name, palette }: { figure: string; name: string; palette: AdminPalette }) {
  const path = `d6433-07/X3_${figure.replace('X3.', '').padStart(2, '0')}.png`;
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    supabase.storage.from('astm-figures').createSignedUrl(path, 3600).then(
      ({ data, error }) => { if (live) setState({ path, url: data?.signedUrl ?? null, failed: !!error || !data?.signedUrl }); },
      () => { if (live) setState({ path, url: null, failed: true }); },
    );
    return () => { live = false; };
  }, [path]);
  const current = state?.path === path ? state : null;
  if (current?.url) {
    return <View style={[styles.figure, styles.figureLoaded, { borderColor: palette.border }]}>
      <Image accessibilityLabel={`${name} curve, ASTM D6433-07 Fig. ${figure}`} onError={() => setState({ path, url: null, failed: true })}
        resizeMode="contain" source={{ uri: current.url }} style={styles.figureImage} />
    </View>;
  }
  return <View accessibilityLabel={`${name} curve image ${current?.failed ? 'not available' : 'loading'}`} style={[styles.figure, { borderColor: palette.border, backgroundColor: palette.panelAlt }]}>
    <Text style={[styles.figureText, { color: palette.muted }]}>{current?.failed ? 'Curve image not available' : 'Loading curve image…'}</Text>
    <Text style={[styles.figureText, { color: palette.muted }]}>ASTM D6433-07 Fig. {figure}</Text>
  </View>;
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

/** Signed links (1 hour) for private 'astm-figures' files; null while loading, a missing file maps to null. */
function useSignedUrls(paths: string[]) {
  const key = paths.join('|');
  const [state, setState] = useState<{ key: string; byPath: Record<string, string | null> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const list = key.split('|');
    supabase.storage.from(REFERENCE_PHOTO_BUCKET).createSignedUrls(list, 3600).then(
      ({ data }) => {
        if (!live) return;
        const byPath: Record<string, string | null> = Object.fromEntries(list.map((path) => [path, null]));
        for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) byPath[item.path] = item.signedUrl;
        setState({ key, byPath });
      },
      () => { if (live) setState({ key, byPath: {} }); },
    );
    return () => { live = false; };
  }, [key]);
  if (!key) return {};
  return state?.key === key ? state.byPath : null;
}

function slotCaption(slot: PhotoSlot, typeName: string) {
  return slot.level ? `${slot.label} severity` : `${typeName}: ${slot.label.toLowerCase()}`;
}

function SlotLabel({ slot, palette }: { slot: PhotoSlot; palette: AdminPalette }) {
  return slot.level
    ? <View style={[styles.levelPill, styles.photoPill, { backgroundColor: levelColors[slot.level].bg }]}><Text style={[styles.levelPillText, { color: levelColors[slot.level].fg }]}>{slot.label}</Text></View>
    : <Text style={[styles.dialogMeta, styles.photoCaption, { color: palette.muted }]}>{slot.label}</Text>;
}

/** A photo tile: the image (tap to enlarge), or an empty box saying why there is none. */
function PhotoTile({ url, state, label, palette, onOpen }: { url: string | null; state: 'loading' | 'none' | 'missing'; label: string; palette: AdminPalette; onOpen: (url: string) => void }) {
  if (url) {
    return <Pressable accessibilityHint="Opens a larger view" accessibilityLabel={`${label} reference photo`} accessibilityRole="imagebutton" onPress={() => onOpen(url)}
      style={({ hovered }: { hovered?: boolean }) => [styles.photoTile, { borderColor: hovered ? palette.blue : palette.border }]}>
      <Image resizeMode="cover" source={{ uri: url }} style={styles.photoImage} />
    </Pressable>;
  }
  const text = state === 'loading' ? 'Loading…' : state === 'none' ? 'No photo' : 'Not available';
  return <View accessibilityLabel={`${label} reference photo: ${text}`} style={[styles.photoTile, styles.photoEmpty, { borderColor: palette.border, backgroundColor: palette.panelAlt }]}>
    <Feather color={palette.muted} name="image" size={20} />
    <Text style={[styles.photoEmptyText, { color: palette.muted }]}>{text}</Text>
  </View>;
}

function PhotoViewer({ photo, palette, onClose }: { photo: { url: string; label: string } | null; palette: AdminPalette; onClose: () => void }) {
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={!!photo}>
    <View style={styles.photoBackdrop}>
      <Pressable accessibilityLabel="Close photo" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      {photo ? <View style={[styles.photoViewer, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <Image accessibilityLabel={`${photo.label} reference photo`} resizeMode="contain" source={{ uri: photo.url }} style={styles.photoViewerImage} />
        <View style={styles.photoViewerFoot}>
          <Text style={[styles.dialogMeta, styles.footerMeta, { color: palette.text }]}>{photo.label}</Text>
          <AdminButton label="Close" onPress={onClose} palette={palette} tone="secondary" />
        </View>
      </View> : null}
    </View>
  </Modal>;
}

/**
 * View criteria: the reference photo of each severity level (src/lib/data/reference-photos.ts). ASTM D6433-07
 * Appendix X1 photos unless an administrator replaced or removed one.
 */
function ReferencePhotos({ type, allowed, palette }: { type: CatalogType; allowed: Level[]; palette: AdminPalette }) {
  const slots = photoSlots(type, allowed);
  const paths = slots.map((slot) => slotPath(slot, type.severity_photos));
  const urls = useSignedUrls(paths.filter((path): path is string => !!path));
  const [enlarged, setEnlarged] = useState<{ url: string; label: string } | null>(null);
  const anyAstm = slots.some((slot, index) => paths[index] && paths[index] === slot.astmPath);
  const anyCustom = paths.some((path) => path?.startsWith('custom/'));
  return <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>Reference photos</Text>
    <View style={styles.photoRow}>
      {slots.map((slot, index) => {
        const path = paths[index];
        const caption = slotCaption(slot, type.name);
        return <View key={slot.key} style={[styles.photoCell, slots.length === 1 && styles.photoCellSingle]}>
          <PhotoTile label={`${type.name}, ${caption}`} onOpen={(url) => setEnlarged({ url, label: `${type.name} — ${caption}` })} palette={palette}
            state={!path ? 'none' : urls ? 'missing' : 'loading'} url={path && urls ? urls[path] ?? null : null} />
          <SlotLabel palette={palette} slot={slot} />
        </View>;
      })}
    </View>
    <Text style={[styles.dialogMeta, { color: palette.muted }]}>
      {[anyAstm ? 'Example photos from ASTM D6433-07 Appendix X1.' : null, anyCustom ? 'Some photos were replaced by an administrator.' : null, paths.some(Boolean) ? 'Tap a photo to enlarge it.' : 'Add photos with Edit.'].filter(Boolean).join(' ')}
    </Text>
    <PhotoViewer onClose={() => setEnlarged(null)} palette={palette} photo={enlarged} />
  </View>;
}

/** A pending change to one photo slot in the editor; applied when the distress type is saved. */
type PhotoEdit = { kind: 'new'; uri: string } | { kind: 'remove' } | { kind: 'restore' };

/** Editor: change, remove or restore the reference photo of each slot. Nothing is uploaded until Save. */
function PhotoEditor({ slots, saved, edits, onChange, busy, palette, typeName }: {
  slots: PhotoSlot[]; saved: SeverityPhotos | null | undefined; edits: Partial<Record<PhotoSlotKey, PhotoEdit>>;
  onChange: (key: PhotoSlotKey, edit: PhotoEdit | null) => void; busy: boolean; palette: AdminPalette; typeName: string;
}) {
  const [enlarged, setEnlarged] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState('');
  const storedPaths = slots.map((slot) => {
    const edit = edits[slot.key];
    if (edit?.kind === 'restore') return slot.astmPath;
    if (edit) return null;
    return slotPath(slot, saved);
  });
  const urls = useSignedUrls(storedPaths.filter((path): path is string => !!path));

  async function pick(key: PhotoSlotKey) {
    setError('');
    try {
      // Imported up front: an on-demand import() of the picker failed in the web build.
      const picked = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], mediaTypes: ['images'], quality: 0.9 });
      if (picked.canceled) return;
      // Compressed when the distress type is saved, like profile and inspection photos.
      onChange(key, { kind: 'new', uri: picked.assets[0].uri });
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? `The photo could not be opened: ${reason.message}` : 'The photo picker is unavailable on this device.');
    }
  }

  return <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>Reference photos</Text>
    <Text style={[styles.dialogMeta, { color: palette.muted }]}>Photos are compressed before upload and saved when you update. The original ASTM photos are kept, so you can restore them at any time.</Text>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={styles.photoRow}>
      {slots.map((slot, index) => {
        const edit = edits[slot.key];
        const stored = storedPaths[index];
        const current = edit?.kind === 'new' ? 'new' : stored ? (stored === slot.astmPath ? 'astm' : 'custom') : 'none';
        const url = edit?.kind === 'new' ? edit.uri : stored && urls ? urls[stored] ?? null : null;
        const caption = slotCaption(slot, typeName || 'New distress type');
        const restorable = !!slot.astmPath && current !== 'astm';
        return <View key={slot.key} style={[styles.photoCell, slots.length === 1 && styles.photoCellSingle]}>
          <PhotoTile label={caption} onOpen={(open) => setEnlarged({ url: open, label: caption })} palette={palette}
            state={!stored && current !== 'new' ? 'none' : urls ? 'missing' : 'loading'} url={url} />
          <SlotLabel palette={palette} slot={slot} />
          <Text style={[styles.photoStatus, { color: current === 'new' ? palette.blue : palette.muted }]}>
            {current === 'new' ? 'New photo, saved on update' : current === 'astm' ? 'ASTM photo' : current === 'custom' ? 'Uploaded photo' : 'No photo'}
          </Text>
          <View style={styles.photoActions}>
            <TextLink a11y={`${current === 'none' ? 'Add' : 'Change'} ${caption} photo`} color={palette.blue} label={current === 'none' ? 'Add' : 'Change'} onPress={() => { if (!busy) void pick(slot.key); }} />
            {current !== 'none' ? <TextLink a11y={`Remove ${caption} photo`} color={palette.red} label="Remove" onPress={() => { if (!busy) onChange(slot.key, slotPath(slot, saved) ? { kind: 'remove' } : null); }} /> : null}
            {restorable ? <TextLink a11y={`Restore the ASTM ${caption} photo`} color={palette.blue} label="Restore ASTM" onPress={() => { if (!busy) onChange(slot.key, slotPath(slot, saved) === slot.astmPath ? null : { kind: 'restore' }); }} /> : null}
          </View>
        </View>;
      })}
    </View>
    <PhotoViewer onClose={() => setEnlarged(null)} palette={palette} photo={enlarged} />
  </View>;
}

/** Criteria for one distress type: how to measure it, each severity level, and what it is not. */
function CriteriaDialog({ type, palette, onClose, onEdit }: { type: CatalogType | null; palette: AdminPalette; onClose: () => void; onEdit: (id: string) => void }) {
  if (!type) return null;
  const guidance = d07GuidanceFor(type.astm_edition, type.astm_code);
  const measure = d07MeasureFor(type.astm_edition, type.astm_code);
  const allowed = levels.filter(level => type.severity_required && type.allowed_severities.includes(level));
  const textFor = (level: Level) => type.severity_descriptions?.[level]?.trim() || guidance?.[level];
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
          <ReferencePhotos allowed={allowed} palette={palette} type={type} />
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

const historyColumns = [{ flex: 1 }, { flex: 1.3 }, { flex: 2.6 }];
const SEVERITY_ORDER = ['low', 'medium', 'high'];
/** Fields of a distress type snapshot, in the order the History tab lists them. */
const DISTRESS_FIELDS: { key: string; label: string; show: (value: unknown) => string }[] = [
  { key: 'code', label: 'Code', show: (value) => String(value ?? '—') },
  { key: 'name', label: 'Name', show: (value) => String(value ?? '—') },
  { key: 'description', label: 'Description', show: (value) => (typeof value === 'string' && value ? (value.length > 90 ? `“${value.slice(0, 90)}…”` : `“${value}”`) : 'none') },
  { key: 'default_unit_of_measure', label: 'Measured in', show: (value) => String(value ?? '—') },
  { key: 'severity_required', label: 'Severity required', show: (value) => (value ? 'Yes' : 'No') },
  { key: 'allowed_severities', label: 'Severity levels', show: (value) => {
    const levels = Array.isArray(value) ? [...value].map(String).sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)) : [];
    return levels.length ? levels.map((level) => level.charAt(0).toUpperCase() + level.slice(1)).join(', ') : 'None';
  } },
  { key: 'is_active', label: 'Status', show: (value) => (value === false ? 'Inactive' : 'Active') },
  ...(['low', 'medium', 'high'] as const).map((level) => ({
    key: `severity_descriptions.${level}`,
    label: `${level.charAt(0).toUpperCase() + level.slice(1)} description`,
    show: (value: unknown) => (typeof value === 'string' && value ? (value.length > 90 ? `“${value.slice(0, 90)}…”` : `“${value}”`) : 'built-in wording'),
  })),
];
const PHOTO_FIELDS = (['low', 'medium', 'high', 'single'] as const).map((slot) => ({
  key: `severity_photos.${slot}`,
  label: slot === 'single' ? 'Reference photo' : `${slot.charAt(0).toUpperCase() + slot.slice(1)} photo`,
}));
/** "uploaded photo", "no photo" or "ASTM photo" for one saved photo choice. */
const photoState = (snapshot: Snapshot, key: string) => {
  const photos = fieldValue(snapshot, 'severity_photos');
  const slot = key.split('.')[1];
  if (!photos || typeof photos !== 'object' || !Object.prototype.hasOwnProperty.call(photos, slot)) return { raw: undefined as unknown, text: 'ASTM photo' };
  const raw = (photos as Snapshot)[slot];
  return { raw, text: typeof raw === 'string' ? 'uploaded photo' : 'no photo' };
};
/** Photo lines for History: added, removed, restored or replaced per slot. */
function photoChanges(before: Snapshot | null, after: Snapshot) {
  return PHOTO_FIELDS.flatMap((field) => {
    const from = before ? photoState(before, field.key) : { raw: undefined, text: 'ASTM photo' };
    const to = photoState(after, field.key);
    if (JSON.stringify(from.raw) === JSON.stringify(to.raw)) return [];
    if (from.text === to.text) return [`${field.label}: replaced`];
    return [`${field.label}: ${from.text} → ${to.text}`];
  });
}
/** Reads "a.b" keys from a saved snapshot. */
const fieldValue = (snapshot: Snapshot, key: string) => key.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Snapshot)[part] : undefined), snapshot);

type Snapshot = Record<string, unknown>;
const asSnapshot = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Snapshot : null);

/** A title and one line per changed value. Older saves only recorded the code, so they say so. */
function describeChange(row: AuditRow, types: CatalogType[]): { title: string; lines: string[] } {
  const detail = row.detail ?? {};
  if (row.action === 'distress_reference_saved') {
    const code = typeof detail.code === 'string' ? detail.code : null;
    const name = (typeof detail.name === 'string' && detail.name) || types.find((type) => type.id === row.target_id)?.name || null;
    const label = name && code ? `${name} (${code})` : name ?? code ?? 'a distress type';
    const before = asSnapshot(detail.before);
    const after = asSnapshot(detail.after);
    if (detail.created === true && after) {
      return { title: `Added distress type ${label}`, lines: [...DISTRESS_FIELDS.filter((field) => field.key !== 'name' && field.key !== 'code' && !(field.key.startsWith('severity_descriptions.') && !fieldValue(after, field.key))).map((field) => `${field.label}: ${field.show(fieldValue(after, field.key))}`), ...photoChanges(null, after).filter((line) => !line.includes('→ ASTM photo'))] };
    }
    if (before && after) {
      const lines = DISTRESS_FIELDS
        .filter((field) => field.show(fieldValue(before, field.key)) !== field.show(fieldValue(after, field.key)))
        .map((field) => `${field.label}: ${field.show(fieldValue(before, field.key))} → ${field.show(fieldValue(after, field.key))}`)
        .concat(photoChanges(before, after));
      return { title: `Updated distress type ${label}`, lines: lines.length ? lines : ['Saved with no changes.'] };
    }
    return {
      title: `Saved distress type ${label}`,
      lines: [`${detail.active === false ? 'Status: Inactive. ' : ''}Field-by-field details were not recorded for this older change.`],
    };
  }
  const entries = Object.entries(detail).filter(([, value]) => value !== null && typeof value !== 'object');
  return { title: 'Updated reference settings', lines: entries.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`) };
}

function HistoryRow({ row, person, fallbackName, types, palette, compact }: {
  row: AuditRow; person: Person | null; fallbackName: string; types: CatalogType[]; palette: AdminPalette; compact: boolean;
}) {
  const when = new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const change = describeChange(row, types);
  const who = person?.name ?? fallbackName;
  const roleLabel = person ? (roleLabels as Record<string, string>)[person.role] ?? person.role : null;
  return <View accessibilityLabel={`${when}, ${who}: ${change.title}. ${change.lines.join('. ')}`} style={[styles.row, compact && styles.historyRowStack, { borderBottomColor: palette.border }]}>
    <Text style={[styles.cell, historyColumns[0], compact && styles.historyCellStack, { color: palette.muted }]}>{when}</Text>
    <View style={[historyColumns[1], compact && styles.historyCellStack]}>
      <Text style={[styles.cell, styles.historyStrong, { color: palette.text }]}>{who}</Text>
      {person?.email || roleLabel ? <Text style={[styles.historyMeta, { color: palette.muted }]}>{[person?.email, roleLabel].filter(Boolean).join(' · ')}</Text> : null}
    </View>
    <View style={[historyColumns[2], compact && styles.historyCellStack]}>
      <Text style={[styles.cell, styles.historyStrong, { color: palette.text }]}>{change.title}</Text>
      {change.lines.map((line) => <View key={line} style={styles.historyLine}>
        <Text style={[styles.historyMeta, { color: palette.muted }]}>•</Text>
        <Text style={[styles.historyMeta, styles.historyLineText, { color: palette.text }]}>{line}</Text>
      </View>)}
    </View>
  </View>;
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
    {/* Brand royal track with a white thumb; activeThumbColor is the web prop (the default there is teal). */}
    <Switch disabled={disabled} onValueChange={onChange} value={value} thumbColor="#FFFFFF" trackColor={{ false: palette.border, true: palette.action }} {...({ activeThumbColor: '#FFFFFF' } as object)} />
  </View>;
}

const styles = StyleSheet.create({
  panelHead: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 15 },
  panelHeadText: { flexShrink: 1, minWidth: 200 },
  panelHeadTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  panelHeadSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 3 },
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
  historyRowStack: { flexDirection: 'column', gap: 6 },
  historyCellStack: { flex: 0 },
  historyStrong: { flex: 0, fontWeight: '700' },
  historyMeta: { fontSize: 13, lineHeight: 19 },
  historyLine: { flexDirection: 'row', gap: 6, marginTop: 2 },
  historyLineText: { flex: 1 },
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
  editorDialog: { maxHeight: '92%', maxWidth: 640 },
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
  // Figures are black on white scans, so they sit on white in both themes.
  figureLoaded: { backgroundColor: '#FFFFFF', borderStyle: 'solid', overflow: 'hidden', padding: 8 },
  figureImage: { height: '100%', width: '100%' },
  pickerButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 42, paddingHorizontal: 12 },
  pickerText: { fontSize: 15 },
  pickerOption: { borderBottomWidth: 1, paddingHorizontal: 20, paddingVertical: 14 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  criterion: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingTop: 10 },
  criterionCopy: { flex: 1 },
  levelPill: { alignItems: 'center', borderRadius: 999, minWidth: 80, paddingHorizontal: 14, paddingVertical: 5 },
  levelPillText: { fontSize: 13, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { alignItems: 'center', flexBasis: 140, flexGrow: 1, gap: 8, maxWidth: 200 },
  photoCellSingle: { maxWidth: 320 },
  photoTile: { aspectRatio: 4 / 3, borderRadius: 12, borderWidth: 1, overflow: 'hidden', width: '100%' },
  photoImage: { height: '100%', width: '100%' },
  photoEmpty: { alignItems: 'center', borderStyle: 'dashed', gap: 6, justifyContent: 'center' },
  photoEmptyText: { fontSize: 12 },
  photoPill: { minWidth: 90 },
  photoCaption: { textAlign: 'center' },
  photoStatus: { fontSize: 12, textAlign: 'center' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  photoBackdrop: { alignItems: 'center', backgroundColor: 'rgba(6, 15, 46, 0.78)', flex: 1, justifyContent: 'center', padding: 20 },
  photoViewer: { borderRadius: 16, borderWidth: 1, gap: 12, maxWidth: 820, overflow: 'hidden', padding: 14, width: '100%' },
  photoViewerImage: { aspectRatio: 4 / 3, borderRadius: 10, maxHeight: 620, width: '100%' },
  photoViewerFoot: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  confuseName: { fontWeight: '700' },
  dialogFooter: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14 },
  footerMeta: { flexShrink: 1 },
  footerActions: { flexDirection: 'row', gap: 10 },
  form: { gap: 14 },
  formRow: { flexDirection: 'row', gap: 14 },
  formCell: { flex: 1 },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  severityChoice: { alignItems: 'center', borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 42, minWidth: 88, paddingHorizontal: 14, paddingVertical: 11 },
  severityChoiceText: { fontWeight: '700', textAlign: 'center' },
  criterionEdit: { alignItems: 'flex-start' },
  severityInput: { borderRadius: 9, borderWidth: 1, flex: 1, fontSize: 14.5, lineHeight: 21, minHeight: 64, minWidth: 0, paddingHorizontal: 12, paddingVertical: 9, textAlignVertical: 'top' },
  switchRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 12 },
  switchCopy: { flex: 1 },
  switchTitle: { fontSize: 14.5, fontWeight: '700' },
  switchText: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
});
