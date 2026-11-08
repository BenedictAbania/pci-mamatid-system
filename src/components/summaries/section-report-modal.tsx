import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { AdminPalette } from '@/components/admin/admin-shell';
import { sectionBreakdown, type SectionSample, type SectionSummary } from '@/lib/data/summary-data';
import { useAppTheme } from '@/providers/ThemeProvider';
import { ConditionPill, InfoRows, ReportCard, ReportFrame, ScoreCard, area, one } from './report-frame';

type Tab = 'overview' | 'samples' | 'computation';
const TABS = [{ value: 'overview', label: 'Overview' }, { value: 'samples', label: 'Sample Units' }, { value: 'computation', label: 'Computation' }] as const;
const su = (n: number) => `SU-${String(n).padStart(3, '0')}`;

/** Viewer report for one published section: frozen sample results and the §11.1 area weighting. */
export function SectionReportModal({ palette: p, row, onClose, onViewSample, hidden = false }: {
  palette: AdminPalette; row: SectionSummary | null; onClose: () => void; onViewSample: (sampleResultId: string) => void; hidden?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const { width } = useWindowDimensions();
  const dark = useAppTheme().colorScheme === 'dark';
  if (!row) return null;
  const wide = width >= 760;
  const close = () => { setTab('overview'); onClose(); };
  const breakdown = sectionBreakdown(row);

  return <ReportFrame palette={p} visible={!hidden} title={`Section Details - ${row.section_name}`} tabs={TABS} tab={tab} onTab={setTab} onClose={close}>
    {tab === 'overview' && <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
      <ReportCard palette={p} style={{ flex: 1.5 }}>
        <Text style={{ color: p.text, fontSize: 19, fontWeight: '700', marginBottom: 6 }}>Section Information</Text>
        <InfoRows palette={p} rows={[['Branch', row.branch_name], ['Section', row.section_name], ['Pavement Type', 'Asphalt (AC)'],
          ['Section Area', row.area_sqm === null ? '—' : `${area(Number(row.area_sqm))} m²`], ['Total Sample Units', row.total_sample_units === null ? '—' : String(row.total_sample_units)],
          ['Inspected Sample Units', String(row.inspected)]]} />
      </ReportCard>
      <ScoreCard palette={p} label="Section PCI" pci={Number(row.pci)} dark={dark} tinted suffix="" />
    </View>}

    {tab === 'samples' && <ReportCard palette={p}>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>Inspected Sample Units</Text>
      <Text style={{ color: p.text, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>• {row.section_name}  • {row.samples.length} inspected sample units</Text>
      <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
        <View accessibilityLabel="Inspected sample units" style={{ minWidth: 640, flex: 1 }}>
          <View style={{ flexDirection: 'row', backgroundColor: p.blueSoft, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
            {SAMPLE_COLUMNS.map(c => <Text key={c.label} style={{ flex: c.flex, color: p.text, fontWeight: '700', fontSize: 14, textAlign: c.align }}>{c.label}</Text>)}
          </View>
          {row.samples.map((s, i) => <View key={s.id} accessibilityLabel={`${su(s.unit_number)}, ${s.sample_type}, ${one(Number(s.area_sqm))} m², PCI ${one(Number(s.pci))}, ${s.condition}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: p.border }}>
            <Text style={{ flex: SAMPLE_COLUMNS[0].flex, color: p.text, fontWeight: '700' }}>{i + 1}</Text>
            <Text style={{ flex: SAMPLE_COLUMNS[1].flex, color: p.blue, fontWeight: '700', textAlign: 'center' }}>{su(s.unit_number)}</Text>
            <Text style={{ flex: SAMPLE_COLUMNS[2].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{s.sample_type === 'additional' ? 'Additional' : 'Random'}</Text>
            <Text style={{ flex: SAMPLE_COLUMNS[3].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{area(Number(s.area_sqm))}</Text>
            <Text style={{ flex: SAMPLE_COLUMNS[4].flex, color: p.text, fontWeight: '700', textAlign: 'center' }}>{one(Number(s.pci))}</Text>
            <View style={{ flex: SAMPLE_COLUMNS[5].flex, alignItems: 'center' }}><ConditionPill pci={Number(s.pci)} dark={dark} /></View>
            <View style={{ flex: SAMPLE_COLUMNS[6].flex, alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`View ${su(s.unit_number)}`} onPress={() => onViewSample(s.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: p.border, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: p.panel }}>
                <Feather name="eye" size={14} color={p.blue} /><Text style={{ color: p.blue, fontWeight: '700', fontSize: 13 }}>View</Text>
              </Pressable>
            </View>
          </View>)}
        </View>
      </ScrollView>
    </ReportCard>}

    {tab === 'computation' && <ReportCard palette={p} style={{ gap: 12 }}>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>Section PCI Computation</Text>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: wide ? 'flex-start' : 'stretch' }}>
        <View style={{ flex: 1, gap: 12 }}>
          <FormulaBox palette={p} title="Random Sample Calculation" note="Area-weighted PCI of random sample units">
            <Text accessibilityLabel="PCIr = sum of PCIri times Ari, divided by sum of Ari" style={{ color: p.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{'PCIr = Σ(PCIri × Ari)\n─────────────\nΣAri'}</Text>
          </FormulaBox>
          {breakdown.additional.length ? <FormulaBox palette={p} title="Final Section PCI" note="With additional sample units (Eq. 7)">
            <Text style={{ color: p.text, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{'PCIs = [PCIr × (A − ΣAa) + Σ(PCIa × Aa)] ÷ A'}</Text>
          </FormulaBox> : <FormulaBox palette={p} title="Final Section PCI" note={breakdown.census ? '(All sample units inspected)' : '(No additional samples)'}>
            <Text style={{ color: p.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>PCIs = PCIr</Text>
          </FormulaBox>}
        </View>
        <View style={{ flex: 1.4, gap: 12 }}>
          <SampleProducts palette={p} title="Random Sample Computation" rows={breakdown.random} totalArea={breakdown.randomArea} totalProduct={breakdown.randomProduct}
            result={`PCIr = ${area(breakdown.randomProduct)} ÷ ${area(breakdown.randomArea)} = ${one(breakdown.randomMean)}`} />
          {!!breakdown.additional.length && <SampleProducts palette={p} title="Additional Sample Computation" rows={breakdown.additional} totalArea={breakdown.additionalArea} totalProduct={breakdown.additionalProduct}
            result={`PCIs = [${one(breakdown.randomMean)} × (${area(Number(row.area_sqm))} − ${area(breakdown.additionalArea)}) + ${area(breakdown.additionalProduct)}] ÷ ${area(Number(row.area_sqm))} = ${one(breakdown.sectionPci)}`} />}
        </View>
        <View style={{ flex: 0.9 }}><ScoreCard palette={p} label="Section PCI" pci={Number(row.pci)} dark={dark} tinted suffix="" /></View>
      </View>
    </ReportCard>}
  </ReportFrame>;
}

const SAMPLE_COLUMNS = [
  { label: '#', flex: 0.4, align: 'left' as const }, { label: 'Sample Unit', flex: 1.1, align: 'center' as const }, { label: 'Sample Type', flex: 1.1, align: 'center' as const },
  { label: 'Area (m²)', flex: 0.9, align: 'center' as const }, { label: 'PCI', flex: 0.7, align: 'center' as const }, { label: 'Condition Rating', flex: 1.4, align: 'center' as const }, { label: 'Action', flex: 0.9, align: 'center' as const },
];

function FormulaBox({ palette: p, title, note, children }: { palette: AdminPalette; title: string; note: string; children: ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 8, overflow: 'hidden', backgroundColor: p.panel }}>
    <View style={{ backgroundColor: p.blueSoft, paddingVertical: 6, paddingHorizontal: 10 }}>
      <Text style={{ color: p.text, fontWeight: '700' }}>{title}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{note}</Text>
    </View>
    <View style={{ padding: 14 }}>{children}</View>
  </View>;
}

function SampleProducts({ palette: p, title, rows, totalArea, totalProduct, result }: { palette: AdminPalette; title: string; rows: SectionSample[]; totalArea: number; totalProduct: number; result: string }) {
  const cell = (flex: number, text: string, bold = false) => <Text style={{ flex, color: p.text, fontSize: 13, fontWeight: bold ? '700' : '500', textAlign: 'center' }}>{text}</Text>;
  return <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 8, padding: 10, gap: 4, backgroundColor: p.panel }}>
    <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>{title}</Text>
    <View style={{ flexDirection: 'row', backgroundColor: p.blueSoft, borderRadius: 6, paddingVertical: 6 }}>{cell(1, 'SU ID', true)}{cell(0.8, 'PCI', true)}{cell(1, 'Area (m²)', true)}{cell(1.2, 'PCI × Area', true)}</View>
    {rows.map(s => <View key={s.id} accessibilityLabel={`${su(s.unit_number)}: PCI ${one(Number(s.pci))} × ${area(Number(s.area_sqm))} = ${area(Number(s.pci) * Number(s.area_sqm))}`} style={{ flexDirection: 'row', paddingVertical: 3 }}>
      {cell(1, su(s.unit_number))}{cell(0.8, one(Number(s.pci)))}{cell(1, area(Number(s.area_sqm)))}{cell(1.2, area(Number(s.pci) * Number(s.area_sqm)))}
    </View>)}
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: p.border, paddingTop: 4 }}>{cell(1, 'Σ', true)}{cell(0.8, '-')}{cell(1, area(totalArea), true)}{cell(1.2, area(totalProduct), true)}</View>
    <Text accessibilityLabel={result} style={{ color: p.text, fontWeight: '700', textAlign: 'center', backgroundColor: p.blueSoft, borderRadius: 6, paddingVertical: 6, marginTop: 4 }}>{result}</Text>
  </View>;
}
