import { Feather } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminButton, AdminField, AdminPanel, type AdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import type { RoadSection, Sample } from '@/lib/data/workflow-data';
import {
  formatChainage,
  randomStart,
  REDUCED_SAMPLING_TABLE,
  samplingSelection,
  sectionSampleUnits,
  TARGET_UNIT_AREA,
  unitSlot,
  type SamplingMethod,
} from '@/lib/d6433-07/sampling-plan';
import { formatNumber } from '@/lib/utils/admin-utils';

export type ConfirmPlanPayload = { method: SamplingMethod; total: number; first: number };
export type AdditionalUnitPayload = { unit: number; start_m: number; end_m: number; reason: string; note: string };

const options: { method: SamplingMethod; title: string; detail: string; hint?: string }[] = [
  { method: 'all', title: 'Option 1:', detail: 'Inspect all sample units', hint: 'Best when there is enough time and few sections.' },
  { method: 'confidence', title: 'Option 2:', detail: '95% confidence, e = ± 5 PCI points' },
  { method: 'reduced', title: 'Option 3:', detail: 'Reduced sampling rate.', hint: 'You choose how many units to inspect, depending on the survey objective.' },
];
const emptyAdditional = { unit: '', start_m: '', end_m: '', reason: '', note: '' };

export function StatCard({ label, palette, value }: { label: string; palette: AdminPalette; value: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <Text style={[styles.statLabel, { color: palette.text }]}>{label}</Text>
      <Text accessibilityLabel={`${label}: ${value}`} style={[styles.statValue, { color: palette.muted }]}>{value}</Text>
    </View>
  );
}

