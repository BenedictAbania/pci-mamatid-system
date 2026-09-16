import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice, useWorkflow } from '@/components/workflow/shared';
import { possibleSampleUnits } from '@/lib/pci-service';
import { callWorkflow } from '@/lib/workflow-data';
import { useAuth } from '@/providers/AuthProvider';

export default function Sampling() {
  const state = useWorkflow();
  const p = useAdminPalette();
  const { role, user } = useAuth();
  const [sectionId, setSectionId] = useState('');
  const [inspector, setInspector] = useState('');
  const [reviewer, setReviewer] = useState(user?.id ?? '');
  const [total, setTotal] = useState('');
  const [required, setRequired] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rationale, setRationale] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [additional, setAdditional] = useState(false);
  const [unit, setUnit] = useState('');
  const [startM, setStartM] = useState('');
  const [endM, setEndM] = useState('');
  const section = state.data?.sections.find(s => s.id === sectionId);
  const recommendation = useMemo(() => { try { return section?.area_sqm ? possibleSampleUnits(Number(section.area_sqm)) : null; } catch { return null; } }, [section]);
  const planned = state.data?.samples.filter(s => s.section_id === sectionId) ?? [];
  const input = (label: string, value: string, onChangeText: (text: string) => void) => <AdminField palette={p} label={label} value={value} onChangeText={onChangeText} />;
  return <AdminShell title="Sample-unit planning" subtitle="Engineer-defined homogeneous boundaries and traceable random / additional sample selection." loading={state.loading} onRefresh={() => void state.refresh()}>
    {!!state.error && <Notice error>{state.error}</Notice>}{!!state.message && <Notice>{state.message}</Notice>}
    <Notice>Area-based counts are layout estimates, not automatic homogeneous sections. The ASTM required-inspection sampling procedure still needs a verified reference implementation. An engineer must supply and justify the required count; no statistical rule is invented.</Notice>
    {state.data && <AdminPanel palette={p} title="Section plan"><View style={{ gap: 16 }}>
      <Choices label="Pavement section" value={sectionId} options={state.data.sections.map(s => ({ value: s.id, label: s.name }))} onChange={id => { setSectionId(id); setConfirm(false); setAdditional(false); const s = state.data?.sections.find(x => x.id === id); setStart(s?.start_description ?? ''); setEnd(s?.end_description ?? ''); }} />
      {section && <>
        <Text style={{ color: p.text }}>{section.area_sqm ?? '—'} m² · {section.length_meters ?? '—'} m long · {section.width_meters ?? '—'} m wide</Text>
        <Text style={{ color: p.muted }}>{recommendation ? `Estimated ${recommendation.count} possible units at ${recommendation.areaPerUnit.toFixed(1)} m² each. ${recommendation.needsAdjustment ? 'Layout adjustment required.' : 'Engineer confirmation required.'}` : 'Enter valid section dimensions in Road Network first.'}</Text>
        {role === 'admin' && <Notice>Administrators manage the road inventory. A signed-in civil engineer confirms the boundaries, required count and final sampling plan.</Notice>}
        <Choices label="Assigned field inspector" value={inspector} options={state.data.profiles.filter(u => u.role === 'encoder' && u.is_active !== false).map(u => ({ value: u.id, label: u.full_name || u.id }))} onChange={setInspector} />
        {!planned.length && <>
          <Choices label="Independent review engineer" value={reviewer} options={state.data.profiles.filter(u => u.role === 'reviewer' && u.is_active !== false).map(u => ({ value: u.id, label: u.full_name || u.id }))} onChange={setReviewer} />
          {input('Start location / chainage description', start, setStart)}{input('End location / chainage description', end, setEnd)}
          {input('Total possible sample units (engineer adjusted)', total, setTotal)}
          {recommendation && <AdminButton palette={p} tone="secondary" label={`Use estimate: ${recommendation.count} units`} onPress={() => setTotal(String(recommendation.count))} />}
          {input('Required random inspections (engineer-specified)', required, setRequired)}
          {input('Sampling rationale, boundary confirmation and reference', rationale, setRationale)}
          <Choices label="Engineering confirmation" value={confirm ? 'yes' : 'no'} options={[{ value: 'no', label: 'Not confirmed' }, { value: 'yes', label: 'I confirm homogeneous boundaries and sample count' }]} onChange={v => setConfirm(v === 'yes')} />
          <AdminButton palette={p} disabled={state.busy || !confirm || role !== 'reviewer'} label="Confirm plan & randomly select required units" onPress={() => void state.run(async () => {
            if (!Number.isInteger(Number(total)) || !Number.isInteger(Number(required)) || Number(required) < 1 || Number(required) > Number(total)) throw new Error('Use positive whole-number counts; required cannot exceed total.');
            await callWorkflow('lakad_plan_samples', { target: sectionId, payload: { total: Number(total), required: Number(required), inspector, reviewer, start, end, rationale } });
          }, 'Plan confirmed. The database generated and recorded the random selection.')} />
        </>}
        {!!planned.length && <>
          <Notice>This plan is locked against boundary changes. Create a new section revision for a materially different layout.</Notice>
          {planned.sort((a, b) => a.unit_number - b.unit_number).map(s => <Text key={s.id} style={{ color: p.text }}>SU-{String(s.unit_number).padStart(3, '0')} · {s.sample_type} · {s.start_m}–{s.end_m} m · {s.workflow_state}</Text>)}
          <AdminButton palette={p} tone="secondary" label="Plan an additional sample" disabled={role !== 'reviewer'} onPress={() => setAdditional(!additional)} />
          {additional && <>
            <Notice>Choose an unselected sequential unit from this section. Do not duplicate an existing random sample. Describe the unusual/severe condition.</Notice>
            {input('Unselected sample-unit number', unit, setUnit)}{input('Start metre within section', startM, setStartM)}{input('End metre within section', endM, setEndM)}{input('Additional sample justification', rationale, setRationale)}
            <AdminButton palette={p} disabled={state.busy || role !== 'reviewer'} label="Confirm additional sample" onPress={() => void state.run(() => callWorkflow('lakad_additional_sample', { target: sectionId, payload: { unit: Number(unit), start_m: Number(startM), end_m: Number(endM), inspector, rationale } }))} />
          </>}
        </>}
      </>}
    </View></AdminPanel>}
  </AdminShell>;
}
