import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { distressLabel, photoGroups, PhotoGroups } from '@/components/workflow/distress-photos';
import { PageControls } from '@/components/workflow/pagination';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskTabs } from '@/components/workflow/task-tabs';
import { DistressEntry } from '@/components/workflow/distress-entry';
import { ReviewWorkspace } from '@/components/workflow/review-workspace';
import { inspectionSteps, severityChoices, statusGuidance, type InspectionStep } from '@/lib/ui/inspection-presentation';
import { StatusBadge } from '@/components/dashboard/dashboard-parts';
import { Pressable, Text, View } from 'react-native';
import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { CatalogDropdown, Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { validateMeasurement, type CalculationOutput } from '@/lib/pci/pci-service';
import { getDistressSeverityColors, normalizeDistressSeverity } from '@/lib/pci/severity-colors';
import { Photo, Sample, WorkflowData, workflowAction, calculateProvisional } from '@/lib/data/workflow-data';
import { useAuth } from '@/providers/AuthProvider';
import { removeInspectionPhoto, uploadInspectionPhoto } from '@/lib/data/inspection-photos';
import { DEMO_PREVIEW_ENABLED } from '@/lib/ui/demo-preview';

import { ASPHALT_CATALOG, EDITION, type Unit } from '@/lib/d6433-07/catalog';
import { d07GuidanceFor, d07GuidanceSnapshot, type SeverityCode } from '@/lib/d6433-07/severity-guidance';
import { blankPart, describePart, measureParts, partToDraft, severityEvidence, SEVERITY_MEASUREMENT_LABELS, type PartDraft } from '@/lib/d6433-07/measurement-parts';
import type { SampleOutput } from '@/lib/d6433-07/sample';

export default function FieldInspections() {
  const params = useLocalSearchParams<{ sample?: string; status?: string }>();
  const { role, user } = useAuth();
  const status = typeof params.status === 'string' ? params.status : role === 'reviewer' ? 'submitted' : 'all';
  const initialSample = typeof params.sample === 'string' ? params.sample : '';
  return <InspectionWorkspace key={[user?.id, role].join(':')} status={status} initialSample={initialSample} />;
}
function InspectionWorkspace({ status, initialSample }: { status: string; initialSample: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSample);
  const [step, setStep] = useState<InspectionStep>('details');
  // Encoders start on distress entry; the full form keeps details, photos and submission.
  const [fullForm, setFullForm] = useState(false);
  useEffect(() => {
    // Sync direct task links and browser history without remounting the shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(initialSample);
    setStep('details');
    setFullForm(false);
  }, [initialSample]);
  const state = useWorkflow(selected, undefined, status === 'all' ? undefined : status);
  const p = useAdminPalette();
  const { role, user } = useAuth();
  const visibleSamples = state.scopeChanging ? [] : state.data?.samples.filter(item => role === 'reviewer' ? item.reviewer_id === user?.id && item.assigned_to !== user?.id : role === 'encoder' ? item.assigned_to === user?.id : false) ?? [];
  const filteredSamples = visibleSamples.filter(s => status === 'all' || s.workflow_state === status);
  const sample = visibleSamples.find(item => item.id === selected);
  const sampleSection = sample ? state.data?.sections.find(s => s.id === sample.section_id) : undefined;
  const sampleBranch = sampleSection ? state.data?.branches?.find(b => b.id === sampleSection.branch_id) : undefined;
  const title = role === 'reviewer' ? 'Inspections to Review' : 'My Inspections';
  const emptyMessage = role === 'reviewer' ? 'No sample units are assigned to you for independent review.' : status === 'all' ? 'No sample units are assigned to you. A civil engineer must confirm a plan first.' : `No ${status} inspections are assigned to you.`;
  return <AdminShell title={title} subtitle="" loading={state.loading} onRefresh={() => void state.refresh()}>
    {!!state.error && <Notice error>{state.error}</Notice>}
    {state.data && <>
      {!selected && <AdminPanel title="Assignment Tab" palette={p}>
        <TaskTabs variant="pill" label="Filter inspections by status" value={status} items={['all', 'planned', 'draft', 'submitted', 'returned', 'approved', 'published'].map(value => ({ value, label: value === 'all' ? 'All Inspection' : value[0].toUpperCase() + value.slice(1) }))} onChange={value => router.setParams({ status: value })} />
        <View style={{ gap: 10, marginTop: 16 }}>{filteredSamples.map(s => <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Open sample ${s.unit_number}`} onPress={() => { setSelected(s.id); setStep('details'); setFullForm(false); }} style={{ borderWidth: 1, borderColor: s.id === selected ? p.blue : p.border, backgroundColor: s.id === selected ? p.blueSoft : p.panel, borderRadius: 9, padding: 14, gap: 6 }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>{state.data?.sections.find(x => x.id === s.section_id)?.name} · SU-{String(s.unit_number).padStart(3, '0')}</Text>
          <Text style={{ color: p.muted }}>{s.workflow_state.toUpperCase()} · {s.sample_type ?? 'Unplanned'} · {s.area_sqm ?? '—'} m² · Revision {s.input_revision}</Text>
        </Pressable>)}</View>
        {!state.loading && !filteredSamples.length && <Text style={{ color: p.text, fontSize: 16, textAlign: 'center', paddingVertical: 32 }}>{emptyMessage}</Text>}
        <PageControls {...state.pagination} />
      </AdminPanel>}
      {/* Same back arrow and title as the reviewer's section page. */}
      {!!selected && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityLabel="Back to inspection list" accessibilityRole="button" onPress={() => { setSelected(''); router.setParams({ status, sample: undefined }); }} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 }}>
          <Feather color={p.text} name="arrow-left" size={24} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ color: p.text, fontSize: 19, fontWeight: '800' }}>{sample ? `Sample Unit ${sample.unit_number}` : 'Inspection'}</Text>
          {!!sampleSection && <Text numberOfLines={1} style={{ color: p.text, fontSize: 13 }}>{[sampleSection.name, sampleBranch?.name].filter(Boolean).join(' · ')}</Text>}
        </View>
      </View>}
      {!!selected && state.loadedSampleId !== selected && <Notice>Loading inspection details…</Notice>}
      {!!selected && state.loadedSampleId === selected && !sample && !state.loading && <Notice error>This sample is unavailable in your authorized assignments. Return to the list or refresh.</Notice>}
      {sample && state.loadedSampleId === selected && (role === 'reviewer'
        ? <ReviewWorkspace key={`${sample.id}-${sample.input_revision}-${sample.workflow_state}`} sample={sample} data={state.data} busy={state.busy || state.loading} run={state.run} error={state.error} />
        : role === 'encoder' && !fullForm
        ? <DistressEntry key={sample.id} sample={sample} data={state.data} busy={state.busy || state.loading} run={state.run} error={state.error} onRefresh={state.refresh} />
        : <>
          {role === 'encoder' && <AdminButton palette={p} tone="secondary" label="Back to distress entry" onPress={() => setFullForm(false)} />}
          <InspectionEditor step={step} setStep={setStep} error={state.error} key={`${sample.id}-${sample.input_revision}-${sample.workflow_state}`} sample={sample} data={state.data} busy={state.busy || state.loading} run={state.run} />
        </>)}
    </>}
  </AdminShell>;
}

export function InspectionEditor({ sample, data, busy, run, step, setStep, error }: { sample: Sample; data: WorkflowData; busy: boolean; run: (task: () => Promise<unknown>, success?: string) => Promise<boolean>; step: InspectionStep; setStep: (step: InspectionStep) => void; error?: string }) {
  const p = useAdminPalette();
  const { role, user } = useAuth();
  const editable = role === 'encoder' && sample.assigned_to === user?.id && ['draft', 'returned'].includes(sample.workflow_state);
  const reviewer = role === 'reviewer' && sample.reviewer_id === user?.id && sample.assigned_to !== user?.id;
  const [notes, setNotes] = useState(sample.inspection_notes ?? '');
  const [date, setDate] = useState(sample.surveyed_at?.slice(0, 10) ?? todayLocal());
  const [latitude, setLatitude] = useState(sample.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(sample.longitude?.toString() ?? '');
  const [noDistress, setNoDistress] = useState(sample.no_distress_confirmed);
  const [measuredArea,setMeasuredArea]=useState(String(sample.area_sqm ?? ''));
  const [orientation,setOrientation]=useState(sample.orientation_note ?? '');
  const [fieldConfirmed,setFieldConfirmed]=useState(sample.field_rules_confirmed ?? false);
  const [parts,setParts]=useState<PartDraft[]>([]);
  const [severityMeasure,setSeverityMeasure]=useState('');
  const [typeId, setTypeId] = useState('');
  const [severity, setSeverity] = useState('');
  const [location, setLocation] = useState('');
  const [distressNotes, setDistressNotes] = useState('');
  const [editingId, setEditingId] = useState('');
  const [comments, setComments] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [simulatedApproval, setSimulatedApproval] = useState(false);
  const [caption, setCaption] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoSelectionError, setPhotoSelectionError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const type = data.types.find(t => t.id === typeId);
  const activeTypes = data.types.filter(t => t.is_active && t.astm_edition === EDITION).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  const unit = type?.default_unit_of_measure as Unit | undefined;
  let quantityPreview: string | null = null;
  if (type && unit) { try { quantityPreview = String(measureParts(parts, unit, (severity || null) as 'low' | 'medium' | 'high' | null).quantity); } catch { /* Incomplete draft: do not show a false zero. */ } }
  const distresses = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const computation = data.computations.find(c => c.id === sample.computation_id);
  const photos = data.photos.filter(photo => photo.sample_unit_id === sample.id);
  const dirty = measuredArea !== String(sample.area_sqm ?? '') || orientation !== (sample.orientation_note ?? '') || fieldConfirmed !== (sample.field_rules_confirmed ?? false) || notes !== (sample.inspection_notes ?? '') || date !== (sample.surveyed_at?.slice(0, 10) ?? todayLocal()) || latitude !== (sample.latitude?.toString() ?? '') || longitude !== (sample.longitude?.toString() ?? '') || noDistress !== sample.no_distress_confirmed;
  async function addDistress() {
    if (!type) throw new Error('Select an active distress type. An administrator must configure the catalog if it is empty.');
    const guidance = type.astm_edition === EDITION ? d07GuidanceSnapshot(type.astm_code ?? -1, (severity || null) as SeverityCode | null, severity ? type.severity_descriptions?.[severity as SeverityCode] : null) : null;
    if (type.astm_edition === EDITION && !guidance) throw new Error('Draft severity guidance is unavailable for this distress. Ask the Civil Engineer before saving.');
    const measured = measureParts(parts, type.default_unit_of_measure as Unit, (severity || null) as 'low' | 'medium' | 'high' | null);
    const evidence = severityEvidence(type.astm_code ?? -1, severityMeasure);
    const measurement = { distress_type_id: typeId, severity: (severity || null) as 'low' | 'medium' | 'high' | null, quantity: measured.quantity, potholes: measured.potholes, unit_of_measure: type.default_unit_of_measure ?? '', location_m: location === '' ? null : Number(location) };
    validateMeasurement(measurement, type, Number(sample.area_sqm), sample.start_m !== null && sample.end_m !== null ? sample.end_m - sample.start_m : null, distresses.filter(d => d.id !== editingId).map(d => ({ ...d, location_m: d.measurement_details?.location_m ?? null })));
    await workflowAction(sample, 'distress', { ...measurement, measurement_parts: measured.parts, severity_evidence: evidence, id: editingId || null, notes: distressNotes, ...(guidance ? { severity_guidance: guidance } : {}) });
  }
  async function save() {
    if (!isValidDateString(date)) throw new Error('Use a valid inspection date (YYYY-MM-DD).');
    if (date > todayLocal()) throw new Error('Inspection date cannot be in the future.');
    if ((latitude === '') !== (longitude === '')) throw new Error('Enter both coordinates or leave both empty.');
    if (latitude && (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 || !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180)) throw new Error('Enter valid latitude and longitude.');
    await workflowAction(sample, 'save', { notes, surveyed_at: date, latitude, longitude, no_distress_confirmed: noDistress, area_sqm:Number(measuredArea),orientation_note:orientation,field_rules_confirmed:fieldConfirmed });
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
      await uploadInspectionPhoto(sample, selectedPhoto.uri, { caption });
      setSelectedPhoto(null);
      setCaption('');
    } finally {
      setPhotoUploading(false);
    }
  }
  async function removePhoto(photo: Photo) {
    await removeInspectionPhoto(sample, photo);
  }
  const pendingEvidence = !!typeId || !!selectedPhoto;
  const submitIssues = [
    !sample.surveyed_at ? 'Save an inspection date.' : '',
    !sample.area_sqm || sample.area_sqm < 135 || sample.area_sqm > 315 ? 'Save a measured area between 135 and 315 m².' : '',
    !sample.orientation_note?.trim() ? 'Save an orientation or sketch description.' : '',
    !sample.field_rules_confirmed ? 'Confirm that you checked the field measurement rules.' : '',
    !distresses.length && !sample.no_distress_confirmed ? 'Record distress measurements or explicitly confirm no distress.' : '',
  ].filter(Boolean);
  return <View style={{ gap: 18 }}>
    <AdminPanel palette={p} title={`Sample SU-${String(sample.unit_number).padStart(3, '0')}`}>
      <StatusBadge state={sample.workflow_state} palette={p} />
      <Text style={{ color: p.text, lineHeight: 23, marginTop: 10 }}>{statusGuidance[sample.workflow_state]}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: dirty || pendingEvidence ? p.amber : p.muted, marginTop: 8 }}>{busy ? 'Saving…' : dirty || pendingEvidence ? 'Unsaved changes — save or discard the draft before continuing.' : 'Showing saved inspection details.'}</Text>
      {!!sample.review_notes && <Notice>Reviewer comments: {sample.review_notes}</Notice>}
    </AdminPanel>
    <TaskTabs label="Inspection steps" items={inspectionSteps} value={step} onChange={value => setStep(value as InspectionStep)} disabled={busy || dirty || pendingEvidence || !!confirmation} />
    {!!error && <Notice error>{error} Your changes are retained. For an outdated revision, refresh and review the latest state before retrying.</Notice>}
    {!confirmation && step === 'details' && <AdminPanel palette={p} title={`Sample SU-${String(sample.unit_number).padStart(3, '0')} · ${sample.workflow_state}`} subtitle={`${sample.start_m ?? '—'}–${sample.end_m ?? '—'} m within the section; ${sample.area_sqm ?? '—'} m²`}>
      <Text style={{ color: p.muted, marginBottom: 12 }}>Inspector: {data.profiles.find(u => u.id === sample.assigned_to)?.full_name ?? (sample.assigned_to === user?.id ? 'You' : 'Assigned inspector')} · Engineer: {data.profiles.find(u => u.id === sample.reviewer_id)?.full_name ?? 'Assigned engineer'}</Text>
      {!!sample.review_notes && <Notice>Reviewer comments: {sample.review_notes}</Notice>}
      {['approved', 'published'].includes(sample.workflow_state) && sample.assigned_to === user?.id && role === 'encoder' && <View style={{ gap: 10 }}><AdminField palette={p} label="Correction reason" value={comments} onChangeText={setComments} /><AdminButton palette={p} disabled={busy || !comments.trim()} label="Create correction revision" onPress={() => setConfirmation('correct')} /></View>}
      {sample.workflow_state === 'planned' && sample.assigned_to === user?.id && role === 'encoder' && <AdminButton palette={p} disabled={busy} label="Start field inspection" onPress={() => void run(() => workflowAction(sample, 'start'))} />}
      {editable ? <View style={{ gap: 14 }}>
        <AdminField palette={p} label="Inspection date (YYYY-MM-DD) *" value={date} onChangeText={setDate} />
        <AdminField palette={p} label="Measured sample area (m², 135–315) *" keyboardType="numeric" value={measuredArea} onChangeText={setMeasuredArea} />
        <AdminField palette={p} label="Sample orientation / sketch description *" multiline value={orientation} onChangeText={setOrientation} />
        <Choices label="Field measurement and severity rules (Appendix X1)" value={fieldConfirmed ? "yes" : "no"} options={[{value:"no",label:"Needs checking"},{value:"yes",label:"I checked severity, SI units, patch exclusions and overlapping distress rules"}]} onChange={value=>setFieldConfirmed(value==="yes")} />
        <AdminField palette={p} label="General inspection notes" multiline value={notes} onChangeText={setNotes} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}><View style={{ flexGrow: 1, minWidth: 180 }}><AdminField palette={p} label="Latitude (optional)" value={latitude} onChangeText={setLatitude} /></View><View style={{ flexGrow: 1, minWidth: 180 }}><AdminField palette={p} label="Longitude (optional)" value={longitude} onChangeText={setLongitude} /></View></View>
        {!distresses.length && <Choices label="Observed distress" value={noDistress ? 'none' : 'present'} options={[{ value: 'present', label: 'Enter distress records below' }, { value: 'none', label: 'I inspected this unit: no distress' }]} onChange={value => setNoDistress(value === 'none')} />}
        <AdminButton palette={p} disabled={busy} label="Save details and continue" onPress={() => void (async () => { if (await run(save)) setStep('distress'); })()} />
        {dirty && <Notice>Save inspection details before adding evidence or submitting.</Notice>}
      </View> : <Text selectable style={{ color: p.text, lineHeight: 22 }}>{sample.surveyed_at?.slice(0, 10) ?? 'Not started'}{`\n`}{sample.inspection_notes || 'No general notes.'}{sample.no_distress_confirmed ? '\nInspector confirmed no distress.' : ''}{'\nOrientation: ' + (sample.orientation_note || 'Not recorded')}{'\nField measurement rules: ' + (sample.field_rules_confirmed ? 'Confirmed by Inspector' : 'Not confirmed')}{sample.latitude !== null && sample.longitude !== null ? '\nCoordinates: ' + sample.latitude + ', ' + sample.longitude : ''}</Text>}
      {!editable && sample.workflow_state !== 'planned' && <AdminButton palette={p} tone={sample.workflow_state === 'approved' || sample.workflow_state === 'published' ? 'secondary' : 'primary'} label="Continue to distress measurements" onPress={() => setStep('distress')} />}
      <Text style={{ color: p.muted, marginTop: 12 }}>* Required before submission. Coordinates and photos are optional.</Text>
    </AdminPanel>}
    {!confirmation && step === 'distress' && <AdminPanel palette={p} title="Distress measurements">
      <View style={{ gap: 12 }}>{distresses.map(d => <View key={d.id} style={{ borderBottomWidth: 1, borderColor: p.border, paddingBottom: 12, gap: 7 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: p.text, fontWeight: '700' }}>{data.types.find(t => t.id === d.distress_type_id)?.name ?? d.distress_type_id}</Text>{d.severity ? <SeverityBadge severity={d.severity} /> : <Text style={{ color: p.muted }}>Not applicable</Text>}</View>
        <Text style={{ color: p.muted }}>{d.quantity} {d.unit_of_measure} · Location {d.measurement_details?.location_m ?? 'not specified'} m · {d.notes || 'No notes'}</Text>
        {d.measurement_details?.measurement_parts && <Text style={{ color: p.muted }}>Saved measured parts: {d.measurement_details.measurement_parts.map(describePart).join('; ')} · Total Q: {d.quantity} {d.unit_of_measure}</Text>}
        {d.measurement_details?.severity_evidence && <Text style={{ color: p.muted }}>Separate severity measurement: {d.measurement_details.severity_evidence.value_mm} mm ({d.measurement_details.severity_evidence.metric})</Text>}
        {d.measurement_details?.severity_guidance && <Text selectable style={{ color: p.muted, lineHeight: 20 }}>Saved cue ({d.measurement_details.severity_guidance.version}): {d.measurement_details.severity_guidance.text}</Text>}
        {data.types.find(t => t.id === d.distress_type_id)?.astm_edition === EDITION && !d.measurement_details?.severity_guidance && <Text style={{ color: p.muted }}>Draft severity wording was not captured with this earlier measurement.</Text>}
        {editable && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton palette={p} disabled={busy || dirty} tone="secondary" label="Edit measurement" onPress={() => { setEditingId(d.id); setTypeId(d.distress_type_id); setSeverity(d.severity ?? ''); setParts(d.measurement_details?.measurement_parts?.map(partToDraft) ?? []); setSeverityMeasure(d.measurement_details?.severity_evidence?.value_mm?.toString() ?? ''); setLocation(d.measurement_details?.location_m?.toString() ?? ''); setDistressNotes(d.notes ?? ''); }} /><AdminButton palette={p} disabled={busy || dirty} tone="danger" label="Remove" onPress={() => setConfirmation(`remove:${d.id}`)} /></View>}
      </View>)}</View>
      {!distresses.length && <Text style={{ color: p.muted, marginBottom: 12 }}>No distress records saved.</Text>}
      {editable && <View style={{ gap: 14, marginTop: 16 }}>
        <CatalogDropdown label="Asphalt distress type *" value={typeId} options={activeTypes.map(t => ({ value: t.id, label: t.name }))} onChange={id => { setTypeId(id); setSeverity(''); setSeverityMeasure(''); const selected = activeTypes.find(t => t.id === id); setParts(selected ? [blankPart(selected.default_unit_of_measure as Unit)] : []); }} />
        {!activeTypes.length && <Notice>The active D6433-07 distress catalog is unavailable. Ask the Civil Engineer to check the reference data.</Notice>}
        {type && d07GuidanceFor(type.astm_edition, type.astm_code)?.context && <Text selectable style={{ color: p.muted, lineHeight: 21 }}>{d07GuidanceFor(type.astm_edition, type.astm_code)?.context}</Text>}
        {type && (type.severity_required ? <>
          <Choices label="Observed distress severity *" value={severity} options={severityChoices(type)} onChange={setSeverity} />
          {severityChoices(type).some(option => !option.description) && <Notice>Distress-specific descriptions are unavailable for this edition. Consult your Civil Engineer; no wording from another edition is substituted.</Notice>}
        </> : <Notice>{d07GuidanceFor(type.astm_edition, type.astm_code)?.none ?? 'No severity level for this distress. Record the measured quantity.'}</Notice>)}
        {type && unit && <View style={{ gap: 12 }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>Measured parts · catalog unit: {unit}</Text>
          {type.astm_code === 13 && <Notice>Table X1.1: each small-hole part needs count, diameter and maximum depth. Large holes need measured area; their equivalent count is area ÷ 0.5 m². Exact 200, 450 and 750 mm boundaries require CE review.</Notice>}
          {parts.map((part, index) => <View key={`${typeId}-${index}`} style={{ padding: 12, gap: 9, borderWidth: 1, borderColor: p.border, borderRadius: 8 }}>
            <Text style={{ color: p.text, fontWeight: '700' }}>Part {index + 1}</Text>
            {unit === 'm²' && <Choices label={`Part ${index + 1} shape`} value={part.mode} options={[{ value: 'rectangle', label: 'Rectangle: length × width' }, { value: 'irregular', label: 'Irregular: measured area' }]} onChange={mode => setParts(rows => rows.map((r, i) => i === index ? { ...r, mode: mode as PartDraft['mode'] } : r))} />}
            {unit === 'No.' && <Choices label={`Part ${index + 1} pothole size`} value={part.mode} options={[{ value: 'small_pothole', label: 'Small hole (100–<750 mm)' }, { value: 'large_pothole', label: 'Large hole (>750 mm)' }]} onChange={mode => setParts(rows => rows.map((r, i) => i === index ? { ...r, mode: mode as PartDraft['mode'] } : r))} />}
            {(part.mode === 'rectangle' || part.mode === 'length') && <AdminField palette={p} label={part.mode === 'length' ? `Part ${index + 1} affected length (m) *` : `Part ${index + 1} length (m) *`} keyboardType="numeric" value={part.length} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, length: v } : r))} />}
            {part.mode === 'rectangle' && <AdminField palette={p} label={`Part ${index + 1} width (m) *`} keyboardType="numeric" value={part.width} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, width: v } : r))} />}
            {(part.mode === 'irregular' || part.mode === 'large_pothole') && <AdminField palette={p} label={`Part ${index + 1} measured area (m²) *`} keyboardType="numeric" value={part.area} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, area: v } : r))} />}
            {part.mode === 'small_pothole' && <AdminField palette={p} label={`Part ${index + 1} pothole count *`} keyboardType="numeric" value={part.count} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, count: v } : r))} />}
            {(part.mode === 'small_pothole' || part.mode === 'large_pothole') && <><AdminField palette={p} label={`Part ${index + 1} diameter (mm) *`} keyboardType="numeric" value={part.diameter} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, diameter: v } : r))} /><AdminField palette={p} label={`Part ${index + 1} maximum depth (mm) *`} keyboardType="numeric" value={part.depth} onChangeText={v => setParts(rows => rows.map((r, i) => i === index ? { ...r, depth: v } : r))} /></>}
            {parts.length > 1 && <AdminButton palette={p} tone="secondary" label={`Remove part ${index + 1}`} onPress={() => setParts(rows => rows.filter((_, i) => i !== index))} />}
          </View>)}
          <AdminButton palette={p} tone="secondary" label="Add another measured part" onPress={() => setParts(rows => [...rows, blankPart(unit)])} />
          <Text accessibilityLiveRegion="polite" style={{ color: p.text, fontWeight: '700' }}>Total quantity (Q): {quantityPreview ?? 'Complete the parts above'} {unit}</Text>
          {SEVERITY_MEASUREMENT_LABELS[type.astm_code ?? -1] && <AdminField palette={p} label={`${SEVERITY_MEASUREMENT_LABELS[type.astm_code ?? -1]} — severity evidence, separate from Q`} keyboardType="numeric" value={severityMeasure} onChangeText={setSeverityMeasure} />}
          {!!editingId && !parts.length && <Notice>This earlier measurement has no saved parts. Enter the measured parts before saving the correction; the old total was not converted into invented dimensions.</Notice>}
        </View>}
        <AdminField palette={p} label="Location from sample start, metres (optional)" keyboardType="numeric" value={location} onChangeText={setLocation} />
        <AdminField palette={p} label="Distress / location notes" value={distressNotes} onChangeText={setDistressNotes} multiline />
        <AdminButton palette={p} disabled={busy || dirty || !type} tone="secondary" label={editingId ? 'Save measurement changes' : 'Add distress'} onPress={() => void (async () => {
          if (await run(addDistress)) {
            setTypeId(''); setEditingId(''); setSeverity(''); setParts([]); setSeverityMeasure('');
            setLocation(''); setDistressNotes('');
          }
        })()} />
      </View>}
      {!!typeId && <Text style={{ color: p.amber }}>Measurement draft: add this distress or discard it before continuing.</Text>}
      {!!typeId && <AdminButton palette={p} tone="secondary" label="Discard measurement draft" onPress={() => { setTypeId(''); setEditingId(''); setSeverity(''); setParts([]); setSeverityMeasure(''); setDistressNotes(''); }} />}
      <AdminButton palette={p} disabled={busy || dirty || !!typeId} label="Continue to photos" onPress={() => setStep('photos')} />
    </AdminPanel>}
    {!confirmation && step === 'photos' && <AdminPanel palette={p} title="Photos" subtitle="Private evidence; JPEG, PNG or WebP, maximum 5 MB per photograph.">
      <PhotoGroups palette={p} busy={busy} empty="No photographs uploaded."
        groups={photoGroups(distresses.map(d => ({ id: d.id, label: distressLabel(data.types.find(t => t.id === d.distress_type_id)?.name ?? 'Saved distress', d.severity) })), photos).filter(group => group.photos.length)}
        onRemove={editable ? photo => setConfirmation(`photo:${photo.id}`) : undefined} />
      {editable && <View style={{ gap: 12, marginTop: 12 }}>
        <Text style={{ color: p.muted }}>Photographs are optional. You can submit an inspection without one.</Text>
        {!!photoSelectionError && <Notice error>{photoSelectionError}</Notice>}
        {selectedPhoto ? <Image accessibilityLabel="Selected photograph preview" contentFit="cover" source={{ uri: selectedPhoto.uri }} style={{ borderRadius: 10, height: 190, maxWidth: '100%', width: 300 }} /> : null}
        <AdminField palette={p} label="Photograph caption" value={caption} onChangeText={setCaption} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><AdminButton palette={p} disabled={busy || dirty || photoUploading} tone="secondary" label={selectedPhoto ? 'Choose another photograph' : 'Choose photograph'} icon="camera" onPress={() => void choosePhoto()} />{selectedPhoto ? <AdminButton palette={p} disabled={busy || dirty || photoUploading} tone="secondary" label={photoUploading ? 'Uploading photograph…' : 'Upload photograph'} icon="upload" onPress={() => void run(uploadPhoto, 'Photograph saved.')} /> : null}</View>
      </View>}
      <AdminButton palette={p} disabled={busy || dirty || photoUploading || !!selectedPhoto} label="Continue to review and submit" onPress={() => setStep('submit')} />
      {selectedPhoto && <Text style={{ color: p.amber }}>Upload or discard the selected photo before continuing.</Text>}
      {selectedPhoto && <AdminButton palette={p} tone="secondary" label="Discard selected photo" onPress={() => setSelectedPhoto(null)} />}
    </AdminPanel>}
    {!confirmation && step === 'submit' && <AdminPanel palette={p} title="Review and submit" subtitle={computation ? `${computation.edition} · Input revision ${computation.input_revision}` : data.settings.active_edition}>
      <Text style={{ color: p.text, lineHeight: 24 }}>Saved date: {sample.surveyed_at?.slice(0, 10) ?? 'Missing'} · Area: {sample.area_sqm} m² · {distresses.length} distress records · {photos.length} photos</Text>
      {sample.no_distress_confirmed && <Text style={{ color: p.text }}>Inspector explicitly confirmed no distress.</Text>}
      {editable && submitIssues.length > 0 && <Notice error>{submitIssues.join(' ')}</Notice>}
      <AdminButton palette={p} tone="secondary" label={traceOpen ? 'Hide calculation details' : 'Show calculation details'} onPress={() => setTraceOpen(!traceOpen)} />
      {traceOpen && (computation?.output_snapshot ? <PciResultDetails result={computation.output_snapshot} /> : <Notice>No D6433-07 calculation saved. Submitted measurements need a private, reviewed reference package; prototype curves are never used here.</Notice>)}
      {traceOpen && sample.workflow_state==='submitted' && computation?.verification==='pending' && <AdminButton tone="secondary" palette={p} disabled={busy} label="Calculate PCI" onPress={()=>void run(()=>calculateProvisional('sample',sample.id),'PCI computed.')} />}

      {editable && !confirmation && <View style={{ marginTop: 16 }}><AdminButton palette={p} disabled={busy || dirty || submitIssues.length > 0} label="Submit for engineer review" onPress={() => setConfirmation('submit')} /></View>}
      {reviewer && !computation?.output_snapshot && <Notice>No PCI has been saved for this revision yet. Show calculation details and calculate it before approving.</Notice>}
      {reviewer && DEMO_PREVIEW_ENABLED && sample.workflow_state === 'submitted' && <View style={{ gap: 10, marginTop: 12 }}>
        <AdminButton palette={p} tone="secondary" label={simulatedApproval ? 'Clear simulated approval' : 'Simulate approval (demo only)'} onPress={() => setSimulatedApproval(!simulatedApproval)} />
        {simulatedApproval && <Notice>SYNTHETIC DEMO — approval simulated on this screen only. Nothing was saved to the database; the sample remains Submitted. It is not a verified ASTM D6433-07 result and cannot be published.</Notice>}
      </View>}
      {reviewer && !confirmation && ['submitted', 'approved'].includes(sample.workflow_state) && <View style={{ gap: 12, marginTop: 16 }}>
        <AdminField palette={p} label="Engineer review comments (required when returning)" multiline value={comments} onChangeText={setComments} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{sample.workflow_state === 'submitted' && <AdminButton palette={p} disabled={busy || !comments.trim()} tone="secondary" label="Return for correction" onPress={() => setConfirmation('return')} />}
          <AdminButton palette={p} disabled={busy || !computation?.output_snapshot} label={sample.workflow_state === 'approved' ? 'Publish approved result' : 'Approve result'} onPress={() => setConfirmation(sample.workflow_state === 'approved' ? 'publish' : 'approve')} /></View>
      </View>}

    </AdminPanel>}
      {!!confirmation && <View style={{ gap: 12, padding: 16, marginTop: 14, borderWidth: 1, borderColor: p.border, borderRadius: 10 }}>
        <Text style={{ color: p.text }}>Confirm {confirmation.startsWith('remove:') ? 'removing this distress measurement' : confirmation.startsWith('photo:') ? 'removing this photograph' : confirmation}? {confirmation === 'submit' ? 'Your saved inputs will become read-only.' : 'This action is recorded in the review history.'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><AdminButton palette={p} disabled={busy} label="Confirm" onPress={() => void (async () => { if (await run(() => confirmation.startsWith('remove:') ? workflowAction(sample, 'remove_distress', { id: confirmation.slice(7) }) : confirmation.startsWith('photo:') ? removePhoto(photos.find(photo => photo.id === confirmation.slice(6))!) : workflowAction(sample, confirmation, { comments }), 'Workflow updated.')) setConfirmation(null); })()} /><AdminButton palette={p} tone="secondary" label="Cancel" onPress={() => setConfirmation(null)} /></View>
      </View>}
    {step === 'submit' && traceOpen && <AdminPanel palette={p} title="Review & change history"><View style={{ gap: 12 }}>
      {data.history.filter(h => h.sample_unit_id === sample.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(h => <Text key={h.id} selectable style={{ color: p.text }}>{new Date(h.created_at).toLocaleString()} · {h.action} · Revision {h.revision}{h.comments ? `\n${h.comments}` : ''}</Text>)}
      {data.computations.filter(c => c.sample_unit_id === sample.id).sort((a, b) => b.input_revision - a.input_revision).map(c => <View key={c.id} style={{ borderTopWidth: 1, borderColor: p.border, paddingTop: 10, gap: 5 }}>
        <Text style={{ color: p.text, fontWeight: '700' }}>Saved {c.edition} input · Revision {c.input_revision}</Text>
        {c.edition === EDITION && c.input_snapshot?.distresses?.map(d => <Text key={d.id} selectable style={{ color: p.muted, lineHeight: 20 }}>{c.input_snapshot?.report_context?.distress_names?.[d.distress_type_id] ?? 'Saved distress'} · {d.severity ?? 'No severity level'} · Q {d.quantity} {d.unit_of_measure} · Parts: {d.measurement_details?.measurement_parts?.map(describePart).join('; ') ?? 'not captured in this earlier revision'} · {d.measurement_details?.severity_guidance ? `${d.measurement_details.severity_guidance.version}: ${d.measurement_details.severity_guidance.text}` : 'Draft guidance was not captured in this earlier revision.'}</Text>)}
      </View>)}
    </View></AdminPanel>}
  </View>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const label = normalizeDistressSeverity(severity);
  if (!label) return null;
  const colors = getDistressSeverityColors(label);
  return <View style={{ backgroundColor: colors.backgroundColor, borderColor: colors.borderColor, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.textColor, fontSize: 11, fontWeight: '800' }}>{label}</Text></View>;
}

function PciResultDetails({result}:{result:CalculationOutput & Partial<SampleOutput>}) {
  const p=useAdminPalette();
  return <View style={{gap:12,marginTop:14}}>
    {result.groups?.map((g,i)=><View key={i} style={{gap:4}}><Text style={{color:p.text}}>{result.edition === EDITION ? ASPHALT_CATALOG.find(d=>d.code===g.code)?.name : `Saved ${result.edition} distress code ${g.code}`} · {g.severity ?? 'Not applicable'} · {g.quantity} {g.unit}</Text><Text style={{color:p.muted}}>Density {g.density.toFixed(4)} · DV {g.deduct_value.toFixed(2)}</Text></View>)}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><ResultMetric label="TDV (before fractional trim)" value={formatMetric(result.total_deduct_value,2)} /><ResultMetric label="Allowable deducts (m)" value={result.iterations.length ? formatMetric(result.allowable_deducts,6) : 'Shortcut: not applicable'} /><ResultMetric label="Maximum CDV" value={formatMetric(result.max_corrected_deduct_value,2)} /><ResultMetric label="PCI" value={formatMetric(result.pci,2)} /><ResultMetric label="Saved condition" value={result.condition} /></View>
    {result.iterations.map((iteration, index) => <View key={index} style={{ borderTopWidth: 1, borderColor: p.border, paddingTop: 10, gap: 4 }}>
      <Text selectable style={{ color: p.text }}>Iteration {index + 1} ? q {iteration.q} ? TDV {formatMetric(iteration.total_deduct_value, 2)} ? CDV {formatMetric(iteration.corrected_deduct_value, 2)}</Text>
      <Text selectable style={{ color: p.muted }}>Retained deducts: {iteration.adjusted_deducts.map(value => formatMetric(value, 2)).join(', ')}</Text>
    </View>)}
    <Text style={{color:p.muted}}>Full precision is saved; displayed numbers are rounded. {result.reference_id ?? 'Legacy reference'} {result.reference_digest ?? ''}</Text>
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
