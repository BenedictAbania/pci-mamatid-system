import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { AdminButton, AdminEmpty, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { REFERENCE_PENDING, validateMeasurement } from '@/lib/pci-service';
import { supabase } from '@/lib/supabase';
import { Photo, Sample, WorkflowData, workflowAction } from '@/lib/workflow-data';
import { useAuth } from '@/providers/AuthProvider';

export default function FieldInspections() {
  const state = useWorkflow();
  const p = useAdminPalette();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const sample = state.data?.samples.find(item => item.id === selected);
  return <AdminShell title="Inspections & Review" subtitle="Assigned sample units, field evidence and independent engineer review." loading={state.loading} onRefresh={() => void state.refresh()} onSearchChange={setQuery} searchValue={query}>
    {!!state.error && <Notice error>{state.error}</Notice>}{!!state.message && <Notice>{state.message}</Notice>}
    <Notice>{REFERENCE_PENDING}. You may collect and review inputs; official approval requires a verified server calculation.</Notice>
    {state.data && <>
      <AdminPanel title="Inspection register" palette={p}>
        <View style={{ gap: 10 }}>{state.data.samples.filter(s => `${state.data?.sections.find(x => x.id === s.section_id)?.name} ${s.unit_number} ${s.workflow_state}`.toLowerCase().includes(query.toLowerCase())).map(s => <Pressable key={s.id} onPress={() => setSelected(s.id)} style={{ borderWidth: 1, borderColor: s.id === selected ? p.blue : p.border, backgroundColor: s.id === selected ? p.blueSoft : p.panel, borderRadius: 9, padding: 14, gap: 6 }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>{state.data?.sections.find(x => x.id === s.section_id)?.name} · SU-{String(s.unit_number).padStart(3, '0')}</Text>
          <Text style={{ color: p.muted }}>{s.workflow_state.toUpperCase()} · {s.sample_type ?? 'Unplanned'} · {s.area_sqm ?? '—'} m² · Revision {s.input_revision}</Text>
        </Pressable>)}</View>
        {!state.data.samples.length && <AdminEmpty palette={p} icon="clipboard" message="No sample units in your authorized scope. An engineer must confirm a plan and assign an inspector and reviewer." />}
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
  const [date, setDate] = useState(sample.surveyed_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
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
  const type = data.types.find(t => t.id === typeId);
  const distresses = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const computation = data.computations.find(c => c.id === sample.computation_id);
  const photos = data.photos.filter(photo => photo.sample_unit_id === sample.id);
  const dirty = notes !== (sample.inspection_notes ?? '') || date !== (sample.surveyed_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)) || latitude !== (sample.latitude?.toString() ?? '') || longitude !== (sample.longitude?.toString() ?? '') || noDistress !== sample.no_distress_confirmed;
  async function addDistress() {
    if (!type) throw new Error('Select an active distress type. An administrator must configure the catalog if it is empty.');
    const measurement = { distress_type_id: typeId, severity: (severity || null) as 'low' | 'medium' | 'high' | null, quantity: Number(quantity), unit_of_measure: type.default_unit_of_measure ?? '', location_m: location === '' ? null : Number(location) };
    validateMeasurement(measurement, type, Number(sample.area_sqm), sample.start_m !== null && sample.end_m !== null ? sample.end_m - sample.start_m : null, distresses.filter(d => d.id !== editingId).map(d => ({ ...d, location_m: d.measurement_details?.location_m ?? null })));
    await workflowAction(sample, 'distress', { ...measurement, id: editingId || null, notes: distressNotes });
  }
  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error('Use a valid inspection date (YYYY-MM-DD).');
    if ((latitude === '') !== (longitude === '')) throw new Error('Enter both coordinates or leave both empty.');
    if (latitude && (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 || !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180)) throw new Error('Enter valid latitude and longitude.');
    await workflowAction(sample, 'save', { notes, surveyed_at: date, latitude, longitude, no_distress_confirmed: noDistress });
  }
  async function uploadPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const response = await fetch(asset.uri);
    const bytes = await response.arrayBuffer();
    const head = new Uint8Array(bytes);
    const detected = head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg' : head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71 ? 'image/png' : String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
    if (!detected || bytes.byteLength > 5 * 1024 * 1024 || !bytes.byteLength) throw new Error('Choose a JPEG, PNG or WebP photograph up to 5 MB.');
    const path = `${sample.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${detected.split('/')[1]}`;
    const { error } = await supabase.storage.from('sample-unit-photos').upload(path, bytes, { contentType: detected, upsert: false });
    if (error) throw new Error(error.message);
    try { await workflowAction(sample, 'photo', { path, caption }); }
    catch (reason) { await supabase.storage.from('sample-unit-photos').remove([path]); throw reason; }
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
        <Text style={{ color: p.text, fontWeight: '700' }}>{data.types.find(t => t.id === d.distress_type_id)?.name ?? d.distress_type_id} · {d.severity ?? 'Not applicable'}</Text>
        <Text style={{ color: p.muted }}>{d.quantity} {d.unit_of_measure} · Location {d.measurement_details?.location_m ?? 'not specified'} m · {d.notes || 'No notes'}</Text>
        {editable && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton palette={p} disabled={busy || dirty} tone="secondary" label="Edit measurement" onPress={() => { setEditingId(d.id); setTypeId(d.distress_type_id); setSeverity(d.severity ?? ''); setQuantity(String(d.quantity)); setLocation(d.measurement_details?.location_m?.toString() ?? ''); setDistressNotes(d.notes ?? ''); }} /><AdminButton palette={p} disabled={busy || dirty} tone="danger" label="Remove" onPress={() => setConfirmation(`remove:${d.id}`)} /></View>}
      </View>)}</View>
      {!distresses.length && <Text style={{ color: p.muted, marginBottom: 12 }}>No distress records saved.</Text>}
      {editable && <View style={{ gap: 14, marginTop: 16 }}>
        <Choices label="Asphalt distress type" value={typeId} options={data.types.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name }))} onChange={id => { setTypeId(id); setSeverity(''); }} />
        {!data.types.length && <Notice>The live distress catalog is empty. Ask an administrator to configure engineer-validated distress names, units and severity requirements in Settings.</Notice>}
        {type && <Choices label="Severity" value={severity} options={type.severity_required ? type.allowed_severities.map(s => ({ value: s, label: s })) : [{ value: '', label: 'Not applicable' }]} onChange={setSeverity} />}
        <AdminField palette={p} label={`Measured quantity (${type?.default_unit_of_measure ?? 'select distress first'})`} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        <AdminField palette={p} label="Location from sample start, metres (optional)" keyboardType="numeric" value={location} onChangeText={setLocation} />
        <AdminField palette={p} label="Distress / location notes" value={distressNotes} onChangeText={setDistressNotes} multiline />
        <AdminButton palette={p} disabled={busy || dirty || !type} label={editingId ? 'Save measurement changes' : 'Add distress'} onPress={() => void run(addDistress)} />
      </View>}
    </AdminPanel>
    <AdminPanel palette={p} title="Supporting photographs" subtitle="Private evidence; JPEG, PNG or WebP, maximum 5 MB per photograph.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{photos.map(photo => <PhotoCard key={photo.id} photo={photo} />)}</View>
      {!photos.length && <Text style={{ color: p.muted }}>No photographs uploaded.</Text>}
      {editable && <View style={{ gap: 12, marginTop: 12 }}><AdminField palette={p} label="Photograph caption" value={caption} onChangeText={setCaption} /><AdminButton palette={p} disabled={busy || dirty} label="Choose photograph" icon="camera" onPress={() => void run(uploadPhoto, 'Photograph saved.')} /></View>}
    </AdminPanel>
    <AdminPanel palette={p} title="PCI calculation & review" subtitle={computation ? `${computation.edition} · Input revision ${computation.input_revision}` : data.settings.active_edition}>
      {computation?.verification === 'verified' && computation.output_snapshot ? <Text selectable style={{ color: p.text }}>{JSON.stringify(computation.output_snapshot, null, 2)}</Text> : <Notice>{REFERENCE_PENDING}. DV, TDV, m, q, CDV iterations and final PCI will be supplied by the verified adapter. No numeric official PCI is invented.</Notice>}
      {editable && <View style={{ marginTop: 16 }}><AdminButton palette={p} disabled={busy || dirty} label="Submit for engineer review" onPress={() => setConfirmation('submit')} /></View>}
      {reviewer && ['submitted', 'approved'].includes(sample.workflow_state) && <View style={{ gap: 12, marginTop: 16 }}>
        <AdminField palette={p} label="Engineer review comments (required when returning)" multiline value={comments} onChangeText={setComments} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{sample.workflow_state === 'submitted' && <AdminButton palette={p} disabled={busy || !comments.trim()} tone="secondary" label="Return for correction" onPress={() => setConfirmation('return')} />}
          <AdminButton palette={p} disabled={busy || computation?.verification !== 'verified'} label={sample.workflow_state === 'approved' ? 'Publish verified result' : 'Approve verified result'} onPress={() => setConfirmation(sample.workflow_state === 'approved' ? 'publish' : 'approve')} /></View>
      </View>}
      {!!confirmation && <View style={{ gap: 12, padding: 16, marginTop: 14, borderWidth: 1, borderColor: p.border, borderRadius: 10 }}>
        <Text style={{ color: p.text }}>Confirm {confirmation.startsWith('remove:') ? 'removing this distress measurement' : confirmation}? {confirmation === 'submit' ? 'Your saved inputs will become read-only.' : 'This action is recorded in the review history.'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}><AdminButton palette={p} disabled={busy} label="Confirm" onPress={() => void run(() => confirmation.startsWith('remove:') ? workflowAction(sample, 'remove_distress', { id: confirmation.slice(7) }) : workflowAction(sample, confirmation, { comments }), 'Workflow updated.')} /><AdminButton palette={p} tone="secondary" label="Cancel" onPress={() => setConfirmation(null)} /></View>
      </View>}
    </AdminPanel>
    <AdminPanel palette={p} title="Review & change history"><View style={{ gap: 12 }}>{data.history.filter(h => h.sample_unit_id === sample.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(h => <Text key={h.id} selectable style={{ color: p.text }}>{new Date(h.created_at).toLocaleString()} · {h.action} · Revision {h.revision}{h.comments ? `\n${h.comments}` : ''}</Text>)}</View></AdminPanel>
  </View>;
}
export function PhotoCard({ photo }: { photo: Photo }) {
  const p = useAdminPalette();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  async function open() {
    const { data, error: failure } = await supabase.storage.from('sample-unit-photos').createSignedUrl(photo.photo_path, 120);
    if (failure) setError(failure.message); else { setUrl(data.signedUrl); setError(''); }
  }
  return <View style={{ width: 240, maxWidth: '100%', gap: 8, marginBottom: 10 }}>
    {!!url && <Pressable onPress={() => void Linking.openURL(url)}><Image accessibilityLabel={photo.caption ?? 'Pavement photograph'} source={{ uri: url }} style={{ width: '100%', height: 160, borderRadius: 8 }} contentFit="cover" /></Pressable>}
    <Text style={{ color: p.text }}>{photo.caption || 'Pavement evidence'}</Text>
    <AdminButton palette={p} tone="secondary" label={url ? 'Refresh image access' : 'Load private photograph'} onPress={() => void open()} />
    {!!error && <Text style={{ color: p.red }}>{error}</Text>}
  </View>;
}
