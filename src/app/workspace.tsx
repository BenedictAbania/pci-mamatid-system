import { useState } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Linking, Platform, Text, View } from 'react-native';
import { AdminButton, AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { rankPriorities } from '@/lib/pci-service';
import { latestSectionResults } from '@/lib/workflow-data';
import { useAuth } from '@/providers/AuthProvider';
import { PhotoCard } from './field-inspections';

export default function Workspace() {
  const state = useWorkflow();
  const p = useAdminPalette();
  const router = useRouter();
  const { role, profile } = useAuth();
  const [report, setReport] = useState('inventory');
  const [sampleId, setSampleId] = useState('');
  const results = latestSectionResults(state.data?.results ?? []);
  const officialSamples = state.data?.samples.filter(s => ['approved', 'published'].includes(s.workflow_state) && state.data?.computations.some(c => c.id === s.computation_id && c.verification === 'verified')) ?? [];
  const priority = rankPriorities(results.map(r => ({ id: r.section_id, pci: Number(r.pci), safety: r.safety, highSeverity: r.high_severity, affectedArea: Number(r.affected_area) })), state.data?.settings.priority_safety, state.data?.settings.priority_area);
  const selected = officialSamples.find(s => s.id === sampleId);
  const calculation = state.data?.computations.find(c => c.id === selected?.computation_id);
  const sectionFor = (id: string) => state.data?.sections.find(s => s.id === id);
  const points = state.data?.sections.filter(s => s.latitude !== null && s.longitude !== null) ?? [];
  const samplePoints = state.data?.samples.filter(s => s.latitude !== null && s.longitude !== null) ?? [];
  const approvedAverage = results.length ? results.reduce((sum, r) => sum + Number(r.pci), 0) / results.length : null;
  return <AdminShell title={`Welcome, ${profile?.full_name || 'LAKAD user'}`} subtitle="Live information limited to your assigned role and authorized scope." loading={state.loading} onRefresh={() => void state.refresh()} action={role !== 'viewer' ? <AdminButton palette={p} label="Open inspections" onPress={() => router.push('/field-inspections')} /> : undefined}>
    {!!state.error && <Notice error>{state.error}</Notice>}
    {state.data && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {[['Road branches', state.data.branches.length], ['Sections', state.data.sections.length], ['Approved samples', officialSamples.length], ['Approved section PCI', approvedAverage?.toFixed(1) ?? '—'], ...(role !== 'viewer' ? ['planned', 'draft', 'submitted', 'returned'].map(status => [status, state.data!.samples.filter(s => s.workflow_state === status).length]) : [])].map(([label, value]) => <AdminPanel key={label} palette={p} style={{ flexGrow: 1, flexBasis: 160 }}><Text style={{ color: p.muted }}>{label}</Text><Text style={{ color: p.text, fontSize: 30, fontWeight: '800', marginTop: 8 }}>{value}</Text></AdminPanel>)}
      </View>
      <AdminPanel palette={p} title="Approved condition distribution & inspection progress">
        {!results.length && <Notice>No verified, approved section PCI is available. Preliminary and legacy unverified scores are excluded.</Notice>}
        {[...new Set(results.map(r => r.condition))].map(condition => { const count = results.filter(r => r.condition === condition).length; return <View key={condition} style={{ gap: 5, marginBottom: 12 }}><Text style={{ color: p.text }}>{condition}: {count} sections</Text><View style={{ backgroundColor: p.blueSoft, height: 12, borderRadius: 6 }}><View style={{ backgroundColor: p.blue, height: 12, width: `${count / results.length * 100}%`, borderRadius: 6 }} /></View></View>; })}
        <Text style={{ color: p.muted, marginTop: 12 }}>{officialSamples.length} of {state.data.samples.length} visible sample units approved. {state.data.samples.filter(s => s.workflow_state === 'submitted').length} awaiting review.</Text>
      </AdminPanel>
      <AdminPanel palette={p} title="Section PCI completion">
        <View style={{ gap: 12 }}>{state.data.sections.map(s => {
          const units = state.data!.samples.filter(u => u.section_id === s.id && u.sample_type === 'random');
          const approved = units.filter(u => officialSamples.some(a => a.id === u.id)).length;
          const result = results.find(r => r.section_id === s.id);
          return <Text key={s.id} style={{ color: p.text }}>{s.name} · {result ? `Approved PCI ${result.pci} — ${result.condition}` : `Incomplete: ${approved}/${s.recommended_sample_units ?? '?'} required random inspections approved. ${units.length ? 'Verified section aggregation pending.' : 'Sampling plan not confirmed.'}`}</Text>;
        })}</View>
      </AdminPanel>
      <AdminPanel palette={p} title="Maintenance priorities" subtitle="LAKAD prioritization rules — not ASTM PCI formulas.">
        {priority.map(r => <View key={r.id} style={{ gap: 5, marginBottom: 14 }}><Text style={{ color: p.text, fontWeight: '700' }}>{r.rank}. {sectionFor(r.id)?.name} — PCI {r.pci}</Text><Text style={{ color: p.muted }}>{r.reason}</Text></View>)}
        {!priority.length && <AdminEmpty palette={p} icon="tool" message="No approved section results to rank. No demonstration scores are used." />}
      </AdminPanel>
      <AdminPanel palette={p} title="Stored road locations" subtitle="Open actual recorded coordinates in OpenStreetMap. No fabricated locations or automatic GIS subdivision.">
        {!points.length && !samplePoints.length && <AdminEmpty palette={p} icon="map-pin" message="No coordinates have been recorded in your authorized scope." />}
        <View style={{ gap: 12 }}>{[...points.map(s => ({ id: s.id, label: s.name, lat: s.latitude!, lon: s.longitude! })), ...samplePoints.map(s => ({ id: s.id, label: `${sectionFor(s.section_id)?.name} · SU-${s.unit_number}`, lat: s.latitude!, lon: s.longitude! }))].map(point => <View key={point.id} style={{ gap: 6 }}><Text style={{ color: p.text }}>{point.label} · {point.lat}, {point.lon}</Text><AdminButton palette={p} tone="secondary" label="Open recorded location on map" onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=18/${point.lat}/${point.lon}`)} /></View>)}</View>
      </AdminPanel>
      <AdminPanel palette={p} title="Reports" subtitle="Official report content includes only verified approved/published results. Use browser Print → Save as PDF.">
        <View style={{ gap: 16 }}>
          <Choices label="Report type" value={report} options={[{ value: 'inventory', label: 'Road-condition inventory' }, { value: 'section', label: 'Section PCI summary' }, { value: 'priority', label: 'Maintenance ranking' }, { value: 'sample', label: 'Sample inspection' }]} onChange={setReport} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Image source={require('../../assets/images/LAKAD.png')} style={{ width: 52, height: 52 }} contentFit="contain" /><View><Text style={{ color: p.text, fontSize: 23, fontWeight: '800' }}>LAKAD</Text><Text style={{ color: p.muted }}>Where Data Meets the Road</Text></View></View>
          <Text style={{ color: p.text, fontWeight: '700' }}>Approved information · {new Date().toLocaleDateString()}</Text>
          {(report === 'inventory' || report === 'section') && results.map(r => <View key={r.id} style={{ gap: 5 }}><Text style={{ color: p.text }}>{state.data?.branches.find(b => b.id === sectionFor(r.section_id)?.branch_id)?.name} / {sectionFor(r.section_id)?.name} · PCI {r.pci} · {r.condition}</Text><Text selectable style={{ color: p.muted }}>{r.edition} · {r.method} · Published {new Date(r.published_at).toLocaleString()}{`\n`}Sample computations: {r.sample_computation_ids.join(', ')}{`\n`}Weights: {JSON.stringify(r.weights)}</Text></View>)}
          {report === 'priority' && priority.map(r => <Text key={r.id} style={{ color: p.text }}>{r.rank}. {sectionFor(r.id)?.name} · {r.reason}</Text>)}
          {report === 'sample' && <>
            <Choices label="Approved sample unit" value={sampleId} options={officialSamples.map(s => ({ value: s.id, label: `${sectionFor(s.section_id)?.name} · SU-${s.unit_number}` }))} onChange={setSampleId} />
            {!!selected && <>
              <Text selectable style={{ color: p.text }}>{sectionFor(selected.section_id)?.name} / SU-{selected.unit_number}{`\n`}Status: {selected.workflow_state} · Inspected {selected.surveyed_at}{`\n`}Inspector: {state.data.profiles.find(u => u.id === selected.surveyed_by)?.full_name ?? selected.surveyed_by}{`\n`}Reviewer: {state.data.profiles.find(u => u.id === selected.reviewed_by)?.full_name ?? selected.reviewed_by}{`\n`}Reviewed: {selected.reviewed_at}{`\n`}{calculation?.edition} · Reference {calculation?.reference_id}{`\n`}{selected.inspection_notes}</Text>
              {state.data.distresses.filter(d => d.sample_unit_id === selected.id).map(d => <Text key={d.id} style={{ color: p.text }}>{state.data?.types.find(t => t.id === d.distress_type_id)?.name} · {d.severity ?? 'Not applicable'} · {d.quantity} {d.unit_of_measure} · {d.notes}</Text>)}
              <Text selectable style={{ color: p.text }}>{JSON.stringify(calculation?.output_snapshot, null, 2)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{state.data.photos.filter(photo => photo.sample_unit_id === selected.id).map(photo => <PhotoCard key={photo.id} photo={photo} />)}</View>
            </>}
          </>}
          {!results.length && report !== 'sample' && <Text style={{ color: p.muted }}>No official section results available.</Text>}
          {Platform.OS === 'web' && <AdminButton palette={p} tone="secondary" label="Print / Save as PDF" disabled={report === 'sample' ? !selected : !results.length} onPress={() => window.print()} />}
        </View>
      </AdminPanel>
      <AdminPanel palette={p} title="Recent activity"><View style={{ gap: 12 }}>{state.data.history.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10).map(h => <Text key={h.id} style={{ color: p.text }}>{new Date(h.created_at).toLocaleString()} · {h.action} · {h.comments || `Revision ${h.revision}`}</Text>)}{role === 'admin' && state.data.audit.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10).map(h => <Text key={h.id} style={{ color: p.text }}>{new Date(h.created_at).toLocaleString()} · {h.action}</Text>)}{!state.data.history.length && !state.data.audit.length && <Text style={{ color: p.muted }}>No activity in your authorized scope.</Text>}</View></AdminPanel>
    </>}
  </AdminShell>;
}
