import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AdminButton, AdminField, type AdminPalette } from '@/components/admin/admin-shell';
import { brand, layout } from '@/lib/ui/design-system';
import { ASPHALT_CATALOG, EDITION } from '@/lib/d6433-07/catalog';
import { clampPci, getPciConditionCategory, getPciConditionVisual } from '@/lib/pci/pci-classification';
import type { Computation, FinishDetails, Sample, WorkflowData } from '@/lib/data/workflow-data';
import { useAppTheme } from '@/providers/ThemeProvider';

const SEVERITY_NAMES: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
type Output = NonNullable<Computation['output_snapshot']>;
type DeductRow = { key: string; name: string; severity: string; quantity: string; density: string; deduct: string };

function fixed(value: number | undefined, digits: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '';
}
function trim(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

/** The saved D6433-07 output for the current revision, or null before Finish inspection. */
export function currentOutput(sample: Sample, data: WorkflowData): Output | null {
  const computation = data.computations.find(c => c.id === sample.computation_id);
  return computation?.edition === EDITION && computation.input_revision === sample.input_revision && computation.output_snapshot ? computation.output_snapshot : null;
}

/**
 * Steps 3–6: deduct values, maximum CDV, PCI and rating. Visible before the inspection is
 * finished with empty values. When more than one deduct value exceeds 2 (q > 1), the
 * §9.5 CDV iteration table replaces the total-deduct shortcut.
 */
export function InspectionResults({ palette: p, sample, data, output, confirming, busy, onCancel, onConfirm }: {
  palette: AdminPalette; sample: Sample; data: WorkflowData; output: Output | null;
  confirming: boolean; busy: boolean; onCancel: () => void; onConfirm: (details: FinishDetails) => void;
}) {
  const records = data.distresses.filter(d => d.sample_unit_id === sample.id);
  const pending = [...new Map(records.map(r => [`${r.distress_type_id}:${r.severity}`, r])).values()].map(r => ({ key: `${r.distress_type_id}:${r.severity}`, name: data.types.find(t => t.id === r.distress_type_id)?.name ?? 'Saved distress', severity: r.severity }));
  return <View style={{ gap: 16 }}>
    {confirming && <FinishCard palette={p} sample={sample} hasDistress={records.length > 0} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />}
    <PciResultCards palette={p} output={output} pending={pending} />
  </View>;
}

/**
 * Cards 3–6 on their own, for any D6433-07 output. `pending` lists the recorded
 * distresses (one per type and severity) shown with empty values before the PCI is computed.
 * The public prototype uses these cards with its unsaved sample.
 */
export function PciResultCards({ palette: p, output, pending }: {
  palette: AdminPalette; output: Output | null;
  pending: { key: string; name: string; severity: string | null }[];
}) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.columns;
  const rows: DeductRow[] = output?.groups
    ? output.groups.map((g, i) => ({ key: `${g.code}-${g.severity}-${i}`, name: ASPHALT_CATALOG.find(d => d.code === g.code)?.name ?? `Distress ${g.code}`, severity: g.severity ? SEVERITY_NAMES[g.severity] : 'Not applicable', quantity: `${trim(g.quantity)} ${g.unit}`, density: fixed(g.density, 2), deduct: fixed(g.deduct_value, 2) }))
    : pending.map(r => ({ key: r.key, name: r.name, severity: r.severity ? SEVERITY_NAMES[r.severity] ?? r.severity : 'Not applicable', quantity: '', density: '', deduct: '' }));
  const deducts = output ? [...(output.deduct_values ?? output.groups?.map(g => g.deduct_value) ?? [])].sort((a, b) => b - a) : [];
  const iterating = !!output && output.iterations.length > 0;
  const q = output ? String(iterating ? output.iterations[0].q : output.q) : '';

  const mcdv = <Card palette={p} title="4. Maximum Corrected Deduct Value">
    <LabeledRow palette={p} label="Deduct Values"><Text accessibilityLabel={`Deduct values: ${deducts.map(v => fixed(v, 2)).join(', ') || 'not computed'}`} style={{ color: p.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{deducts.map(v => fixed(v, 2)).join('     ')}</Text></LabeledRow>
    <LabeledRow palette={p} label="q"><ValueBox palette={p} label="q" value={q} /></LabeledRow>
    {!iterating && <LabeledRow palette={p} label="Total Deduct Value"><ValueBox palette={p} label="Total deduct value" value={fixed(output?.total_deduct_value, 2)} /></LabeledRow>}
  </Card>;
  const pciCard = <Card palette={p} title="5. Pavement Condition Index">
    <View style={{ alignItems: 'center' }}><View style={{ width: 180 }}><ValueBox palette={p} label="Pavement condition index" value={fixed(output?.pci, 2)} /></View></View>
  </Card>;
  const rating = <Card palette={p} title="6. PCI Rating"><PciGauge palette={p} pci={output ? output.pci : null} /></Card>;
  const cdvDetails = iterating && output ? <Card palette={p} title="CDV Correction Details">
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View accessibilityLabel="CDV correction iterations" style={{ minWidth: 460, flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row' }}>{CDV_COLUMNS.map(c => <Text key={c.label} style={{ flex: c.flex, color: p.text, fontSize: 15, textAlign: 'center' }}>{c.label}</Text>)}</View>
        {output.iterations.map((it, i) => <View key={i} accessibilityLabel={`Iteration ${i + 1}: m ${fixed(output.allowable_deducts, 2)}, adjusted deducts ${it.adjusted_deducts.map(v => fixed(v, 2)).join(', ')}, TDV ${fixed(it.total_deduct_value, 2)}, q ${it.q}, CDV ${fixed(it.corrected_deduct_value, 2)}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {[String(i + 1), fixed(output.allowable_deducts, 2), it.adjusted_deducts.map(v => fixed(v, 2)).join(', '), fixed(it.total_deduct_value, 2), String(it.q), fixed(it.corrected_deduct_value, 2)].map((cell, c) => c === 0
            ? <Text key={c} style={{ flex: CDV_COLUMNS[c].flex, color: p.text, fontSize: 16, textAlign: 'center' }}>{cell}</Text>
            : <View key={c} style={{ flex: CDV_COLUMNS[c].flex }}><Text style={{ backgroundColor: p.blueSoft, color: p.text, fontSize: 15, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 4 }}>{cell}</Text></View>)}
        </View>)}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: p.border }}>
            <Text style={{ color: p.text, fontSize: 16, paddingHorizontal: 12, paddingVertical: 4 }}>Max CDV</Text>
            <Text accessibilityLabel={`Maximum CDV: ${fixed(output.max_corrected_deduct_value, 2)}`} style={{ backgroundColor: p.blueSoft, color: p.text, fontSize: 16, fontWeight: '700', minWidth: 70, textAlign: 'center', paddingVertical: 4 }}>{fixed(output.max_corrected_deduct_value, 2)}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  </Card> : null;

  return <View style={{ gap: 16 }}>
    <Card palette={p} title="3. Deduct Values">
      <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
        <View accessibilityLabel="Deduct values by distress" style={{ minWidth: 640, flex: 1, borderWidth: 1, borderColor: p.border, borderRadius: 6, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', backgroundColor: brand.navy, paddingVertical: 12, paddingHorizontal: 8 }}>
            {DEDUCT_COLUMNS.map(c => <Text key={c.label} style={{ flex: c.flex, color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: c.align }}>{c.label}</Text>)}
          </View>
          {rows.map((row, i) => <View key={row.key} accessibilityLabel={`Deduct row ${i + 1}: ${row.name}, ${row.severity}, quantity ${row.quantity || 'not computed'}, density ${row.density || 'not computed'}, deduct value ${row.deduct || 'not computed'}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 }}>
            {[String(i + 1), row.name, row.severity].map((cell, c) => <Text key={c} style={{ flex: DEDUCT_COLUMNS[c].flex, color: p.text, fontSize: 16, textAlign: DEDUCT_COLUMNS[c].align }}>{cell}</Text>)}
            {[row.quantity, row.density, row.deduct].map((cell, c) => <View key={c} style={{ flex: DEDUCT_COLUMNS[c + 3].flex, alignItems: 'center' }}>
              <Text style={{ backgroundColor: p.blueSoft, color: p.text, fontSize: 15, textAlign: 'center', minWidth: 72, minHeight: 26, paddingVertical: 3, paddingHorizontal: 6 }}>{cell}</Text>
            </View>)}
          </View>)}
          {!rows.length && <Text style={{ color: p.muted, padding: 16, textAlign: 'center' }}>{output ? 'No distress recorded. Every deduct value is zero.' : 'No distress added yet.'}</Text>}
        </View>
      </ScrollView>
    </Card>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'flex-start' : 'stretch' }}>
      <View style={{ flex: wide ? 1 : undefined, gap: 16 }}>{mcdv}{iterating ? cdvDetails : pciCard}</View>
      <View style={{ flex: wide ? 1 : undefined, gap: 16 }}>{iterating && pciCard}{rating}</View>
    </View>
  </View>;
}

const DEDUCT_COLUMNS = [
  { label: '#', flex: 0.5, align: 'center' as const },
  { label: 'Distress Type', flex: 2.2, align: 'left' as const },
  { label: 'Severity', flex: 1.1, align: 'left' as const },
  { label: 'Quantity', flex: 1.2, align: 'center' as const },
  { label: 'Density %', flex: 1.2, align: 'center' as const },
  { label: 'Deduct Value', flex: 1.2, align: 'center' as const },
];
const CDV_COLUMNS = [{ label: 'Iteration', flex: 0.9 }, { label: 'm', flex: 0.9 }, { label: 'Adjusted DV', flex: 2.2 }, { label: 'TDV', flex: 0.9 }, { label: 'q', flex: 0.6 }, { label: 'CDV', flex: 0.9 }];

function FinishCard({ palette: p, sample, hasDistress, busy, onCancel, onConfirm }: { palette: AdminPalette; sample: Sample; hasDistress: boolean; busy: boolean; onCancel: () => void; onConfirm: (details: FinishDetails) => void }) {
  const [orientation, setOrientation] = useState(sample.orientation_note ?? '');
  const [rulesChecked, setRulesChecked] = useState(sample.field_rules_confirmed ?? false);
  const [noDistress, setNoDistress] = useState(sample.no_distress_confirmed);
  const ready = !!orientation.trim() && rulesChecked && (hasDistress || noDistress);
  return <Card palette={p} title="Finish inspection">
    <Text style={{ color: p.text, lineHeight: 22 }}>Save these details and compute the PCI. You can still change distresses until you submit the report.</Text>
    <AdminField palette={p} required multiline label="Sample orientation / sketch description" value={orientation} onChangeText={setOrientation} />
    <CheckRow palette={p} checked={rulesChecked} onPress={() => setRulesChecked(!rulesChecked)} label="I checked severity, SI units, patch exclusions and overlapping distress rules." />
    {!hasDistress && <CheckRow palette={p} checked={noDistress} onPress={() => setNoDistress(!noDistress)} label="I inspected this unit and found no distress." />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <AdminButton palette={p} disabled={busy || !ready} label={busy ? 'Finishing…' : 'Finish and compute PCI'} onPress={() => onConfirm({ orientation_note: orientation, no_distress_confirmed: !hasDistress && noDistress })} />
      <AdminButton palette={p} tone="secondary" disabled={busy} label="Cancel" onPress={onCancel} />
    </View>
  </Card>;
}

function CheckRow({ palette: p, checked, onPress, label }: { palette: AdminPalette; checked: boolean; onPress: () => void; label: string }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}>
    <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: checked ? p.action : p.muted, backgroundColor: checked ? p.action : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {checked && <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', lineHeight: 16 }}>✓</Text>}
    </View>
    <Text style={{ color: p.text, flex: 1, lineHeight: 21 }}>{label}</Text>
  </Pressable>;
}

/** Half-ring gauge drawn with two bordered circles; the clipped lower half hides the unused arc. */
export function PciGauge({ palette: p, pci }: { palette: AdminPalette; pci: number | null }) {
  const { colorScheme } = useAppTheme();
  const size = 220, ring = 26;
  const value = pci === null ? null : clampPci(pci);
  const category = value === null ? null : getPciConditionCategory(value);
  const visual = category ? getPciConditionVisual(category, colorScheme === 'dark') : null;
  const angle = value === null ? 0 : -45 + (value / 100 - 1) * 180;
  return <View accessibilityLabel={category && value !== null ? `PCI ${value.toFixed(2)} out of 100, condition ${category.rating}` : 'PCI rating not computed yet'} style={{ alignItems: 'center', paddingVertical: 8 }}>
    <View style={{ width: size, height: size / 2, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: p.panelAlt }} />
      {visual && <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: 'transparent', borderTopColor: visual.accentColor, borderRightColor: visual.accentColor, transform: [{ rotate: `${angle}deg` }] }} />}
    </View>
    <View style={{ alignItems: 'center', marginTop: -62 }}>
      <Text style={{ color: p.text, fontSize: 52, fontWeight: '800', lineHeight: 58 }}>{value === null ? '—' : value.toFixed(2)}</Text>
      <Text style={{ color: p.muted, fontSize: 17 }}>/ 100</Text>
    </View>
    <Text style={{ color: p.text, fontSize: 12, fontWeight: '700', marginTop: 10 }}>Condition Rating</Text>
    <View style={{ marginTop: 6, minWidth: 130, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: visual?.borderColor ?? p.border, backgroundColor: visual?.backgroundColor ?? p.panelAlt }}>
      <Text style={{ color: visual?.foregroundColor ?? p.muted, fontSize: 18, fontWeight: '800', letterSpacing: 1 }}>{category ? category.rating.toUpperCase() : 'NOT YET COMPUTED'}</Text>
    </View>
  </View>;
}

function Card({ palette: p, title, children }: { palette: AdminPalette; title: string; children: React.ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
    {children}
  </View>;
}

function LabeledRow({ palette: p, label, children }: { palette: AdminPalette; label: string; children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 }}>
    <Text style={{ color: p.text, fontSize: 16, width: 150 }}>{label}</Text>
    <View style={{ flex: 1 }}>{children}</View>
  </View>;
}

function ValueBox({ palette: p, label, value }: { palette: AdminPalette; label: string; value: string }) {
  return <Text accessibilityLabel={`${label}: ${value || 'not computed'}`} style={{ backgroundColor: p.blueSoft, color: p.text, fontSize: 16, fontWeight: '700', textAlign: 'center', minHeight: 30, paddingVertical: 4, paddingHorizontal: 8 }}>{value}</Text>;
}
