import { useRef, useState, type ComponentRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AdminButton, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { CatalogDropdown, Notice } from '@/components/workflow/shared';
import { brand, layout } from '@/lib/ui/design-system';
import { normalizeDistressSeverity } from '@/lib/pci/severity-colors';
import { SAMPLE_UNIT_MAX_AREA, SAMPLE_UNIT_MIN_AREA, validateMeasurement } from '@/lib/pci/pci-service';
import { EDITION, type Unit } from '@/lib/d6433-07/catalog';
import { d07GuidanceFor, d07GuidanceSnapshot, type SeverityCode } from '@/lib/d6433-07/severity-guidance';
import { measureParts, partToDraft, type MeasurementPart, type PartDraft } from '@/lib/d6433-07/measurement-parts';
import { calculateProvisional, finishInspection, reloadSample, startInspection, submitReport, workflowAction, type FinishDetails, type InspectionPreview, type Sample, type WorkflowData } from '@/lib/data/workflow-data';
import { InspectionResults, currentOutput } from '@/components/workflow/inspection-results';
import { distressLabel, photoGroups, PhotoGroups, type PhotoGroup } from '@/components/workflow/distress-photos';
import { removeInspectionPhoto, uploadInspectionPhoto } from '@/lib/data/inspection-photos';
import { useAuth } from '@/providers/AuthProvider';

/** Inspection progress shown above the entry form. Later steps are not built yet. */
export const INSPECTION_PROGRESS = ['Sample Unit', 'Distress Data', 'Deduct Values', 'MDV', 'PCI Computation', 'PCI Rating'] as const;
const SEVERITIES: SeverityCode[] = ['low', 'medium', 'high'];
const SEVERITY_LETTERS: Record<SeverityCode, string> = { low: 'L', medium: 'M', high: 'H' };

type Run = (task: () => Promise<unknown>, success?: string) => Promise<boolean>;

/** Positive finite number, or null while the field is empty or incomplete. */
function positive(raw: string) {
  const value = Number(raw);
  return raw.trim() && Number.isFinite(value) && value > 0 ? value : null;
}
export function formatNumber(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Encoder distress entry for one sample unit.
 * Card 1 measures the sample unit itself (length × width = sample area). Card 2 records a distress:
 * its type, severity and measured part. Each "Add distress" saves one measured part; parts of the same
 * distress type and severity join one saved record, so the table lists one row per measured part.
 */
export function DistressEntry({ sample, data, busy, run, error, onRefresh }: {
  sample: Sample; data: WorkflowData; busy: boolean; run: Run; error?: string;
  onRefresh?: () => Promise<unknown>;
}) {
  const p = useAdminPalette();
  const { width } = useWindowDimensions();
  const { role, user } = useAuth();
  const wide = width >= layout.columns;
  const editable = role === 'encoder' && sample.assigned_to === user?.id && ['planned', 'draft', 'returned'].includes(sample.workflow_state);
  const [sampleLength, setSampleLength] = useState('');
  const [sampleWidth, setSampleWidth] = useState('');
  const [typeId, setTypeId] = useState('');
  const [severity, setSeverity] = useState<SeverityCode | ''>('');
  const [length, setLength] = useState('');
  const [breadth, setBreadth] = useState('');
  const [count, setCount] = useState('');
  const [diameter, setDiameter] = useState('');
  const [depth, setDepth] = useState('');
  /** The table row being edited: its saved record and the index of the measured part. */
  const [editing, setEditing] = useState<{ recordId: string; index: number } | null>(null);
  const [deleting, setDeleting] = useState<{ recordId: string; index: number; label: string } | null>(null);
  const [formHeight, setFormHeight] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pciPreview, setPciPreview] = useState<InspectionPreview | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const resultsRef = useRef<ComponentRef<typeof View>>(null);
  const [removing, setRemoving] = useState<{ id: string; photo_path: string; caption: string | null } | null>(null);
  const [photoError, setPhotoError] = useState('');

  const types = data.types.filter(t => t.is_active && t.astm_edition === EDITION).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  const type = types.find(t => t.id === typeId);
  const unit = (type?.default_unit_of_measure ?? 'm²') as Unit;
  const guidance = type ? d07GuidanceFor(type.astm_edition, type.astm_code) : undefined;
  const section = data.sections?.find(s => s.id === sample.section_id);
  const branch = data.branches?.find(b => b.id === section?.branch_id);
  const records = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const rows = records.flatMap(record => {
    const parts = record.measurement_details?.measurement_parts;
    return (parts?.length ? parts : [null]).map((part, index) => ({ key: `${record.id}-${index}`, record, part, index }));
  });

  // Sample unit area: length × width typed now, otherwise the saved area.
  const sampleLengthValue = positive(sampleLength), sampleWidthValue = positive(sampleWidth);
  const typedArea = sampleLengthValue && sampleWidthValue ? sampleLengthValue * sampleWidthValue : null;
  const shownArea = typedArea ?? (sample.area_sqm ? Number(sample.area_sqm) : null);

  const draft: PartDraft = unit === 'No.'
    ? { mode: 'small_pothole', length: '', width: '', area: '', count, diameter, depth }
    : unit === 'm' ? { mode: 'length', length, width: '', area: '', count: '', diameter: '', depth: '' }
      : { mode: 'rectangle', length, width: breadth, area: '', count: '', diameter: '', depth: '' };
  const lengthValue = positive(length), breadthValue = positive(breadth), countValue = positive(count);
  const preview = unit === 'No.' ? countValue : unit === 'm' ? lengthValue : lengthValue && breadthValue ? lengthValue * breadthValue : null;

  function clearMeasurement() {
    setLength(''); setBreadth(''); setCount(''); setDiameter(''); setDepth(''); setSeverity(''); setEditing(null);
  }

  /** Saves the sample unit area (length × width) with the inspection's other saved details. */
  async function saveArea() {
    if (typedArea === null) throw new Error('Enter the sample unit length and width.');
    const area = Math.round(typedArea * 100) / 100;
    if (area < SAMPLE_UNIT_MIN_AREA || area > SAMPLE_UNIT_MAX_AREA) throw new Error(`The sample unit area must be ${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m². ${formatNumber(area)} m² is outside that range.`);
    const started = sample.workflow_state === 'planned';
    const current = started ? await startInspection(sample) : sample;
    try {
      await workflowAction(current, 'save', {
        notes: current.inspection_notes ?? '', surveyed_at: current.surveyed_at?.slice(0, 10) ?? '',
        latitude: current.latitude?.toString() ?? '', longitude: current.longitude?.toString() ?? '',
        no_distress_confirmed: current.no_distress_confirmed, area_sqm: area,
        orientation_note: current.orientation_note ?? '', field_rules_confirmed: current.field_rules_confirmed ?? false,
      });
    } catch (reason) {
      if (started) await onRefresh?.();
      throw reason;
    }
  }

  /** Saves a record's measured parts, or removes the record when none are left. */
  async function commitParts(target: Sample, recordType: (typeof types)[number], level: SeverityCode | null, record: (typeof records)[number] | undefined, drafts: PartDraft[], others: (typeof records)) {
    if (!drafts.length) {
      await workflowAction(target, 'remove_distress', { id: record!.id });
      return;
    }
    const recordUnit = (recordType.default_unit_of_measure ?? 'm²') as Unit;
    const cue = d07GuidanceSnapshot(recordType.astm_code ?? -1, level, level ? recordType.severity_descriptions?.[level] : null);
    if (!cue) throw new Error('Severity guidance is unavailable for this distress. Ask the Civil Engineer before saving.');
    const measured = measureParts(drafts, recordUnit, level);
    const measurement = { distress_type_id: recordType.id, severity: level, quantity: measured.quantity, potholes: measured.potholes, unit_of_measure: recordType.default_unit_of_measure ?? '', location_m: record?.measurement_details?.location_m ?? null };
    const span = target.start_m !== null && target.end_m !== null ? target.end_m - target.start_m : null;
    validateMeasurement(measurement, recordType, Number(target.area_sqm), span, others.map(r => ({ ...r, location_m: r.measurement_details?.location_m ?? null })));
    await workflowAction(target, 'distress', {
      ...measurement, measurement_parts: measured.parts, id: record?.id ?? null, notes: record?.notes ?? '',
      severity_evidence: record?.measurement_details?.severity_evidence ?? null, severity_guidance: cue,
    });
  }

  /** Add distress, or Update distress when a table row is being edited. */
  async function saveDistress() {
    if (!type) throw new Error('Choose a distress type.');
    if (type.severity_required && !severity) throw new Error('Choose the description that matches what you observed.');
    const level = type.severity_required ? severity as SeverityCode : null;
    const destination = records.find(r => r.distress_type_id === type.id && (r.severity ?? null) === level);
    const source = editing ? records.find(r => r.id === editing.recordId) : undefined;
    const partsOf = (record: typeof destination) => record?.measurement_details?.measurement_parts;
    if (destination && !partsOf(destination)?.length) throw new Error('An earlier record of this distress has no saved measured parts. Open the full inspection form to correct it.');
    const started = sample.workflow_state === 'planned';
    // A planned unit starts on its first measurement; each action needs the fresh tokens of the last one.
    let target = started ? await startInspection(sample) : sample;
    try {
      if (source && editing && source.id === destination?.id) {
        // Same distress and severity: replace the edited part.
        const drafts = (partsOf(source) ?? []).map(partToDraft);
        drafts[editing.index] = draft;
        await commitParts(target, type, level, source, drafts, records.filter(r => r.id !== source.id));
        return;
      }
      if (source && editing) {
        // Type or severity changed: take the part out of its old record first.
        const sourceType = data.types.find(t => t.id === source.distress_type_id);
        if (!sourceType) throw new Error('The edited distress type is no longer available. Open the full inspection form to correct it.');
        const remaining = (partsOf(source) ?? []).map(partToDraft).filter((_, i) => i !== editing.index);
        await commitParts(target, sourceType, (source.severity ?? null) as SeverityCode | null, source, remaining, records.filter(r => r.id !== source.id));
        // The next action needs the revision tokens the first one produced.
        target = await reloadSample(target.id, 'updated');
      }
      const drafts = [...(partsOf(destination) ?? []).map(partToDraft), draft];
      await commitParts(target, type, level, destination, drafts, records.filter(r => r.id !== destination?.id && r.id !== source?.id));
    } catch (reason) {
      await onRefresh?.();
      throw reason;
    }
  }

  /** Delete one measured part; the record goes when its last part is deleted. */
  async function deletePart(recordId: string, index: number) {
    const record = records.find(r => r.id === recordId);
    const recordType = record ? data.types.find(t => t.id === record.distress_type_id) : undefined;
    if (!record || !recordType) throw new Error('This distress could not be found. Refresh and try again.');
    const parts = record.measurement_details?.measurement_parts ?? [];
    try {
      await commitParts(sample, recordType, (record.severity ?? null) as SeverityCode | null, record, parts.map(partToDraft).filter((_, i) => i !== index), records.filter(r => r.id !== record.id));
    } catch (reason) {
      await onRefresh?.();
      throw reason;
    }
  }

  /** Loads a table row into card 2 for editing. Only quick-entry parts (rectangle, length, small potholes) can be edited here. */
  function startEdit(record: (typeof records)[number], part: MeasurementPart, index: number) {
    setTypeId(record.distress_type_id);
    setSeverity((record.severity ?? '') as SeverityCode | '');
    setLength(''); setBreadth(''); setCount(''); setDiameter(''); setDepth('');
    if (part.mode === 'rectangle') { setLength(String(part.length_m)); setBreadth(String(part.width_m)); }
    else if (part.mode === 'length') setLength(String(part.length_m));
    else if (part.mode === 'small_pothole') { setCount(String(part.count)); setDiameter(String(part.diameter_mm)); setDepth(String(part.depth_mm)); }
    setEditing({ recordId: record.id, index });
    setDeleting(null);
  }

  const saved = currentOutput(sample, data);
  // An unsaved preview applies only to the revision it was computed from.
  const previewed = editable && pciPreview?.revision === sample.input_revision ? pciPreview.output : null;
  const output = saved ?? previewed;
  const computation = data.computations.find(c => c.id === sample.computation_id);
  const canCompute = role === 'encoder' && sample.assigned_to === user?.id && sample.workflow_state === 'submitted' && !saved && computation?.verification === 'pending';
  function showResults() {
    // Web: bring steps 3–6 into view. Native keeps the user's scroll position.
    if (Platform.OS === 'web') (resultsRef.current as unknown as HTMLElement | null)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  async function finish(details: FinishDetails) {
    try { setPciPreview(await finishInspection(sample, details)); }
    catch (reason) { await onRefresh?.(); throw reason; }
  }

  const sampleLabel = `Sample Unit ${sample.unit_number}`;
  const done = [sample.workflow_state !== 'planned', records.length > 0, !!output, !!output, !!output, !!output];
  const editingRow = editing ? rows.find(row => row.record.id === editing.recordId && row.index === editing.index) : undefined;
  const form = <View onLayout={event => { const h = Math.round(event.nativeEvent.layout.height); setFormHeight(current => (Math.abs(current - h) < 2 ? current : h)); }} style={{ gap: 16, width: wide ? 360 : '100%' }}>
    <Card palette={p} title="1. Sample Unit Information">
      {/* Same subheading style as "Distress type" in card 2. */}
      <Text accessibilityRole="header" style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Sample Unit Area</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field palette={p} label="Length (m)" accessibilityLabel="Sample unit length (m)" value={sampleLength} onChangeText={setSampleLength} editable={editable} />
        <Field palette={p} label="Width (m)" accessibilityLabel="Sample unit width (m)" value={sampleWidth} onChangeText={setSampleWidth} editable={editable} />
      </View>
      <ValueBox palette={p} label={`Sample unit area: ${shownArea === null ? 'not yet measured' : `${formatNumber(shownArea)} m²`}`} value={shownArea === null ? '' : formatNumber(shownArea)} unit="m²" />
      <Text style={{ color: p.muted, fontSize: 13 }}>
        {typedArea === null ? (sample.area_sqm ? 'Saved area shown. Enter a new length and width to change it.' : `Measure the sample unit. Its area must be ${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m².`) : `Must be ${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m².`}
      </Text>
      {editable && <AdminButton palette={p} tone="secondary" label="Save area" disabled={busy || typedArea === null} onPress={() => void (async () => { if (await run(saveArea, 'Sample unit area saved.')) { setSampleLength(''); setSampleWidth(''); } })()} />}
    </Card>

    <Card palette={p} title="2. Distress Data">
      {editingRow && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderLeftWidth: 4, borderColor: p.blue, backgroundColor: p.blueSoft }}>
        <Text style={{ color: p.text, flex: 1, fontWeight: '600' }}>Editing row {rows.indexOf(editingRow) + 1}. Change the values, then update.</Text>
      </View>}
      <CatalogDropdown label="Distress type" value={typeId} options={types.map(t => ({ value: t.id, label: t.name }))} onChange={id => { setTypeId(id); setSeverity(''); }} />
      {!types.length && <Notice>The active D6433-07 distress catalog is unavailable. Ask the Civil Engineer to check the reference data.</Notice>}
      {!!guidance?.context && <Text selectable style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>{guidance.context}</Text>}
      {/* Long severity descriptions scroll inside a fixed-height box instead of stretching the card. */}
      {type && type.severity_required && guidance && <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 240 }} contentContainerStyle={{ paddingRight: 4 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Observed condition" style={{ gap: 8 }}>
        {SEVERITIES.filter(level => guidance[level]).map(level => {
          const selected = severity === level;
          const text = type.severity_descriptions?.[level]?.trim() || guidance[level];
          return <Pressable key={level} accessibilityRole="radio" accessibilityLabel={text} aria-checked={selected} aria-disabled={!editable} disabled={!editable} onPress={() => setSeverity(level)}
            style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderColor: selected ? p.text : p.border, backgroundColor: selected ? p.tabActive : p.panel }}>
            <Text style={{ color: p.text, fontSize: 15, lineHeight: 21 }}>{text}</Text>
          </Pressable>;
        })}
        </View>
      </ScrollView>}
      {type && type.severity_required && guidance && <SeverityLevel palette={p} severity={severity} />}
      {type && type.severity_required && !guidance && <Notice>Severity descriptions are unavailable for this distress. Ask the Civil Engineer.</Notice>}
      {type && !type.severity_required && <Text style={{ color: p.muted, lineHeight: 20 }}>{guidance?.none ?? 'No severity level for this distress. Record the measured quantity.'}</Text>}

      <Text accessibilityRole="header" style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Distress Measurement</Text>
      {unit === 'No.' ? <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field palette={p} label="Count" value={count} onChangeText={setCount} editable={editable} />
          <Field palette={p} label="Diameter (mm)" value={diameter} onChangeText={setDiameter} editable={editable} />
          <Field palette={p} label="Depth (mm)" value={depth} onChangeText={setDepth} editable={editable} />
        </View>
        <Text style={{ color: p.muted, fontSize: 13 }}>Small holes only (100 to under 750 mm). Use the full inspection form for larger holes.</Text>
      </> : <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field palette={p} label="Length (m)" accessibilityLabel="Distress length (m)" value={length} onChangeText={setLength} editable={editable} />
        {unit === 'm²' && <Field palette={p} label="Width (m)" accessibilityLabel="Distress width (m)" value={breadth} onChangeText={setBreadth} editable={editable} />}
      </View>}
      <ValueBox palette={p} label={`Computed ${unit === 'm²' ? 'area' : 'quantity'}: ${preview === null ? 'not yet available' : `${formatNumber(preview)} ${unit}`}`} value={preview === null ? '' : formatNumber(preview)} unit={unit} />

      {editable && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ flexGrow: 1 }}>
          <AdminButton palette={p} label={editingRow ? 'Update distress' : 'Add distress'} disabled={busy || !type} onPress={() => void (async () => { if (await run(saveDistress, editingRow ? 'Distress updated.' : 'Distress added.')) clearMeasurement(); })()} />
        </View>
        {editingRow && <AdminButton palette={p} tone="secondary" label="Cancel edit" disabled={busy} onPress={clearMeasurement} />}
      </View>}
      {!editable && <Text style={{ color: p.muted }}>This inspection is {sample.workflow_state}. Distress entry is locked.</Text>}
      {!!error && <Notice error>{error}</Notice>}
    </Card>
  </View>;

  // Photos belong to a distress record: one type and severity in this sample unit.
  const groups = photoGroups(
    records.map(record => ({ id: record.id, label: distressLabel(data.types.find(t => t.id === record.distress_type_id)?.name ?? 'Saved distress', record.severity) })),
    data.photos.filter(photo => photo.sample_unit_id === sample.id),
  );
  async function addPhoto(group: PhotoGroup) {
    setPhotoError('');
    try {
      // Imported up front: an on-demand import() of the picker failed in the web build.
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (picked.canceled) return;
      await run(() => uploadInspectionPhoto(sample, picked.assets[0].uri, { caption: group.title, distressRecordId: group.recordId }), `Photo added to ${group.title}.`);
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : 'The photo picker is unavailable on this device.');
    }
  }
  const photos = <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>Distress photos</Text>
    <Text style={{ color: p.muted }}>{editable ? 'Add photos for each distress. Photos are compressed before upload and are optional.' : 'Photos recorded for each distress.'}</Text>
    {!!photoError && <Notice error>{photoError}</Notice>}
    {removing && <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: p.red, borderRadius: 8 }}>
      <Text style={{ color: p.text }}>Remove the photo &ldquo;{removing.caption || 'Pavement evidence'}&rdquo;? This deletes the file.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <AdminButton palette={p} tone="danger" label="Remove photo" disabled={busy} onPress={() => void (async () => { if (await run(() => removeInspectionPhoto(sample, removing), 'Photo removed.')) setRemoving(null); })()} />
        <AdminButton palette={p} tone="secondary" label="Keep photo" disabled={busy} onPress={() => setRemoving(null)} />
      </View>
    </View>}
    <PhotoGroups palette={p} groups={groups} busy={busy} onAdd={editable ? group => void addPhoto(group) : undefined}
      onRemove={editable ? photo => setRemoving(photo) : undefined} empty="Add a distress first. Each distress can have its own photos." />
  </View>;

  // Wide screens: the table is exactly as tall as cards 1 and 2 together; its rows scroll inside.
  const tableHeight = wide && formHeight > 0 ? formHeight : undefined;
  const table = <View style={{ flex: wide ? 1 : undefined, minWidth: 0, height: tableHeight, borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 14 }}>
    {deleting && <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: p.red, borderRadius: 8 }}>
      <Text style={{ color: p.text }}>Delete row {deleting.label}? This removes the measured part from the inspection.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <AdminButton palette={p} tone="danger" label="Delete" disabled={busy} onPress={() => void (async () => { if (await run(() => deletePart(deleting.recordId, deleting.index), 'Distress deleted.')) { setDeleting(null); if (editing?.recordId === deleting.recordId) clearMeasurement(); } })()} />
        <AdminButton palette={p} tone="secondary" label="Keep" disabled={busy} onPress={() => setDeleting(null)} />
      </View>
    </View>}
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }} style={{ flex: tableHeight ? 1 : undefined }}>
      <View accessibilityLabel="Recorded distresses" style={{ minWidth: 720, flex: 1, borderWidth: 1, borderColor: p.border, borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: brand.navy, paddingVertical: 10, paddingHorizontal: 8 }}>
          {DISTRESS_COLUMNS.map(column => <Text key={column.label} style={{ flex: column.flex, color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: column.align }}>{column.label}</Text>)}
        </View>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={tableHeight ? { flex: 1 } : { maxHeight: 420 }}>
          {rows.map((row, index) => {
            const name = data.types.find(t => t.id === row.record.distress_type_id)?.name ?? 'Saved distress';
            const quick = !!row.part && ['rectangle', 'length', 'small_pothole'].includes(row.part.mode);
            return <TableRow key={row.key} palette={p} index={index + 1} part={row.part} name={name}
              selected={editing?.recordId === row.record.id && editing.index === row.index}
              severity={row.record.severity ? SEVERITY_LETTERS[row.record.severity as SeverityCode] ?? row.record.severity : '—'}
              fallback={`${formatNumber(row.record.quantity)} ${row.record.unit_of_measure}`}
              onEdit={editable && quick && row.part ? () => startEdit(row.record, row.part!, row.index) : undefined}
              onDelete={editable && row.part ? () => { setDeleting({ recordId: row.record.id, index: row.index, label: `${index + 1} (${name})` }); } : undefined} />;
          })}
          {!rows.length && <Text style={{ color: p.muted, padding: 16, textAlign: 'center' }}>No distress added yet.</Text>}
        </ScrollView>
      </View>
    </ScrollView>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {editable && <AdminButton palette={p} icon="check-circle" label="Finish inspection" disabled={busy} onPress={() => { setConfirming(true); showResults(); }} />}
      {canCompute && <AdminButton palette={p} icon="activity" label="Compute PCI" disabled={busy} onPress={() => { showResults(); void run(() => calculateProvisional('sample', sample.id), 'PCI computed.'); }} />}
    </View>
  </View>;

  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Heading palette={p} title={branch?.name ?? 'Branch'} />
      <Heading palette={p} title={section?.name ?? 'Section'} />
      <Heading palette={p} title={sampleLabel} detail={sample.area_sqm ? `${formatNumber(sample.area_sqm)} m² · ${sample.workflow_state}` : sample.workflow_state} />
    </View>
    <InspectionProgress palette={p} done={done} />
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'flex-start' : 'stretch' }}>
      {form}
      {table}
    </View>
    {photos}
    <View ref={resultsRef}>
      <InspectionResults palette={p} sample={sample} data={data} output={output} busy={busy} confirming={confirming && editable}
        onCancel={() => setConfirming(false)}
        onConfirm={details => void (async () => { if (await run(() => finish(details), 'PCI computed. Review the results, then submit the report.')) setConfirming(false); })()} />
    </View>
    {!!previewed && <View style={{ gap: 10, alignItems: 'flex-start' }}>
      {!confirmSubmit
        ? <AdminButton palette={p} icon="send" label="Submit Report" disabled={busy} onPress={() => setConfirmSubmit(true)} />
        : <View style={{ gap: 10, padding: 14, borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, alignSelf: 'stretch' }}>
          <Text style={{ color: p.text, lineHeight: 22 }}>Submit this report to the Civil Engineer? Your distress entries become read-only and the PCI is saved with the report.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <AdminButton palette={p} label={busy ? 'Submitting…' : 'Confirm and submit'} disabled={busy} onPress={() => void (async () => { if (await run(async () => { try { await submitReport(sample); } catch (reason) { await onRefresh?.(); throw reason; } }, 'Report submitted for engineer review.')) { setConfirmSubmit(false); setPciPreview(null); } })()} />
            <AdminButton palette={p} tone="secondary" label="Cancel" disabled={busy} onPress={() => setConfirmSubmit(false)} />
          </View>
        </View>}
    </View>}
  </View>;
}

