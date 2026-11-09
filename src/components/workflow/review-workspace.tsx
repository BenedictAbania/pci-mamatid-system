import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AdminButton, AdminField, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { StatusBadge } from '@/components/dashboard/dashboard-parts';
import { Notice } from '@/components/workflow/shared';
import { Card, DISTRESS_COLUMNS, Heading, InspectionProgress, TableRow, ValueBox, formatNumber } from '@/components/workflow/distress-entry';
import { InspectionResults, currentOutput } from '@/components/workflow/inspection-results';
import { distressLabel, photoGroups, PhotoGroups } from '@/components/workflow/distress-photos';
import { brand, layout } from '@/lib/ui/design-system';
import { calculateProvisional, workflowAction, type Sample, type WorkflowData } from '@/lib/data/workflow-data';
import type { SeverityCode } from '@/lib/d6433-07/severity-guidance';
import { useAuth } from '@/providers/AuthProvider';

type Run = (task: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Decision = 'approve' | 'return' | 'publish';
const SEVERITY_LETTERS: Record<SeverityCode, string> = { low: 'L', medium: 'M', high: 'H' };
const REVIEW_COLUMNS = DISTRESS_COLUMNS.slice(0, 6);
const CONFIRM_TEXT: Record<Decision, { title: string; detail: string; button: string; success: string }> = {
  approve: { title: 'Approve this result?', detail: 'The inspection and its PCI are locked. You can publish it afterwards.', button: 'Confirm approval', success: 'Result approved.' },
  return: { title: 'Return this inspection to the encoder?', detail: 'The encoder can edit the distresses again. Your comments are sent with it.', button: 'Confirm return', success: 'Inspection returned for correction.' },
  publish: { title: 'Publish this approved result?', detail: 'Viewers will see the PCI in the published summaries.', button: 'Confirm publish', success: 'Result published.' },
};

/**
 * Civil Engineer review of one submitted sample unit. Same layout as the encoder's
 * distress entry, read-only, with one decision card at the end.
 */
export function ReviewWorkspace({ sample, data, busy, run, error }: { sample: Sample; data: WorkflowData; busy: boolean; run: Run; error?: string }) {
  const p = useAdminPalette();
  const { width } = useWindowDimensions();
  const { role, user } = useAuth();
  const wide = width >= layout.columns;
  const [historyOpen, setHistoryOpen] = useState(false);

  const section = data.sections?.find(s => s.id === sample.section_id);
  const branch = data.branches?.find(b => b.id === section?.branch_id);
  const records = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const rows = records.flatMap(record => {
    const parts = record.measurement_details?.measurement_parts;
    return (parts?.length ? parts : [null]).map((part, index) => ({ key: `${record.id}-${index}`, record, part }));
  });
  const output = currentOutput(sample, data);
  const computation = data.computations.find(c => c.id === sample.computation_id);
  const reviewer = role === 'reviewer' && sample.reviewer_id === user?.id && sample.assigned_to !== user?.id;
  const inspector = data.profiles.find(u => u.id === sample.assigned_to)?.full_name ?? 'Assigned encoder';
  const history = data.history.filter(h => h.sample_unit_id === sample.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = [sample.workflow_state !== 'planned', records.length > 0, !!output, !!output, !!output, !!output];

  const details = <Card palette={p} title="1. Sample Unit Information">
    <ValueBox palette={p} label={`Sample unit area: ${sample.area_sqm ? `${formatNumber(Number(sample.area_sqm))} m²` : 'not measured'}`} value={sample.area_sqm ? formatNumber(Number(sample.area_sqm)) : ''} unit="m²" />
    <Detail palette={p} label="Inspection date" value={sample.surveyed_at?.slice(0, 10) ?? 'Not recorded'} />
    <Detail palette={p} label="Encoder" value={inspector} />
    <Detail palette={p} label="Orientation / sketch" value={sample.orientation_note || 'Not recorded'} />
    <Detail palette={p} label="Field measurement rules" value={sample.field_rules_confirmed ? 'Confirmed by encoder' : 'Not confirmed'} warn={!sample.field_rules_confirmed} />
    {sample.no_distress_confirmed && <Detail palette={p} label="Distress" value="Encoder confirmed no distress" />}
    {sample.latitude !== null && sample.longitude !== null && <Detail palette={p} label="Coordinates" value={`${sample.latitude}, ${sample.longitude}`} />}
    {!!sample.inspection_notes && <Detail palette={p} label="Notes" value={sample.inspection_notes} />}
  </Card>;

  const table = <View style={{ flex: wide ? 1 : undefined, minWidth: 0, borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>2. Distress Data</Text>
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
      <View accessibilityLabel="Recorded distresses" style={{ minWidth: 600, flex: 1, borderWidth: 1, borderColor: p.border, borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: brand.navy, paddingVertical: 10, paddingHorizontal: 8 }}>
          {REVIEW_COLUMNS.map(column => <Text key={column.label} style={{ flex: column.flex, color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: column.align }}>{column.label}</Text>)}
        </View>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 420 }}>
          {rows.map((row, index) => {
            const name = data.types.find(t => t.id === row.record.distress_type_id)?.name ?? 'Saved distress';
            return <TableRow key={row.key} palette={p} readOnly index={index + 1} part={row.part} name={name} selected={false}
              severity={row.record.severity ? SEVERITY_LETTERS[row.record.severity as SeverityCode] ?? row.record.severity : '—'}
              fallback={`${formatNumber(row.record.quantity)} ${row.record.unit_of_measure}`} />;
          })}
          {!rows.length && <Text style={{ color: p.muted, padding: 16, textAlign: 'center' }}>{sample.no_distress_confirmed ? 'The encoder confirmed no distress in this unit.' : 'No distress recorded.'}</Text>}
        </ScrollView>
      </View>
    </ScrollView>
  </View>;

  const groups = photoGroups(
    records.map(record => ({ id: record.id, label: distressLabel(data.types.find(t => t.id === record.distress_type_id)?.name ?? 'Saved distress', record.severity) })),
    data.photos.filter(photo => photo.sample_unit_id === sample.id),
  ).filter(group => group.photos.length);

  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Heading palette={p} title={branch?.name ?? 'Branch'} />
      <Heading palette={p} title={section?.name ?? 'Section'} />
      <Heading palette={p} title={`Sample Unit ${sample.unit_number}`} detail={`Revision ${sample.input_revision} · Encoded by ${inspector}`} />
    </View>
    <InspectionProgress palette={p} done={done} />
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
      <View style={{ width: wide ? 360 : '100%' }}>{details}</View>
      {table}
    </View>
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>Distress photos</Text>
      <PhotoGroups palette={p} groups={groups} busy={busy} empty="The encoder did not add photos. Photos are optional." />
    </View>
    <InspectionResults palette={p} sample={sample} data={data} output={output} busy={busy} confirming={false} onCancel={() => {}} onConfirm={() => {}} />
    {reviewer && <DecisionCard palette={p} sample={sample} hasPci={!!output} canCompute={sample.workflow_state === 'submitted' && !output && computation?.verification === 'pending'} busy={busy} run={run} error={error} />}
    {!!history.length && <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>Review history</Text>
        <AdminButton palette={p} tone="secondary" icon={historyOpen ? 'chevron-up' : 'chevron-down'} label={historyOpen ? 'Hide' : `Show (${history.length})`} onPress={() => setHistoryOpen(!historyOpen)} />
      </View>
      {historyOpen && history.map(h => <Text key={h.id} selectable style={{ color: p.text, lineHeight: 21 }}>{new Date(h.created_at).toLocaleString()} · {h.action} · Revision {h.revision}{h.comments ? `\n${h.comments}` : ''}</Text>)}
    </View>}
  </View>;
}

/** One calm card: status, optional comments, one primary action and one secondary action. */
function DecisionCard({ palette: p, sample, hasPci, canCompute, busy, run, error }: {
  palette: AdminPalette; sample: Sample; hasPci: boolean; canCompute: boolean; busy: boolean; run: Run; error?: string;
}) {
  const [comments, setComments] = useState('');
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const state = sample.workflow_state;
  const open = state === 'submitted' || state === 'approved';
  const message = state === 'submitted' ? 'Check the distress data and PCI above. Approve the result, or return it to the encoder with comments.'
    : state === 'approved' ? 'This result is approved. Publish it so viewers can see it.'
      : state === 'returned' ? 'Returned to the encoder. You can review it again after they resubmit.'
        : state === 'published' ? 'This result is published.' : `This inspection is ${state}. There is nothing to decide yet.`;

  function decide(decision: Decision) {
    void (async () => {
      if (await run(() => workflowAction(sample, decision, { comments }), CONFIRM_TEXT[decision].success)) { setConfirming(null); setComments(''); }
    })();
  }

  return <View accessibilityLabel="Engineer decision" style={{ borderWidth: 1, borderColor: p.border, borderLeftWidth: 4, borderLeftColor: p.blue, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>Engineer decision</Text>
      <StatusBadge state={state} palette={p} />
    </View>
    <Text style={{ color: p.muted, lineHeight: 21 }}>{message}</Text>
    {!!sample.review_notes && <Text style={{ color: p.text, lineHeight: 21 }}>Last comments: {sample.review_notes}</Text>}
    {open && !hasPci && <Notice>No PCI is saved for this revision. Compute it before approving.</Notice>}
    {!!error && <Notice error>{error}</Notice>}

    {open && !confirming && <>
      {state === 'submitted' && <AdminField palette={p} multiline label="Comments to the encoder (required to return)" value={comments} onChangeText={setComments} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
        {canCompute && <AdminButton palette={p} tone="secondary" icon="activity" label="Compute PCI" disabled={busy} onPress={() => void run(() => calculateProvisional('sample', sample.id), 'PCI computed.')} />}
        {state === 'submitted' && <AdminButton palette={p} tone="secondary" icon="corner-up-left" label="Return for correction" disabled={busy || !comments.trim()} onPress={() => setConfirming('return')} />}
        {state === 'submitted' && <AdminButton palette={p} icon="check" label="Approve result" disabled={busy || !hasPci} onPress={() => setConfirming('approve')} />}
        {state === 'approved' && <AdminButton palette={p} icon="globe" label="Publish result" disabled={busy || !hasPci} onPress={() => setConfirming('publish')} />}
      </View>
    </>}

    {confirming && <View style={{ gap: 10, padding: 14, borderRadius: 8, backgroundColor: p.panelAlt }}>
      <Text style={{ color: p.text, fontWeight: '700' }}>{CONFIRM_TEXT[confirming].title}</Text>
      <Text style={{ color: p.muted, lineHeight: 20 }}>{CONFIRM_TEXT[confirming].detail}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
        <AdminButton palette={p} tone="secondary" label="Cancel" disabled={busy} onPress={() => setConfirming(null)} />
        <AdminButton palette={p} label={busy ? 'Saving…' : CONFIRM_TEXT[confirming].button} disabled={busy} onPress={() => decide(confirming)} />
      </View>
    </View>}
  </View>;
}

function Detail({ palette: p, label, value, warn }: { palette: AdminPalette; label: string; value: string; warn?: boolean }) {
  return <View style={{ gap: 2 }}>
    <Text style={{ color: p.muted, fontSize: 13 }}>{label}</Text>
    <Text selectable style={{ color: warn ? p.amber : p.text, fontSize: 15, lineHeight: 21 }}>{value}</Text>
  </View>;
}
