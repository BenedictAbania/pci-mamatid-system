import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { AdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import { distressLabel, photoGroups, PhotoGroups } from '@/components/workflow/distress-photos';
import type { ApprovedResult } from '@/lib/data/approved-results';
import { PCI_CONDITION_SCALE, getPciConditionCategory, getPciConditionVisual } from '@/lib/pci/pci-classification';
import { getDistressSeverityColors, normalizeDistressSeverity } from '@/lib/pci/severity-colors';
import { PROVISIONAL_LABEL } from '@/lib/d6433-07/catalog';
import { formatDate } from '@/lib/utils/admin-utils';
import { useAppTheme } from '@/providers/ThemeProvider';
import { InfoRows, ReportCard, ReportFrame, ScoreCard, one, two } from './report-frame';

type Tab = 'overview' | 'distresses' | 'computation';
const TABS = [{ value: 'overview', label: 'Overview' }, { value: 'distresses', label: 'Distresses' }, { value: 'computation', label: 'Computation' }] as const;
/** Whole-number bands for display; the classifier uses the exact thresholds. */
const BANDS: Record<string, string> = { Good: '85-100', Satisfactory: '70-84', Fair: '55-69', Poor: '40-54', 'Very Poor': '25-39', Serious: '10-24', Failed: '0-9' };
type Output = ApprovedResult['report_snapshot']['output'] & { status?: string };

/** Viewer report for one published sample unit. Every value comes from the frozen snapshot. */
export function SampleReportModal({ palette: p, row, onClose }: { palette: AdminPalette; row: ApprovedResult | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const { width } = useWindowDimensions();
  const dark = useAppTheme().colorScheme === 'dark';
  if (!row) return null;
  const s = row.report_snapshot;
  const output = s.output as Output;
  const unit = String(s.sample.unit_number).padStart(3, '0');
  const category = getPciConditionCategory(Number(output.pci));
  const twoColumns = width >= 760;
  const close = () => { setTab('overview'); onClose(); };

  return <ReportFrame palette={p} title={`Sample Unit PCI Results - ${unit}`} tabs={TABS} tab={tab} onTab={setTab} onClose={close}>
    {output.status === 'provisional' && <Notice>{PROVISIONAL_LABEL}</Notice>}
    {tab === 'overview' && <>
      <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 14 }}>
        <ReportCard palette={p} style={{ flex: 1.6 }}>
          <Text style={{ color: p.text, fontSize: 19, fontWeight: '700', marginBottom: 6 }}>Sample Unit Information</Text>
          <InfoRows palette={p} rows={[['Branch', s.road.branch_name], ['Section', s.road.section_name], ['Sample Unit Area', `${s.sample.area_sqm} m²`],
            ['Sample Type', s.sample.sample_type === 'additional' ? 'Additional' : 'Random'], ['Inspection Date', formatDate(s.sample.surveyed_at)]]} />
        </ReportCard>
        <ScoreCard palette={p} label="Final PCI" pci={Number(output.pci)} dark={dark} />
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>PCI Rating Scale</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {PCI_CONDITION_SCALE.map(c => {
            const current = c.rating === category.rating;
            const look = getPciConditionVisual(c, dark);
            return <View key={c.rating} accessibilityLabel={`${c.rating}, PCI ${BANDS[c.rating]}${current ? ', this sample unit' : ''}`}
              style={{ minWidth: 78, flexGrow: 1, flexBasis: 78, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8, borderWidth: current ? 2 : 1, borderColor: current ? look.borderColor : p.border, backgroundColor: current ? look.backgroundColor : p.panelAlt }}>
              <Text style={{ color: current ? look.foregroundColor : p.text, fontWeight: '800', fontSize: 15 }}>{BANDS[c.rating]}</Text>
              <Text style={{ color: current ? look.foregroundColor : p.text, fontWeight: '700', fontSize: 13, marginTop: 4, textAlign: 'center' }}>{c.rating}</Text>
            </View>;
          })}
        </View>
      </View>
    </>}

    {tab === 'distresses' && <>
      <ReportCard palette={p}>
        <Text style={{ color: p.text, fontSize: 19, fontWeight: '700', marginBottom: 8 }}>Recorded Distresses</Text>
        <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
          <View accessibilityLabel="Recorded distresses" style={{ minWidth: 600, flex: 1 }}>
            <View style={{ flexDirection: 'row', backgroundColor: p.blueSoft, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10 }}>
              {DISTRESS_COLUMNS.map(c => <Text key={c.label} style={{ flex: c.flex, color: p.text, fontWeight: '700', fontSize: 14, textAlign: c.align }}>{c.label}</Text>)}
            </View>
            {s.distresses.map((d, i) => {
              const density = Number(d.quantity) / Number(s.sample.area_sqm) * 100;
              const unitLabel = d.unit_of_measure === 'No.' ? 'each' : d.unit_of_measure;
              return <View key={d.id} accessibilityLabel={`Distress ${i + 1}: ${d.name}, ${d.severity ?? 'no severity'}, ${one(Number(d.quantity))} ${unitLabel}, density ${two(density)}%`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: p.border }}>
                <Text style={{ flex: DISTRESS_COLUMNS[0].flex, color: p.text, fontWeight: '700' }}>{i + 1}</Text>
                <Text style={{ flex: DISTRESS_COLUMNS[1].flex, color: p.text, fontWeight: '700' }}>{d.name}</Text>
                <View style={{ flex: DISTRESS_COLUMNS[2].flex, alignItems: 'center' }}><SeverityPill palette={p} severity={d.severity} /></View>
                <Text style={{ flex: DISTRESS_COLUMNS[3].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{d.unit_of_measure === 'No.' ? String(d.quantity) : one(Number(d.quantity))}</Text>
                <Text style={{ flex: DISTRESS_COLUMNS[4].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{unitLabel}</Text>
                <Text style={{ flex: DISTRESS_COLUMNS[5].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{two(density)}</Text>
              </View>;
            })}
            {!s.distresses.length && <Text style={{ color: p.muted, padding: 14, textAlign: 'center' }}>No distress was recorded in this sample unit.</Text>}
          </View>
        </ScrollView>
      </ReportCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.blueSoft, borderRadius: 10, padding: 14 }}>
        <Feather name="info" size={20} color={p.blue} />
        <Text style={{ color: p.text, flex: 1 }}><Text style={{ fontWeight: '700' }}>Note:</Text> Distresses are recorded based on ASTM D6433-07.</Text>
      </View>
      {!!s.photos.length && <View style={{ gap: 10 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>Photos</Text>
        <PhotoGroups palette={p} groups={photoGroups(s.distresses.map(d => ({ id: d.id, label: distressLabel(d.name, d.severity) })), s.photos).filter(group => group.photos.length)} />
      </View>}
    </>}

    {tab === 'computation' && <ComputationTab palette={p} output={output} twoColumns={twoColumns}
      finalPci={<ScoreCard palette={p} label="Final PCI" pci={Number(output.pci)} dark={dark} tinted />} />}
  </ReportFrame>;
}

const DISTRESS_COLUMNS = [
  { label: '#', flex: 0.4, align: 'left' as const }, { label: 'Distress Type', flex: 2, align: 'left' as const }, { label: 'Severity', flex: 1.2, align: 'center' as const },
  { label: 'Quantity', flex: 1, align: 'center' as const }, { label: 'Unit', flex: 0.8, align: 'center' as const }, { label: 'Density (%)', flex: 1.1, align: 'center' as const },
];

function ComputationTab({ palette: p, output, finalPci, twoColumns }: { palette: AdminPalette; output: Output; finalPci: ReactNode; twoColumns: boolean }) {
  const deducts = [...(output.deduct_values ?? [])].sort((a, b) => b - a);
  const iterations = output.iterations ?? [];
  const cdv = iterations.length ? output.max_corrected_deduct_value : output.total_deduct_value;
  return <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 14, alignItems: twoColumns ? 'flex-start' : 'stretch' }}>
    <ReportCard palette={p} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}><Feather name="hash" size={22} color={p.text} /><Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>PCI Computation</Text></View>
      <View style={{ flexDirection: 'row', backgroundColor: p.blueSoft, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 }}>
        <Text style={{ flex: 0.4, color: p.text, fontWeight: '700' }}>#</Text><Text style={{ flex: 2, color: p.text, fontWeight: '700' }}>Deduct Value (DV)</Text>
      </View>
      {deducts.map((dv, i) => <View key={i} accessibilityLabel={`Deduct value ${i + 1}: ${one(dv)}`} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: p.border }}>
        <Text style={{ flex: 0.4, color: p.text, fontWeight: '700' }}>{i + 1}</Text><Text style={{ flex: 2, color: p.text, fontWeight: '700' }}>{one(dv)}</Text>
      </View>)}
      {!deducts.length && <Text style={{ color: p.muted, padding: 10 }}>No deduct values: no distress was recorded.</Text>}
      <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 8, padding: 10, gap: 6, marginTop: 10 }}>
        <SummaryLine palette={p} label="Total Deduct Value (TDV)" value={one(output.total_deduct_value)} />
        <SummaryLine palette={p} label="q (deduct values above 2)" value={String(iterations.length ? iterations[0].q : output.q ?? 0)} />
        <SummaryLine palette={p} label="Corrected Deduct Value (CDV)" value={one(cdv)} />
        <SummaryLine palette={p} label="Maximum CDV" value={one(output.max_corrected_deduct_value)} highlight />
      </View>
      {!!iterations.length && <View style={{ gap: 4, marginTop: 10 }}>
        <Text style={{ color: p.text, fontWeight: '700' }}>CDV correction (q above 1)</Text>
        {iterations.map((it, i) => <Text key={i} accessibilityLabel={`Iteration ${i + 1}: q ${it.q}, TDV ${one(it.total_deduct_value)}, CDV ${one(it.corrected_deduct_value)}`} style={{ color: p.muted }}>Iteration {i + 1}: q {it.q} · TDV {one(it.total_deduct_value)} · CDV {one(it.corrected_deduct_value)}</Text>)}
      </View>}
    </ReportCard>
    <View style={{ flex: 1, gap: 14, alignSelf: 'stretch' }}>
      {finalPci}
      <ReportCard palette={p}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Feather name="hash" size={20} color={p.text} /><Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>Formula</Text></View>
        <Text accessibilityLabel={`PCI = 100 - Maximum CDV = 100 - ${one(output.max_corrected_deduct_value)} = ${one(output.pci)}`} style={{ color: p.text, fontWeight: '700', lineHeight: 24, marginLeft: 30, marginTop: 4 }}>
          {`PCI = 100 − Maximum CDV\n     = 100 − ${one(output.max_corrected_deduct_value)}\n     = ${one(output.pci)}`}
        </Text>
      </ReportCard>
    </View>
  </View>;
}

function SummaryLine({ palette: p, label, value, highlight = false }: { palette: AdminPalette; label: string; value: string; highlight?: boolean }) {
  return <View accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, backgroundColor: highlight ? p.blueSoft : 'transparent' }}>
    <Text style={{ color: p.text, fontWeight: '700', flex: 1 }}>{label}</Text><Text style={{ color: p.text, fontWeight: '700' }}>{value}</Text>
  </View>;
}

function SeverityPill({ palette: p, severity }: { palette: AdminPalette; severity: string | null }) {
  const label = normalizeDistressSeverity(severity);
  if (!label) return <Text style={{ color: p.muted }}>N/A</Text>;
  const colors = getDistressSeverityColors(label);
  return <View style={{ backgroundColor: colors.backgroundColor, borderColor: colors.borderColor, borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16 }}>
    <Text style={{ color: colors.textColor, fontWeight: '700' }}>{label}</Text>
  </View>;
}
