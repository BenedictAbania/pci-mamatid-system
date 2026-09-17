import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { AdminButton, AdminEmpty, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { ASPHALT_DISTRESSES, computePCI, type DistressEntry, type MeasurementUnit, type PCIResult } from '@/lib/pci-engine';
import { getPciCondition } from '@/lib/pci-classification';
import { REFERENCE_PENDING, validateMeasurement, type CalculationOutput } from '@/lib/pci-service';
import { getDistressSeverityColors, normalizeDistressSeverity } from '@/lib/severity-colors';
import { supabase } from '@/lib/supabase';
import { Photo, Sample, WorkflowData, workflowAction } from '@/lib/workflow-data';
import { useAuth } from '@/providers/AuthProvider';

const PRELIMINARY_RESULT_LABEL = 'Preliminary Result — Pending ASTM/Engineering Validation';

export default function FieldInspections() {
  const state = useWorkflow();
  const p = useAdminPalette();
  const { role, user } = useAuth();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const visibleSamples = state.data?.samples.filter(item => role === 'reviewer' ? item.reviewer_id === user?.id && item.assigned_to !== user?.id : role === 'encoder' ? item.assigned_to === user?.id : false) ?? [];
  const sample = visibleSamples.find(item => item.id === selected);
  const title = role === 'reviewer' ? 'Inspection Review' : 'Field Inspections';
  const subtitle = role === 'reviewer' ? 'Review submitted inspections assigned to you and record an independent decision.' : 'Start, save, correct, and submit your assigned sample-unit inspections.';
  return <AdminShell title={title} subtitle={subtitle} loading={state.loading} onRefresh={() => void state.refresh()} onSearchChange={setQuery} searchValue={query}>
    {!!state.error && <Notice error>{state.error}</Notice>}{!!state.message && <Notice>{state.message}</Notice>}
    <Notice>{REFERENCE_PENDING}. You may collect and review inputs; official approval requires a verified server calculation.</Notice>
    {state.data && <>
      <AdminPanel title="Inspection register" palette={p}>
        <View style={{ gap: 10 }}>{visibleSamples.filter(s => `${state.data?.sections.find(x => x.id === s.section_id)?.name} ${s.unit_number} ${s.workflow_state}`.toLowerCase().includes(query.toLowerCase())).map(s => <Pressable key={s.id} onPress={() => setSelected(s.id)} style={{ borderWidth: 1, borderColor: s.id === selected ? p.blue : p.border, backgroundColor: s.id === selected ? p.blueSoft : p.panel, borderRadius: 9, padding: 14, gap: 6 }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>{state.data?.sections.find(x => x.id === s.section_id)?.name} · SU-{String(s.unit_number).padStart(3, '0')}</Text>
          <Text style={{ color: p.muted }}>{s.workflow_state.toUpperCase()} · {s.sample_type ?? 'Unplanned'} · {s.area_sqm ?? '—'} m² · Revision {s.input_revision}</Text>
        </Pressable>)}</View>
        {!visibleSamples.length && <AdminEmpty palette={p} icon="clipboard" message={role === 'reviewer' ? 'No sample units are assigned to you for independent review.' : 'No sample units are assigned to you. A civil engineer must confirm a plan first.'} />}
      </AdminPanel>
      {sample && <InspectionEditor key={`${sample.id}-${sample.input_revision}-${sample.workflow_state}`} sample={sample} data={state.data} busy={state.busy} run={state.run} />}
    </>}
  </AdminShell>;
}

function InspectionEditor({ sample, data, busy, run }: { sample: Sample; data: WorkflowData; busy: boolean; run: (task: () => Promise<unknown>, success?: string) => Promise<void> }) {
  const p = useAdminPalette();
  const { role, user } = useAuth();
  const editable = role === 'encoder' && sample.assigned_to === user?.id && ['draft', 'returned'].includes(sample.workflow_state);
  const reviewer = role === 'reviewer' && sample.reviewer_id === user?.id && sample.assigned_to !== user?.id;
  const [notes, setNotes] = useState(sample.inspection_notes ?? '');
  const [date, setDate] = useState(sample.surveyed_at?.slice(0, 10) ?? todayLocal());
  const [latitude, setLatitude] = useState(sample.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(sample.longitude?.toString() ?? '');
  const [noDistress, setNoDistress] = useState(sample.no_distress_confirmed);
  const [typeId, setTypeId] = useState('');
  const [severity, setSeverity] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [distressNotes, setDistressNotes] = useState('');
  const [editingId, setEditingId] = useState('');
  const [comments, setComments] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoSelectionError, setPhotoSelectionError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const type = data.types.find(t => t.id === typeId);
  const distresses = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const computation = data.computations.find(c => c.id === sample.computation_id);
  const photos = data.photos.filter(photo => photo.sample_unit_id === sample.id);
  const preliminary = useMemo(() => buildPreliminaryResult(sample, data, distresses), [data, distresses, sample]);
  const dirty = notes !== (sample.inspection_notes ?? '') || date !== (sample.surveyed_at?.slice(0, 10) ?? todayLocal()) || latitude !== (sample.latitude?.toString() ?? '') || longitude !== (sample.longitude?.toString() ?? '') || noDistress !== sample.no_distress_confirmed;
  async function addDistress() {
    if (!type) throw new Error('Select an active distress type. An administrator must configure the catalog if it is empty.');
    const measurement = { distress_type_id: typeId, severity: (severity || null) as 'low' | 'medium' | 'high' | null, quantity: Number(quantity), unit_of_measure: type.default_unit_of_measure ?? '', location_m: location === '' ? null : Number(location) };
    validateMeasurement(measurement, type, Number(sample.area_sqm), sample.start_m !== null && sample.end_m !== null ? sample.end_m - sample.start_m : null, distresses.filter(d => d.id !== editingId).map(d => ({ ...d, location_m: d.measurement_details?.location_m ?? null })));
    await workflowAction(sample, 'distress', { ...measurement, id: editingId || null, notes: distressNotes });
  }
  async function save() {
    if (!isValidDateString(date)) throw new Error('Use a valid inspection date (YYYY-MM-DD).');
    if (date > todayLocal()) throw new Error('Inspection date cannot be in the future.');
    if ((latitude === '') !== (longitude === '')) throw new Error('Enter both coordinates or leave both empty.');
    if (latitude && (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 || !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180)) throw new Error('Enter valid latitude and longitude.');
    await workflowAction(sample, 'save', { notes, surveyed_at: date, latitude, longitude, no_distress_confirmed: noDistress });
  }
  async function choosePhoto() {
    setPhotoSelectionError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!picked.canceled) setSelectedPhoto(picked.assets[0]);
    } catch (reason) {
      setPhotoSelectionError(reason instanceof Error ? reason.message : 'The photograph picker is unavailable on this device.');
    }
  }
  async function uploadPhoto() {
    if (!selectedPhoto) throw new Error('Choose a photograph before uploading.');
    setPhotoUploading(true);
    try {
      if (selectedPhoto.fileSize && selectedPhoto.fileSize > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photograph up to 5 MB.');
      const response = await fetch(selectedPhoto.uri);
      const bytes = await response.arrayBuffer();
      const head = new Uint8Array(bytes);
      const detected = head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg' : head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71 ? 'image/png' : String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
      if (!detected || bytes.byteLength > 5 * 1024 * 1024 || !bytes.byteLength) throw new Error('Choose a JPEG, PNG or WebP photograph up to 5 MB.');
      const path = `${sample.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${detected.split('/')[1]}`;
      const { error } = await supabase.storage.from('sample-unit-photos').upload(path, bytes, { contentType: detected, upsert: false });
      if (error) throw new Error(`Photograph upload failed: ${error.message}`);
      try { await workflowAction(sample, 'photo', { path, caption }); }
      catch (reason) { await supabase.storage.from('sample-unit-photos').remove([path]); throw reason; }
      setSelectedPhoto(null);
      setCaption('');
    } finally {
      setPhotoUploading(false);
    }
  }
  async function removePhoto(photo: Photo) {
    await workflowAction(sample, 'remove_photo', { id: photo.id });
    const { error } = await supabase.storage.from('sample-unit-photos').remove([photo.photo_path]);
    if (error) throw new Error(`The photograph record was removed, but file cleanup failed: ${error.message}. Refresh to continue.`);
  }
  return <View style={{ gap: 16 }}>
    <AdminPanel palette={p} title={`Sample SU-${String(sample.unit_number).padStart(3, '0')} · ${sample.workflow_state}`} subtitle={`${sample.start_m ?? '—'}–${sample.end_m ?? '—'} m within the section; ${sample.area_sqm ?? '—'} m²`}>
      <Text style={{ color: p.muted, marginBottom: 12 }}>Inspector: {data.profiles.find(u => u.id === sample.assigned_to)?.full_name ?? (sample.assigned_to === user?.id ? 'You' : 'Assigned inspector')} · Engineer: {data.profiles.find(u => u.id === sample.reviewer_id)?.full_name ?? 'Assigned engineer'}</Text>
      {!!sample.review_notes && <Notice>Reviewer comments: {sample.review_notes}</Notice>}
      {sample.workflow_state === 'planned' && sample.assigned_to === user?.id && role === 'encoder' && <AdminButton palette={p} disabled={busy} label="Start field inspection" onPress={() => void run(() => workflowAction(sample, 'start'))} />}
      {editable ? <View style={{ gap: 14 }}>
        <AdminField palette={p} label="Inspection date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <AdminField palette={p} label="General inspection notes" multiline value={notes} onChangeText={setNotes} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}><View style={{ flexGrow: 1, minWidth: 180 }}><AdminField palette={p} label="Latitude (optional)" value={latitude} onChangeText={setLatitude} /></View><View style={{ flexGrow: 1, minWidth: 180 }}><AdminField palette={p} label="Longitude (optional)" value={longitude} onChangeText={setLongitude} /></View></View>
        {!distresses.length && <Choices label="Observed distress" value={noDistress ? 'none' : 'present'} options={[{ value: 'present', label: 'Enter distress records below' }, { value: 'none', label: 'I inspected this unit: no distress' }]} onChange={value => setNoDistress(value === 'none')} />}
        <AdminButton palette={p} disabled={busy || !dirty} label="Save inspection details" onPress={() => void run(save)} />
        {dirty && <Notice>Save inspection details before adding evidence or submitting.</Notice>}
      </View> : <Text selectable style={{ color: p.text, lineHeight: 22 }}>{sample.surveyed_at?.slice(0, 10) ?? 'Not started'}{`\n`}{sample.inspection_notes || 'No general notes.'}{sample.no_distress_confirmed ? '\nInspector confirmed no distress.' : ''}</Text>}
    </AdminPanel>
    <AdminPanel palette={p} title="Distress evidence">
      <View style={{ gap: 12 }}>{distresses.map(d => <View key={d.id} style={{ borderBottomWidth: 1, borderColor: p.border, paddingBottom: 12, gap: 7 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>{data.types.find(t => t.id === d.distress_type_id)?.name ?? d.distress_type_id}</Text>{d.severity ? <SeverityBadge severity={d.severity} /> : <Text style={{ color: p.muted }}>Not applicable</Text>}</View>
        <Text style={{ color: p.muted }}>{d.quantity} {d.unit_of_measure} · Location {d.measurement_details?.location_m ?? 'not specified'} m · {d.notes || 'No notes'}</Text>
        {editable && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton palette={p} disabled={busy || dirty} tone="secondary" label="Edit measurement" onPress={() => { setEditingId(d.id); setTypeId(d.distress_type_id); setSeverity(d.severity ?? ''); setQuantity(String(d.quantity)); setLocation(d.measurement_details?.location_m?.toString() ?? ''); setDistressNotes(d.notes ?? ''); }} /><AdminButton palette={p} disabled={busy || dirty} tone="danger" label="Remove" onPress={() => setConfirmation(`remove:${d.id}`)} /></View>}
      </View>)}</View>
      {!distresses.length && <Text style={{ color: p.muted, marginBottom: 12 }}>No distress records saved.</Text>}
      {editable && <View style={{ gap: 14, marginTop: 16 }}>
        <Choices label="Asphalt distress type" value={typeId} options={data.types.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name }))} onChange={id => { setTypeId(id); setSeverity(''); }} />
        {!data.types.length && <Notice>The live distress catalog is empty. Ask an administrator to configure engineer-validated distress names, units and severity requirements in Settings.</Notice>}
        {type && (type.severity_required ? <View style={{ gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>Severity</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{type.allowed_severities.map(value => {
          const label = normalizeDistressSeverity(value);
          if (!label) return null;
          const colors = getDistressSeverityColors(label);
          const selectedSeverity = severity === value;
          return <Pressable accessibilityLabel={`${label} severity`} accessibilityRole="radio" accessibilityState={{ selected: selectedSeverity }} key={value} onPress={() => setSeverity(value)} style={{ backgroundColor: selectedSeverity ? colors.backgroundColor : p.panel, borderColor: selectedSeverity ? colors.borderColor : p.border, borderRadius: 8, borderWidth: 1, minWidth: 88, paddingHorizontal: 14, paddingVertical: 11 }}><Text style={{ color: selectedSeverity ? colors.textColor : p.text, fontWeight: '700', textAlign: 'center' }}>{selectedSeverity ? '✓ ' : ''}{label}</Text></Pressable>;
        })}</View></View> : <Choices label="Severity" value={severity} options={[{ value: '', label: 'Not applicable' }]} onChange={setSeverity} />)}
        <AdminField palette={p} label={`Measured quantity (${type?.default_unit_of_measure ?? 'select distress first'})`} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        <AdminField palette={p} label="Location from sample start, metres (optional)" keyboardType="numeric" value={location} onChangeText={setLocation} />
        <AdminField palette={p} label="Distress / location notes" value={distressNotes} onChangeText={setDistressNotes} multiline />
        <AdminButton palette={p} disabled={busy || dirty || !type} label={editingId ? 'Save measurement changes' : 'Add distress'} onPress={() => void run(addDistress)} />
      </View>}
    </AdminPanel>
    <AdminPanel palette={p} title="Supporting photographs" subtitle="Private evidence; JPEG, PNG or WebP, maximum 5 MB per photograph.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{photos.map(photo => <PhotoCard busy={busy} canRemove={editable} key={photo.id} onRemove={() => setConfirmation(`photo:${photo.id}`)} photo={photo} />)}</View>
      {!photos.length && <Text style={{ color: p.muted }}>No photographs uploaded.</Text>}
      {editable && <View style={{ gap: 12, marginTop: 12 }}>
        <Text style={{ color: p.muted }}>Photographs are optional. You can submit an inspection without one.</Text>
        {!!photoSelectionError && <Notice error>{photoSelectionError}</Notice>}
        {selectedPhoto ? <Image accessibilityLabel="Selected photograph preview" contentFit="cover" source={{ uri: selectedPhoto.uri }} style={{ borderRadius: 10, height: 190, maxWidth: '100%', width: 300 }} /> : null}
        <AdminField palette={p} label="Photograph caption" value={caption} onChangeText={setCaption} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><AdminButton palette={p} disabled={busy || dirty || photoUploading} label={selectedPhoto ? 'Choose another photograph' : 'Choose photograph'} icon="camera" onPress={() => void choosePhoto()} />{selectedPhoto ? <AdminButton palette={p} disabled={busy || dirty || photoUploading} label={photoUploading ? 'Uploading photograph…' : 'Upload photograph'} icon="upload" onPress={() => void run(uploadPhoto, 'Photograph saved.')} /> : null}</View>
      </View>}
    </AdminPanel>
    <AdminPanel palette={p} title="PCI calculation & review" subtitle={computation ? `${computation.edition} · Input revision ${computation.input_revision}` : data.settings.active_edition}>
      {computation?.verification === 'verified' && computation.output_snapshot ? <PciResultDetails data={data} distresses={distresses} label="Verified sample-unit calculation" result={computation.output_snapshot} sample={sample} verified /> : preliminary.result ? <><Notice>{PRELIMINARY_RESULT_LABEL}. This illustrative calculation is displayed only in the browser and is not saved or eligible for approval.</Notice><PciResultDetails data={data} distresses={distresses} label={PRELIMINARY_RESULT_LABEL} result={preliminary.result} sample={sample} /></> : <Notice>{REFERENCE_PENDING}. {preliminary.reason} No numeric official PCI is invented.</Notice>}
      {editable && <View style={{ marginTop: 16 }}><AdminButton palette={p} disabled={busy || dirty} label="Submit for engineer review" onPress={() => setConfirmation('submit')} /></View>}
      {reviewer && ['submitted', 'approved'].includes(sample.workflow_state) && <View style={{ gap: 12, marginTop: 16 }}>
        <AdminField palette={p} label="Engineer review comments (required when returning)" multiline value={comments} onChangeText={setComments} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{sample.workflow_state === 'submitted' && <AdminButton palette={p} disabled={busy || !comments.trim()} tone="secondary" label="Return for correction" onPress={() => setConfirmation('return')} />}
          <AdminButton palette={p} disabled={busy || computation?.verification !== 'verified'} label={sample.workflow_state === 'approved' ? 'Publish verified result' : 'Approve verified result'} onPress={() => setConfirmation(sample.workflow_state === 'approved' ? 'publish' : 'approve')} /></View>
      </View>}
      {!!confirmation && <View style={{ gap: 12, padding: 16, marginTop: 14, borderWidth: 1, borderColor: p.border, borderRadius: 10 }}>
        <Text style={{ color: p.text }}>Confirm {confirmation.startsWith('remove:') ? 'removing this distress measurement' : confirmation.startsWith('photo:') ? 'removing this photograph' : confirmation}? {confirmation === 'submit' ? 'Your saved inputs will become read-only.' : 'This action is recorded in the review history.'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><AdminButton palette={p} disabled={busy} label="Confirm" onPress={() => void run(() => confirmation.startsWith('remove:') ? workflowAction(sample, 'remove_distress', { id: confirmation.slice(7) }) : confirmation.startsWith('photo:') ? removePhoto(photos.find(photo => photo.id === confirmation.slice(6))!) : workflowAction(sample, confirmation, { comments }), 'Workflow updated.')} /><AdminButton palette={p} tone="secondary" label="Cancel" onPress={() => setConfirmation(null)} /></View>
      </View>}
    </AdminPanel>
    <AdminPanel palette={p} title="Review & change history"><View style={{ gap: 12 }}>{data.history.filter(h => h.sample_unit_id === sample.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(h => <Text key={h.id} selectable style={{ color: p.text }}>{new Date(h.created_at).toLocaleString()} · {h.action} · Revision {h.revision}{h.comments ? `\n${h.comments}` : ''}</Text>)}</View></AdminPanel>
  </View>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const label = normalizeDistressSeverity(severity);
  if (!label) return null;
  const colors = getDistressSeverityColors(label);
  return <View style={{ backgroundColor: colors.backgroundColor, borderColor: colors.borderColor, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.textColor, fontSize: 11, fontWeight: '800' }}>{label}</Text></View>;
}

export function PhotoCard({ busy = false, canRemove = false, onRemove, photo }: { busy?: boolean; canRemove?: boolean; onRemove?: () => void; photo: Photo }) {
  const p = useAdminPalette();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const { data, error: failure } = await supabase.storage.from('sample-unit-photos').createSignedUrl(photo.photo_path, 120);
      if (failure) setError(`Photograph could not be loaded: ${failure.message}`); else { setUrl(data.signedUrl); setError(''); }
    } finally { setLoading(false); }
  }
  return <View style={{ width: 240, maxWidth: '100%', gap: 8, marginBottom: 10 }}>
    {!!url && <Pressable onPress={() => void Linking.openURL(url)}><Image accessibilityLabel={photo.caption ?? 'Pavement photograph'} source={{ uri: url }} style={{ width: '100%', height: 160, borderRadius: 8 }} contentFit="cover" /></Pressable>}
    <Text style={{ color: p.text }}>{photo.caption || 'Pavement evidence'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton disabled={loading || busy} palette={p} tone="secondary" label={loading ? 'Loading photograph…' : url ? 'Refresh image access' : 'Load private photograph'} onPress={() => void open()} />{canRemove && onRemove ? <AdminButton disabled={busy} palette={p} tone="danger" label="Remove" onPress={onRemove} /> : null}</View>
    {!!error && <Text style={{ color: p.red }}>{error}</Text>}
  </View>;
}

function buildPreliminaryResult(sample: Sample, data: WorkflowData, distresses: WorkflowData['distresses']): { result: PCIResult | null; reason: string } {
  const area = Number(sample.area_sqm);
  if (!Number.isFinite(area) || area <= 0) return { result: null, reason: 'A valid sample-unit area is required.' };
  if (!distresses.length) return { result: null, reason: sample.no_distress_confirmed ? 'A verified adapter must confirm the no-distress result.' : 'Record a distress or confirm no distress before submission.' };

  const entries: DistressEntry[] = [];
  for (const distress of distresses) {
    const catalog = data.types.find(type => type.id === distress.distress_type_id);
    const reference = ASPHALT_DISTRESSES.find(type => normalizeName(type.name) === normalizeName(catalog?.name ?? ''));
    const unit = normalizeMeasurementUnit(distress.unit_of_measure);
    if (!catalog || !reference || !unit) return { result: null, reason: `The illustrative engine cannot map ${catalog?.name ?? 'a recorded distress'} to its reference definition.` };
    entries.push({ uid: distress.id, distressId: reference.id, distressName: catalog.name, severity: normalizeDistressSeverity(distress.severity) ?? 'Medium', quantity: Number(distress.quantity), unit });
  }

  return { result: computePCI(entries, area), reason: '' };
}

function normalizeMeasurementUnit(unit: string): MeasurementUnit | null {
  if (['m²', 'm2', 'sqm'].includes(unit)) return 'm²';
  if (unit === 'm') return 'm';
  if (['No.', 'count'].includes(unit)) return 'No.';
  return null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function PciResultDetails({ data, distresses, label, result, sample, verified = false }: { data: WorkflowData; distresses: WorkflowData['distresses']; label: string; result: PCIResult | CalculationOutput; sample: Sample; verified?: boolean }) {
  const p = useAdminPalette();
  const illustrative = 'distresses' in result;
  const densities = illustrative ? result.distresses.map(item => item.density) : result.densities ?? [];
  const deductValues = illustrative ? result.distresses.map(item => item.deductValue) : result.deduct_values ?? [];
  const totalDeductValue = illustrative ? result.totalDeductValue : result.total_deduct_value;
  const allowableDeducts = illustrative ? result.allowableDeducts : result.allowable_deducts;
  const maximumCdv = illustrative ? result.maxCDV : result.max_corrected_deduct_value;
  const condition = getPciCondition(Number(result.pci));
  return <View style={{ gap: 12, marginTop: 14 }}>
    <Text style={{ color: verified ? p.green : p.amber, fontSize: 15, fontWeight: '900' }}>{label}</Text>
    <Text style={{ color: p.muted }}>Sample SU-{String(sample.unit_number).padStart(3, '0')} · {sample.area_sqm} m² · {sample.sample_type === 'additional' ? 'Additional' : 'Random'} · Reviewer status: {sample.workflow_state}</Text>
    {distresses.map((distress, index) => <View key={distress.id} style={{ borderBottomColor: p.border, borderBottomWidth: 1, gap: 4, paddingBottom: 9 }}><Text style={{ color: p.text, fontWeight: '700' }}>{data.types.find(type => type.id === distress.distress_type_id)?.name ?? 'Recorded distress'} · {distress.severity ?? 'Not applicable'}</Text><Text style={{ color: p.muted }}>Quantity {distress.quantity} {distress.unit_of_measure} · Density {typeof densities[index] === 'number' ? densities[index].toFixed(2) : '—'}% · Deduct Value {deductValues[index] ?? '—'}</Text></View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><ResultMetric label="TDV" value={formatMetric(totalDeductValue, 1)} /><ResultMetric label="Allowable deducts (m)" value={formatMetric(allowableDeducts, 2)} /><ResultMetric label="Maximum CDV" value={formatMetric(maximumCdv, 1)} /><ResultMetric label="PCI" value={formatMetric(result.pci, 0)} /><ResultMetric label="Condition" value={condition || '—'} /><ResultMetric label="Verification" value={verified ? 'Verified' : 'Pending'} /></View>
  </View>;
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  const p = useAdminPalette();
  return <View style={{ backgroundColor: p.panelAlt, borderColor: p.border, borderRadius: 8, borderWidth: 1, flexGrow: 1, minWidth: 130, padding: 11 }}><Text style={{ color: p.muted, fontSize: 10, textTransform: 'uppercase' }}>{label}</Text><Text style={{ color: p.text, fontSize: 15, fontWeight: '800', marginTop: 4 }}>{value}</Text></View>;
}

function formatMetric(value: number | undefined, fractionDigits: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(fractionDigits) : '—';
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}