export function SectionPlan({
  branchName,
  busy,
  canEdit,
  isPhone,
  onAddAdditional,
  onBack,
  onConfirm,
  onEditDetails,
  palette,
  samples,
  section,
}: {
  branchName: string;
  busy: boolean;
  canEdit: boolean;
  isPhone: boolean;
  onAddAdditional: (payload: AdditionalUnitPayload) => Promise<boolean>;
  onBack: () => void;
  onConfirm: (payload: ConfirmPlanPayload) => Promise<boolean>;
  onEditDetails: () => void;
  palette: AdminPalette;
  samples: Sample[];
  section: RoadSection;
}) {
  const area = Number(section.area_sqm ?? 0);
  const length = Number(section.length_meters ?? 0);
  const confirmed = samples.length > 0 || !!section.homogeneous_confirmed_by;
  // A confirmed plan keeps the N it was saved with, even if dimensions are edited later.
  const layout = useMemo(() => (confirmed && section.total_sample_units
    ? { total: section.total_sample_units, unitArea: area / section.total_sample_units }
    : sectionSampleUnits(area)), [area, confirmed, section.total_sample_units]);
  const total = layout?.total ?? 0;

  const [round, setRound] = useState<1 | 2>(1);
  const [method, setMethod] = useState<SamplingMethod | null>(section.sampling_method);
  const [first, setFirst] = useState(1);
  const [additionalOpen, setAdditionalOpen] = useState(true);
  const [additional, setAdditional] = useState(emptyAdditional);

  const randomUnits = samples.filter((sample) => sample.sample_type !== 'additional').map((sample) => sample.unit_number).sort((a, b) => a - b);
  const additionalUnits = samples.filter((sample) => sample.sample_type === 'additional').sort((a, b) => a.unit_number - b.unit_number);
  const activeMethod = confirmed ? section.sampling_method : method;
  const preview = useMemo(() => {
    if (!total || !activeMethod) return null;
    try {
      return samplingSelection(activeMethod, total, confirmed ? section.sampling_start_unit ?? 1 : first);
    } catch {
      return null;
    }
  }, [activeMethod, confirmed, first, section.sampling_start_unit, total]);
  const selectedUnits = confirmed ? randomUnits : preview?.units ?? [];
  const showAdditional = activeMethod === 'confidence' || activeMethod === 'reduced';

  function choose(next: SamplingMethod) {
    if (confirmed || !total) return;
    setMethod(next);
    setFirst(randomStart(next, total));
  }

  function setUnitNumber(unit: string) {
    const number = Number(unit);
    const slot = Number.isInteger(number) && number >= 1 && number <= total && length > 0 ? unitSlot(number, total, length) : null;
    setAdditional((current) => ({
      ...current,
      unit,
      start_m: slot ? String(Math.round(slot.start * 100) / 100) : current.start_m,
      end_m: slot ? String(Math.round(slot.end * 100) / 100) : current.end_m,
    }));
  }

  async function confirmPlan() {
    if (!method || !total) return;
    await onConfirm({ method, total, first: method === 'all' ? 1 : first });
  }

  async function markAdditional() {
    const saved = await onAddAdditional({
      unit: Number(additional.unit),
      start_m: Number(additional.start_m),
      end_m: Number(additional.end_m),
      reason: additional.reason,
      note: additional.note,
    });
    if (saved) setAdditional(emptyAdditional);
  }

  const additionalMissing = !additional.unit.trim() || !additional.start_m.trim() || !additional.end_m.trim() || !additional.reason.trim();

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Pressable accessibilityLabel="Back to branch" accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Feather color={palette.text} name="arrow-left" size={24} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.sectionTitle, { color: palette.text }]}>{section.name}</Text>
          <Text numberOfLines={1} style={[styles.branchName, { color: palette.text }]}>{branchName}</Text>
        </View>
      </View>

      <View style={[styles.statRow, isPhone && styles.stack]}>
        <StatCard label="Section Area (As)" palette={palette} value={area ? `${formatNumber(area)} m²` : '—'} />
        <StatCard label="Target Unit Area (Au)" palette={palette} value={`${TARGET_UNIT_AREA} m²`} />
        <StatCard label="Sample Unit (N)" palette={palette} value={total ? String(total) : '—'} />
      </View>
      {!layout ? <Notice error>This section&apos;s area cannot be divided into asphalt sample units of 135–315 m² (225 ± 90 m², §2.1.7). Use Edit Details to check the length, width and area.</Notice> : null}

      <AdminPanel palette={palette}>
        <Text style={[styles.panelTitle, { color: palette.text }]}>Preview along the section</Text>
        {total ? (
          <>
            <View style={[styles.previewBar, { borderColor: palette.border }]}>
              {Array.from({ length: total }, (_, index) => {
                const unit = index + 1;
                const isAdditional = additionalUnits.some((sample) => sample.unit_number === unit);
                const isSelected = selectedUnits.includes(unit);
                return (
                  <View
                    key={unit}
                    accessibilityLabel={`U${unit}${isSelected ? ', selected for inspection' : isAdditional ? ', additional sample unit' : ''}`}
                    style={[
                      styles.previewUnit,
                      { backgroundColor: isSelected ? palette.blueSoft : isAdditional ? palette.redSoft : palette.panelAlt, borderRightColor: palette.border },
                      unit === total && styles.previewUnitLast,
                    ]}>
                    {total <= 40 ? <Text numberOfLines={1} style={[styles.previewLabel, { color: palette.text, fontWeight: isSelected || isAdditional ? '800' : '500' }]}>U{unit}</Text> : null}
                  </View>
                );
              })}
            </View>
            <View style={styles.chainageRow}>
              <Text style={[styles.chainage, { color: palette.text }]}>{formatChainage(0)}</Text>
              <Text style={[styles.chainage, { color: palette.text }]}>{formatChainage(length)}</Text>
            </View>
          </>
        ) : <Text style={[styles.muted, { color: palette.muted }]}>The preview appears once the section can be divided into sample units.</Text>}
      </AdminPanel>

      <View style={[styles.columns, isPhone && styles.stack]}>
        <AdminPanel palette={palette} style={[styles.detailsPanel, isPhone && styles.full]}>
          <Text style={[styles.panelTitle, { color: palette.text }]}>Section Details</Text>
          {[
            ['Length', formatNumber(section.length_meters, ' m')],
            ['Width', formatNumber(section.width_meters, ' m')],
            ['Area (As)', formatNumber(section.area_sqm, ' m²')],
            ['Pavement Design', section.pavement_design || '—'],
            ['Construction History', section.construction_history || '—'],
            ['Traffic Condition', section.traffic_classification || '—'],
            ['Pavement Condition', section.pavement_condition || '—'],
          ].map(([label, value]) => (
            <View key={label} style={[styles.detailRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.detailLabel, { color: palette.text }]}>{label}</Text>
              <Text style={[styles.detailValue, { color: palette.muted }]}>{value}</Text>
            </View>
          ))}
          {canEdit ? <Pressable accessibilityLabel={`Edit road section ${section.name}`} accessibilityRole="button" onPress={onEditDetails} style={styles.link}><Text style={[styles.linkText, { color: palette.blue }]}>Edit Details</Text></Pressable> : null}
        </AdminPanel>

        <AdminPanel palette={palette} style={[styles.planPanel, isPhone && styles.full]}>
          <View style={[styles.planColumns, isPhone && styles.stack]}>
            <View style={styles.planOptions}>
              <Text style={[styles.panelTitle, { color: palette.text }]}>Sample Units and Sampling Plan</Text>
              <View style={[styles.tabs, { borderColor: palette.border }]}>
                {([1, 2] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: round === value }}
                    onPress={() => setRound(value)}
                    style={[styles.tab, round === value && { backgroundColor: palette.text }]}>
                    <Text style={[styles.tabText, { color: round === value ? palette.panel : palette.text }]}>{value === 1 ? 'Round 1: first inspection' : 'Round 2 and later'}</Text>
                  </Pressable>
                ))}
              </View>
              {round === 2 ? (
                <Notice>Round 2 and later uses the standard deviation measured in the previous survey instead of s = 10 (§7.5.2.1). It becomes available once this section has approved round-1 results.</Notice>
              ) : options.map((option) => {
                const selected = activeMethod === option.method;
                return (
                  <Pressable
                    key={option.method}
                    accessibilityLabel={`${option.title} ${option.detail}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: confirmed || !total || !canEdit }}
                    disabled={confirmed || !total || !canEdit}
                    onPress={() => choose(option.method)}
                    style={[styles.option, { borderColor: selected ? palette.blue : palette.border, borderWidth: selected ? 2 : 1 }]}>
                    <View style={styles.optionHead}>
                      <View style={[styles.radio, { borderColor: selected ? palette.blue : palette.muted }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: palette.blue }]} /> : null}</View>
                      <Text style={[styles.optionText, { color: palette.text }]}><Text style={styles.optionTitle}>{option.title}</Text> {option.detail}</Text>
                    </View>
                    {option.hint ? <Text style={[styles.optionHint, { color: palette.muted }]}>{option.hint}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {round === 1 && activeMethod && preview ? (
              <View style={[styles.planDetail, !isPhone && { borderLeftColor: palette.border, borderLeftWidth: 1, paddingLeft: 18 }]}>
                {activeMethod === 'reduced' ? (
                  <View style={[styles.table, { backgroundColor: palette.text }]}>
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableHead, { color: palette.panel }]}>Total Sample Units (N)</Text>
                      <Text style={[styles.tableHead, { color: palette.panel }]}>Sample Units to inspect (n)</Text>
                    </View>
                    {REDUCED_SAMPLING_TABLE.map((row) => {
                      const current = REDUCED_SAMPLING_TABLE.find((candidate) => total <= candidate.upTo) === row;
                      return (
                        <View key={row.range} style={[styles.tableRow, { borderTopColor: 'rgba(255,255,255,0.25)', borderTopWidth: 1 }, current && { backgroundColor: palette.blue }]}>
                          <Text style={[styles.tableCell, { color: palette.panel }]}>{row.range}</Text>
                          <Text style={[styles.tableCell, { color: palette.panel }]}>{row.inspect}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {activeMethod === 'all' ? (
                  <Text style={[styles.planLine, { color: palette.text }]}>All {total} sample unit{total === 1 ? '' : 's'} will be inspected.</Text>
                ) : (
                  <View>
                    <PlanRow label="Minimum sample units to inspect, n" palette={palette} value={String(preview.required)} />
                    <PlanRow label="Sampling interval, i" palette={palette} value={String(preview.interval)} />
                    <PlanRow
                      action={!confirmed && canEdit && preview.interval > 1 ? <Pressable accessibilityLabel="Randomize starting sample unit" accessibilityRole="button" onPress={() => setFirst(randomStart(activeMethod, total))} style={[styles.randomize, { backgroundColor: palette.blue }]}><Text style={styles.randomizeText}>Randomize</Text></Pressable> : null}
                      label="Starting sample unit"
                      palette={palette}
                      value={String(preview.first)}
                    />
                  </View>
                )}
                <View style={styles.chips}>
                  {selectedUnits.map((unit) => (
                    <View key={unit} style={[styles.chip, { backgroundColor: palette.blueSoft, borderColor: palette.border }]}><Text style={[styles.chipText, { color: palette.text }]}>U{unit}</Text></View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {round === 1 ? (
            confirmed ? (
              <Text style={[styles.confirmedText, { color: palette.muted }]}>
                {section.sampling_method ? 'Sampling plan confirmed' : 'Sampling plan confirmed with an earlier method'}
                {section.homogeneous_confirmed_at ? ` on ${new Date(section.homogeneous_confirmed_at).toLocaleDateString()}` : ''}. {randomUnits.length} unit{randomUnits.length === 1 ? '' : 's'} selected.
              </Text>
            ) : canEdit ? (
              <View style={styles.confirmRow}><AdminButton disabled={busy || !method || !total} label={busy ? 'Saving...' : 'Confirm'} onPress={() => void confirmPlan()} palette={palette} /></View>
            ) : null
          ) : null}
        </AdminPanel>

        {round === 1 && showAdditional ? (
          <AdminPanel palette={palette} style={[styles.additionalPanel, isPhone && styles.full]}>
            <Pressable accessibilityLabel={additionalOpen ? 'Collapse additional sample unit' : 'Expand additional sample unit'} accessibilityRole="button" accessibilityState={{ expanded: additionalOpen }} onPress={() => setAdditionalOpen((open) => !open)} style={styles.additionalHead}>
              <Text style={[styles.panelTitle, styles.additionalTitle, { color: palette.text }]}>Additional Sample Unit</Text>
              <Feather color={palette.text} name={additionalOpen ? 'chevron-up' : 'chevron-down'} size={22} />
            </Pressable>
            {additionalOpen ? (
              <View style={styles.form}>
                {!confirmed ? <Notice>Confirm the sampling plan first, then mark any unusual unit as an additional sample unit.</Notice> : null}
                <AdminField editable={confirmed && canEdit} keyboardType="numeric" label="Sample Unit Number" onChangeText={setUnitNumber} palette={palette} placeholder={total ? `1–${total}` : undefined} required value={additional.unit} />
                <View style={styles.twoColumns}>
                  <View style={styles.formColumn}><AdminField editable={confirmed && canEdit} keyboardType="numeric" label="Starts at" onChangeText={(start_m) => setAdditional((current) => ({ ...current, start_m }))} palette={palette} placeholder="m" required value={additional.start_m} /></View>
                  <View style={styles.formColumn}><AdminField editable={confirmed && canEdit} keyboardType="numeric" label="Ends at" onChangeText={(end_m) => setAdditional((current) => ({ ...current, end_m }))} palette={palette} placeholder="m" required value={additional.end_m} /></View>
                </View>
                <AdminField editable={confirmed && canEdit} label="Reasons" onChangeText={(reason) => setAdditional((current) => ({ ...current, reason }))} palette={palette} required value={additional.reason} />
                <AdminField editable={confirmed && canEdit} label="Note (optional)" onChangeText={(note) => setAdditional((current) => ({ ...current, note }))} palette={palette} value={additional.note} />
                {canEdit ? <View style={styles.confirmRow}><AdminButton disabled={busy || !confirmed || additionalMissing} label="Mark as an additional" onPress={() => void markAdditional()} palette={palette} /></View> : null}
                {additionalUnits.length ? (
                  <View style={styles.additionalList}>
                    {additionalUnits.map((sample) => (
                      <Text key={sample.id} style={[styles.muted, { color: palette.text }]}>U{sample.unit_number} · {formatNumber(sample.start_m, ' m')}–{formatNumber(sample.end_m, ' m')}{sample.inspection_notes ? ` · ${sample.inspection_notes.split('\n')[0].replace(/^Reason: /, '')}` : ''}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </AdminPanel>
        ) : null}
      </View>
    </View>
  );
}

function PlanRow({ action, label, palette, value }: { action?: ReactNode; label: string; palette: AdminPalette; value: string }) {
  return (
    <View style={[styles.planRow, { borderBottomColor: palette.border }]}>
      <Text style={[styles.planLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.planValue, { color: palette.text }]}>{value}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 },
  titleCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  branchName: { fontSize: 13 },
  statRow: { flexDirection: 'row', gap: 14 },
  stack: { flexDirection: 'column' },
  statCard: { borderRadius: 12, borderWidth: 1, flex: 1, gap: 2, minHeight: 96, paddingHorizontal: 20, paddingVertical: 14 },
  statLabel: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  statValue: { fontSize: 26, fontWeight: '800' },
  panelTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  muted: { fontSize: 13, lineHeight: 19 },
  previewBar: { borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 36, overflow: 'hidden' },
  previewUnit: { alignItems: 'center', borderRightWidth: 1, flex: 1, justifyContent: 'center', minWidth: 0 },
  previewUnitLast: { borderRightWidth: 0 },
  previewLabel: { fontSize: 15 },
  chainageRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chainage: { fontSize: 12 },
  columns: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  full: { width: '100%' },
  detailsPanel: { flexBasis: 260, flexGrow: 1, minWidth: 260 },
  detailRow: { borderTopWidth: 2, paddingVertical: 8 },
  detailLabel: { fontSize: 16 },
  detailValue: { fontSize: 13, marginTop: 2 },
  link: { paddingTop: 6 },
  linkText: { fontSize: 13, fontWeight: '800' },
  planPanel: { flexBasis: 420, flexGrow: 2, minWidth: 320 },
  planColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  planOptions: { flexBasis: 300, flexGrow: 1, gap: 8 },
  tabs: { borderWidth: 1, flexDirection: 'row' },
  tab: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  tabText: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  option: { borderRadius: 8, gap: 4, paddingHorizontal: 12, paddingVertical: 10 },
  optionHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  radio: { alignItems: 'center', borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { borderRadius: 5, height: 10, width: 10 },
  optionText: { flex: 1, fontSize: 15 },
  optionTitle: { fontWeight: '800' },
  optionHint: { fontSize: 12, lineHeight: 16 },
  planDetail: { flexBasis: 280, flexGrow: 1, gap: 12, justifyContent: 'center' },
  table: { borderRadius: 8, overflow: 'hidden', paddingHorizontal: 4 },
  tableRow: { flexDirection: 'row' },
  tableHead: { flex: 1, fontSize: 13, fontWeight: '800', paddingVertical: 7, textAlign: 'center' },
  tableCell: { flex: 1, fontSize: 13, paddingVertical: 5, textAlign: 'center' },
  planLine: { fontSize: 14, fontWeight: '700' },
  planRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 34, paddingVertical: 4 },
  planLabel: { flex: 1, fontSize: 14, fontWeight: '800' },
  planValue: { fontSize: 15, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  randomize: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  randomizeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 6, borderWidth: 1, minWidth: 58, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 14, fontWeight: '800' },
  confirmRow: { alignItems: 'flex-end', marginTop: 12 },
  confirmedText: { fontSize: 13, marginTop: 12, textAlign: 'right' },
  additionalPanel: { flexBasis: 280, flexGrow: 1, minWidth: 280 },
  additionalHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  additionalTitle: { flex: 1, marginBottom: 0 },
  form: { gap: 12, marginTop: 10 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  formColumn: { flex: 1 },
  additionalList: { gap: 4, marginTop: 6 },
});