/** Steps 1–6 with a filled circle for each step that is done. */
export function InspectionProgress({ palette: p, done }: { palette: AdminPalette; done: boolean[] }) {
  return <View accessibilityLabel="Inspection progress" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
    {INSPECTION_PROGRESS.map((label, index) => <View key={label} accessibilityLabel={`${label}: ${done[index] ? 'done' : 'not done'}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexGrow: 1, minWidth: 150 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: done[index] ? p.text : p.muted, backgroundColor: done[index] ? p.tabActive : p.panel }} />
      <View style={{ flex: 1, borderBottomWidth: 1, borderColor: p.text, paddingBottom: 2 }}><Text style={{ color: p.text, fontSize: 14, textAlign: 'center' }}>{label}</Text></View>
    </View>)}
  </View>;
}

export const DISTRESS_COLUMNS = [
  { label: '#', flex: 0.5, align: 'center' as const },
  { label: 'Distress Type', flex: 2.4, align: 'left' as const },
  { label: 'Severity', flex: 1, align: 'center' as const },
  { label: 'Length', flex: 1.2, align: 'center' as const },
  { label: 'Width', flex: 1.2, align: 'center' as const },
  { label: 'Quantity', flex: 1.2, align: 'center' as const },
  { label: 'Action', flex: 1.4, align: 'center' as const },
];

export function TableRow({ palette: p, index, name, severity, part, fallback, selected, onEdit, onDelete, readOnly = false }: {
  palette: AdminPalette; index: number; name: string; severity: string; part: MeasurementPart | null; fallback: string;
  selected: boolean; onEdit?: () => void; onDelete?: () => void;
  /** Review tables have no Action column. */
  readOnly?: boolean;
}) {
  // Headers carry no units; each value shows its own unit (5 m², 8 m, 2 No.).
  const lengthText = part && 'length_m' in part ? `${formatNumber(part.length_m)} m` : '—';
  const widthText = part?.mode === 'rectangle' ? `${formatNumber(part.width_m)} m` : '—';
  const quantity = !part ? fallback
    : part.mode === 'rectangle' ? `${formatNumber(part.length_m * part.width_m)} m²`
      : part.mode === 'irregular' ? `${formatNumber(part.area_sqm)} m²`
        : part.mode === 'length' ? `${formatNumber(part.length_m)} m`
          : part.mode === 'small_pothole' ? `${part.count} No.` : `${formatNumber(part.area_sqm)} m² hole`;
  const cells = [String(index), name, severity, lengthText, widthText];
  return <View accessibilityLabel={`Row ${index}: ${name}, severity ${severity}, length ${lengthText}, width ${widthText}, ${quantity}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: selected ? p.blueSoft : undefined }}>
    {cells.map((cell, i) => <Text key={i} style={{ flex: DISTRESS_COLUMNS[i].flex, color: p.text, fontSize: 16, textAlign: DISTRESS_COLUMNS[i].align }}>{cell}</Text>)}
    <View style={{ flex: DISTRESS_COLUMNS[5].flex, alignItems: 'center' }}>
      <Text style={{ color: p.text, fontSize: 16, textAlign: 'center', backgroundColor: p.blueSoft, paddingVertical: 3, paddingHorizontal: 10, minWidth: 64 }}>{quantity}</Text>
    </View>
    {!readOnly && <View style={{ flex: DISTRESS_COLUMNS[6].flex, flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
      {onEdit ? <RowLink label="Edit" a11y={`Edit row ${index}, ${name}`} color={p.blue} onPress={onEdit} /> : null}
      {onDelete ? <RowLink label="Delete" a11y={`Delete row ${index}, ${name}`} color={p.red} onPress={onDelete} /> : null}
      {!onEdit && !onDelete ? <Text style={{ color: p.muted }}>—</Text> : null}
    </View>}
  </View>;
}

function RowLink({ label, a11y, color, onPress }: { label: string; a11y: string; color: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={a11y} accessibilityRole="button" hitSlop={6} onPress={onPress}>
    {({ hovered }: { hovered?: boolean }) => <Text style={{ color, fontSize: 15, fontWeight: '600', textDecorationLine: hovered ? 'underline' : 'none' }}>{label}</Text>}
  </Pressable>;
}

/** Same light-to-dark brand blues as the L, M and H badges in Settings. */
const SEVERITY_LEVEL_COLORS = {
  Low: { background: '#C9DAFF', text: brand.navy },
  Medium: { background: brand.royal, text: '#FFFFFF' },
  High: { background: brand.navy, text: '#FFFFFF' },
} as const;

/** "Severity Level: Low/Medium/High" under the severity choices, once one is selected. */
export function SeverityLevel({ palette: p, severity }: { palette: AdminPalette; severity: string }) {
  const label = normalizeDistressSeverity(severity);
  if (!label) return null;
  const colors = SEVERITY_LEVEL_COLORS[label];
  return <View accessibilityLabel={`Severity level: ${label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Severity Level:</Text>
    <View style={{ flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderColor: p.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, textAlign: 'center' }}>{label}</Text>
    </View>
  </View>;
}

/** Read-only number box with its unit, used for computed areas and quantities. */
export function ValueBox({ palette: p, label, value, unit }: { palette: AdminPalette; label: string; value: string; unit: string }) {
  return <View accessibilityLabel={label} style={{ flexDirection: 'row', borderWidth: 1, borderColor: p.border, borderRadius: 6, overflow: 'hidden', minHeight: 44 }}>
    <View style={{ flex: 1, backgroundColor: p.blueSoft, justifyContent: 'center', paddingHorizontal: 12 }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{value}</Text>
    </View>
    <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: p.border }}>
      <Text style={{ color: p.text, fontSize: 16 }}>{unit}</Text>
    </View>
  </View>;
}

export function Card({ palette: p, title, children }: { palette: AdminPalette; title: string; children: React.ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 14, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
    {children}
  </View>;
}

export function Heading({ palette: p, title, detail }: { palette: AdminPalette; title: string; detail?: string }) {
  return <View style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, paddingVertical: 16, paddingHorizontal: 24 }}>
    <Text numberOfLines={1} style={{ color: p.text, fontSize: 26, fontWeight: '700' }}>{title}</Text>
    {!!detail && <Text style={{ color: p.muted, marginTop: 2 }}>{detail}</Text>}
  </View>;
}

export function Field({ palette: p, label, accessibilityLabel, value, onChangeText, editable }: { palette: AdminPalette; label: string; accessibilityLabel?: string; value: string; onChangeText: (value: string) => void; editable: boolean }) {
  return <View style={{ flex: 1, minWidth: 0, gap: 4, justifyContent: 'flex-end' }}>
    <Text numberOfLines={1} style={{ color: p.text, fontSize: 13 }}>{label}</Text>
    <TextInput accessibilityLabel={accessibilityLabel ?? label} keyboardType="decimal-pad" inputMode="decimal" editable={editable} value={value} onChangeText={onChangeText}
      style={{ minHeight: 44, borderWidth: 1, borderColor: p.border, borderRadius: 4, paddingHorizontal: 10, color: p.text, backgroundColor: editable ? p.panel : p.panelAlt, fontSize: 16 }} />
  </View>;
}
