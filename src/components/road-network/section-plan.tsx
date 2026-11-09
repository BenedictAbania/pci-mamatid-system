import { Feather } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminButton, AdminField, AdminPanel, type AdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import type { RoadSection, Sample, SurveyRounds } from '@/lib/data/workflow-data';
import {
  randomStart,
  samplingSelection,
  sectionSampleUnits,
  TARGET_UNIT_AREA,
  unitSlot,
  type SamplingMethod,
} from '@/lib/d6433-07/sampling-plan';
import { formatNumber } from '@/lib/utils/admin-utils';

export type ConfirmPlanPayload = { method: SamplingMethod; total: number; first: number };
export type AdditionalUnitPayload = { unit: number; start_m: number; end_m: number; reason: string; note: string };
export type StartRoundPayload = { method: SamplingMethod; first: number };
type PlanView = { required: number; interval: number; first: number; units: number[] };

const options: { method: SamplingMethod; title: string; detail: string; hint?: string }[] = [
  { method: 'all', title: 'Option 1:', detail: 'Inspect all sample units', hint: 'Best when there is enough time and few sections.' },
  { method: 'confidence', title: 'Option 2:', detail: '95% confidence, e = ± 5 PCI points' },
  { method: 'reduced', title: 'Option 3:', detail: 'Reduced sampling rate.', hint: 'You choose how many units to inspect, depending on the survey objective.' },
];
const emptyAdditional = { unit: '', start_m: '', end_m: '', reason: '', note: '' };
/** Height of the open Additional Sample Unit form on a desktop row, used before it is first measured. */
const SIDE_PANEL_HEIGHT = 456;
/** Preview tiles: narrowest box that still fits its station range, and the gap between boxes. */
const TILE_MIN_WIDTH = 108;
const TILE_GAP = 6;

export function StatCard({ label, palette, value }: { label: string; palette: AdminPalette; value: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
      <Text accessibilityLabel={`${label}: ${value}`} style={[styles.statValue, { color: palette.text }]}>{value}</Text>
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
  onPublishSection,
  onStartRound,
  palette,
  rounds,
  roundsError,
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
  /** Computes the section PCI from its published sample results and publishes it. */
  onPublishSection?: () => Promise<boolean>;
  /** Plans the next survey round once every unit of the current round is published. */
  onStartRound?: (payload: StartRoundPayload) => Promise<boolean>;
  palette: AdminPalette;
  /** Survey round progress from lakad_survey_rounds; null while loading or unavailable. */
  rounds?: SurveyRounds | null;
  roundsError?: string;
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

  const currentRound = rounds?.current_round ?? 1;
  // Open on the round being worked on; the user can still switch tabs.
  const [roundChoice, setRound] = useState<1 | 2 | null>(null);
  const round = roundChoice ?? (currentRound >= 2 ? 2 : 1);
  const [method, setMethod] = useState<SamplingMethod | null>(section.sampling_method);
  const [first, setFirst] = useState(1);
  const [nextMethod, setNextMethod] = useState<SamplingMethod | null>(null);
  const [nextFirst, setNextFirst] = useState(1);
  const [additionalOpen, setAdditionalOpen] = useState(true);
  const [additional, setAdditional] = useState(emptyAdditional);
  // The third panel keeps the height of the tallest option (the Additional Sample Unit form),
  // so the row does not change height when the user switches options or rounds.
  const [sidePanelHeight, setSidePanelHeight] = useState(SIDE_PANEL_HEIGHT);
  // One row when every box fits; otherwise wrap so each box keeps room for its range.
  const [barWidth, setBarWidth] = useState(0);
  const sideStyle = [styles.additionalPanel, isPhone ? styles.full : { minHeight: sidePanelHeight }];

  const roundOf = (sample: Sample) => sample.survey_round ?? 1;
  const randomOf = (list: Sample[]) => list.filter((sample) => sample.sample_type !== 'additional').map((sample) => sample.unit_number).sort((a, b) => a - b);
  const round1Samples = samples.filter((sample) => roundOf(sample) === 1);
  const currentSamples = samples.filter((sample) => roundOf(sample) === currentRound);
  // The tab shows its own round: round 1, or the current later round.
  const viewSamples = round === 1 ? round1Samples : currentRound >= 2 ? currentSamples : [];
  const randomUnits = randomOf(round1Samples);
  const additionalUnits = viewSamples.filter((sample) => sample.sample_type === 'additional').sort((a, b) => a.unit_number - b.unit_number);
  const publishedCount = currentSamples.filter((sample) => sample.workflow_state === 'published').length;
  const approvedCount = currentSamples.filter((sample) => sample.workflow_state === 'approved').length;
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
  const optionsLocked = confirmed || !total || !canEdit;
  // Say why the options do not respond; a missing layout already has its own error notice.
  const createdUnits = round1Samples.length || section.total_sample_units;
  const lockReason = confirmed
    ? `This plan is locked. It was confirmed${section.homogeneous_confirmed_at ? ` on ${new Date(section.homogeneous_confirmed_at).toLocaleDateString()}` : ''} and its ${createdUnits ? `${createdUnits} ` : ''}sample units are already created, so the method can no longer change.`
    : !canEdit && total ? 'Only the Civil Engineer of this section can choose the sampling plan.' : '';

  // Round 2 and later (§7.5.2): plan the next round with s measured from the current one.
  const latestPlan = currentRound >= 2 ? rounds?.rounds.find((plan) => plan.round === currentRound) ?? null : null;
  const deviation = rounds?.deviation ?? null;
  const planningNext = !!rounds?.ready && confirmed && canEdit && !!onStartRound;
  const nextPreview = useMemo<PlanView | null>(() => {
    if (!planningNext || !nextMethod || !total || (nextMethod === 'confidence' && deviation === null)) return null;
    try {
      return samplingSelection(nextMethod, total, nextFirst, deviation ?? 10);
    } catch {
      return null;
    }
  }, [deviation, nextFirst, nextMethod, planningNext, total]);
  const currentRandom = randomOf(currentSamples);
  const shownMethod = planningNext ? nextMethod : latestPlan?.method ?? null;
  const shownDeviation = planningNext ? deviation : latestPlan?.deviation ?? null;
  const shownPlan: PlanView | null = planningNext ? nextPreview
    : latestPlan ? { required: latestPlan.required, interval: latestPlan.interval, first: latestPlan.first, units: currentRandom } : null;
  const shownRound = planningNext ? currentRound + 1 : currentRound;
  const previewUnits = round === 1 ? selectedUnits : shownPlan?.units ?? [];
  const roundNotice = !confirmed
    ? 'Confirm the round-1 sampling plan first. A later round re-inspects the section after every round-1 sample unit is published.'
    : roundsError ? `Survey rounds are unavailable: ${roundsError}`
    : !rounds ? 'Loading survey rounds…'
    : planningNext
      ? `Round ${currentRound} is complete. Choose how to sample round ${currentRound + 1}. Option 2 uses s measured from the round-${currentRound} PCIs instead of s = 10 (§7.5.2).${deviation === null ? ' It needs at least two random sample units with published PCIs.' : ''}`
    : !rounds.ready
      ? currentRound === 1
        ? `Round 2 opens once every round-1 sample unit is published (${rounds.published} of ${rounds.units} so far).`
        : `Round ${currentRound} is in progress (${rounds.published} of ${rounds.units} published). Round ${currentRound + 1} opens once all are published.`
    : 'Only the Civil Engineer of this section can plan the next round.';
  const sideKind = round === 1
    ? (showAdditional ? 'additional' : activeMethod === 'all' ? 'census' : 'summary')
    : (planningNext || !latestPlan ? 'survey' : latestPlan.method === 'all' ? 'census' : 'additional');
  // Additional units join the current round only.
  const additionalEditable = canEdit && confirmed && (round === 1 ? currentRound === 1 : currentRound >= 2);

  function chooseNext(next: SamplingMethod) {
    if (!planningNext || !total) return;
    setNextMethod(next);
    setNextFirst(randomStart(next, total, Math.random, deviation ?? 10));
  }

  async function startRound() {
    if (!nextMethod || !onStartRound) return;
    const saved = await onStartRound({ method: nextMethod, first: nextMethod === 'all' ? 1 : nextFirst });
    if (saved) setNextMethod(null);
  }

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
            <View onLayout={(event) => setBarWidth(Math.floor(event.nativeEvent.layout.width))} style={styles.previewBar}>
              {(() => {
                const columns = barWidth ? Math.max(1, Math.min(total, Math.floor((barWidth + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)))) : total;
                const tileWidth = barWidth ? (barWidth - TILE_GAP * (columns - 1)) / columns : undefined;
                return Array.from({ length: total }, (_, index) => {
                  const unit = index + 1;
                  const isAdditional = additionalUnits.some((sample) => sample.unit_number === unit);
                  const isSelected = previewUnits.includes(unit);
                  const range = length > 0 ? `${formatStation(((unit - 1) * length) / total)}–${formatStation((unit * length) / total)}` : '';
                  return (
                    <View
                      key={unit}
                      accessibilityLabel={`SU${unit}${isSelected ? ', selected for inspection' : isAdditional ? ', additional sample unit' : ''}`}
                      style={[
                        styles.previewUnit,
                        tileWidth ? { width: tileWidth } : styles.previewUnitFlex,
                        {
                          backgroundColor: isSelected ? palette.blueSoft : isAdditional ? palette.redSoft : palette.panel,
                          borderColor: isSelected ? palette.blue : isAdditional ? palette.red : palette.border,
                        },
                      ]}>
                      <Text numberOfLines={1} style={[styles.previewLabel, { color: palette.text, fontWeight: isSelected || isAdditional ? '800' : '500' }]}>SU{unit}</Text>
                      {range ? <Text numberOfLines={1} style={[styles.previewRange, { color: palette.blue }]}>{range}</Text> : null}
                    </View>
                  );
                });
              })()}
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
              {round === 2 ? <Notice>{roundNotice}</Notice> : lockReason ? <Notice>{lockReason}</Notice> : null}
              {options.map((option) => {
                const selected = (round === 1 ? activeMethod : shownMethod) === option.method;
                const locked = round === 1 ? optionsLocked : !planningNext || (option.method === 'confidence' && deviation === null);
                return (
                  <Pressable
                    key={option.method}
                    accessibilityLabel={`${option.title} ${option.detail}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: locked }}
                    disabled={locked}
                    onPress={() => (round === 1 ? choose(option.method) : chooseNext(option.method))}
                    style={[styles.option, { borderColor: selected ? palette.blue : palette.border, borderWidth: selected ? 2 : 1 }, locked && !selected && styles.optionLocked]}>
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
                    <PlanRow label="Sample units to inspect" palette={palette} value={String(selectedUnits.length)} />
                    {selectedUnits.length > preview.required ? (
                      <Text style={[styles.muted, styles.planNote, { color: palette.muted }]}>
                        Why {selectedUnits.length} and not {preview.required}? Units are picked evenly: every {ordinal(preview.interval)} unit, starting at SU{preview.first}, until the section ends (§7.5.3). That fits {selectedUnits.length} units. {preview.required} is only the minimum, so the extra unit{selectedUnits.length - preview.required === 1 ? '' : 's'} make{selectedUnits.length - preview.required === 1 ? 's' : ''} the result more reliable.
                      </Text>
                    ) : null}
                  </View>
                )}
                <UnitChips palette={palette} units={selectedUnits} />
              </View>
            ) : null}

            {round === 2 && shownMethod && shownPlan ? (
              <View style={[styles.planDetail, !isPhone && { borderLeftColor: palette.border, borderLeftWidth: 1, paddingLeft: 18 }]}>
                <Text style={[styles.roundLabel, { color: palette.muted }]}>Round {shownRound} plan</Text>
                {shownMethod === 'all' ? (
                  <Text style={[styles.planLine, { color: palette.text }]}>All {total} sample unit{total === 1 ? '' : 's'} will be inspected.</Text>
                ) : (
                  <View>
                    {shownMethod === 'confidence' && shownDeviation !== null ? <PlanRow label="Standard deviation, s" palette={palette} value={shownDeviation.toFixed(2)} /> : null}
                    <PlanRow label="Minimum sample units to inspect, n" palette={palette} value={String(shownPlan.required)} />
                    <PlanRow label="Sampling interval, i" palette={palette} value={String(shownPlan.interval)} />
                    <PlanRow
                      action={planningNext && shownPlan.interval > 1 ? <Pressable accessibilityLabel="Randomize starting sample unit" accessibilityRole="button" onPress={() => setNextFirst(randomStart(shownMethod, total, Math.random, deviation ?? 10))} style={[styles.randomize, { backgroundColor: palette.blue }]}><Text style={styles.randomizeText}>Randomize</Text></Pressable> : null}
                      label="Starting sample unit"
                      palette={palette}
                      value={String(shownPlan.first)}
                    />
                    <PlanRow label="Sample units to inspect" palette={palette} value={String(shownPlan.units.length)} />
                  </View>
                )}
                <UnitChips palette={palette} units={shownPlan.units} />
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
          ) : planningNext ? (
            <View style={styles.confirmRow}><AdminButton disabled={busy || !nextPreview} label={busy ? 'Saving...' : `Start round ${currentRound + 1}`} onPress={() => void startRound()} palette={palette} /></View>
          ) : latestPlan ? (
            <Text style={[styles.confirmedText, { color: palette.muted }]}>
              Round {currentRound} confirmed on {new Date(latestPlan.confirmed_at).toLocaleDateString()}. {currentRandom.length} unit{currentRandom.length === 1 ? '' : 's'} selected.
            </Text>
          ) : null}
        </AdminPanel>

        {sideKind === 'survey' ? (
          <AdminPanel palette={palette} style={sideStyle}>
            <Text style={[styles.panelTitle, { color: palette.text }]}>Previous Survey Data</Text>
            <PlanRow label="Measured from" palette={palette} value={rounds ? `Round ${currentRound}` : '—'} />
            <PlanRow label="Random units with PCI" palette={palette} value={rounds ? String(rounds.random_count) : '—'} />
            <PlanRow label="Mean PCI" palette={palette} value={rounds?.mean != null ? rounds.mean.toFixed(1) : '—'} />
            <PlanRow label="Standard deviation, s" palette={palette} value={deviation !== null ? deviation.toFixed(2) : rounds ? 'Needs 2+ units' : '—'} />
            <PlanRow label="Allowable error, e" palette={palette} value="± 5 PCI points" />
            <PlanRow label={`Round ${currentRound} results published`} palette={palette} value={rounds ? `${rounds.published} of ${rounds.units}` : '—'} />
            <Notice>s is the spread of the PCIs measured in round {currentRound} (§7.5.2.1 Eq. 2). The next round uses Eq. 1 again with this s instead of s = 10, so a uniform section needs fewer units and an uneven one needs more.</Notice>
          </AdminPanel>
        ) : sideKind !== 'additional' ? (
          <AdminPanel palette={palette} style={sideStyle}>
            {sideKind === 'census' ? (
              <>
                <Text style={[styles.panelTitle, { color: palette.text }]}>Census Coverage</Text>
                <PlanRow label="Sample units to inspect" palette={palette} value={total ? `${total} of ${total}` : '—'} />
                <PlanRow label="Average sample unit area" palette={palette} value={layout ? formatNumber(Math.round(layout.unitArea * 10) / 10, ' m²') : '—'} />
                <PlanRow label="Section PCI" palette={palette} value="Area-weighted mean" />
                <Notice>Every sample unit is inspected, so no additional sample unit is needed. The section PCI is the area-weighted mean of all {total || 'N'} units (§11.1).</Notice>
              </>
            ) : (
              <>
                <Text style={[styles.panelTitle, { color: palette.text }]}>Plan Summary</Text>
                <Text style={[styles.muted, { color: palette.muted }]}>Choose an option to see how many sample units this section needs and how the section PCI is computed.</Text>
              </>
            )}
          </AdminPanel>
        ) : (
          <AdminPanel
            onLayout={(event) => {
              const height = Math.ceil(event.nativeEvent.layout.height);
              if (!isPhone && additionalOpen && height > sidePanelHeight) setSidePanelHeight(height);
            }}
            palette={palette}
            style={sideStyle}>
            <Pressable accessibilityLabel={additionalOpen ? 'Collapse additional sample unit' : 'Expand additional sample unit'} accessibilityRole="button" accessibilityState={{ expanded: additionalOpen }} onPress={() => setAdditionalOpen((open) => !open)} style={styles.additionalHead}>
              <Text style={[styles.panelTitle, styles.additionalTitle, { color: palette.text }]}>Additional Sample Unit</Text>
              <Feather color={palette.text} name={additionalOpen ? 'chevron-up' : 'chevron-down'} size={22} />
            </Pressable>
            {additionalOpen ? (
              <View style={styles.form}>
                {!confirmed ? <Notice>Confirm the sampling plan first, then mark any unusual unit as an additional sample unit.</Notice> : null}
                {confirmed && round === 1 && currentRound > 1 ? <Notice>Round 1 is closed. Additional sample units now join round {currentRound}.</Notice> : null}
                {round === 2 ? <Text style={[styles.roundLabel, { color: palette.muted }]}>Round {currentRound}</Text> : null}
                <AdminField editable={additionalEditable} keyboardType="numeric" label="Sample Unit Number" onChangeText={setUnitNumber} palette={palette} placeholder={total ? `1–${total}` : undefined} required value={additional.unit} />
                <View style={styles.twoColumns}>
                  <View style={styles.formColumn}><AdminField editable={additionalEditable} keyboardType="numeric" label="Starts at" onChangeText={(start_m) => setAdditional((current) => ({ ...current, start_m }))} palette={palette} placeholder="m" required value={additional.start_m} /></View>
                  <View style={styles.formColumn}><AdminField editable={additionalEditable} keyboardType="numeric" label="Ends at" onChangeText={(end_m) => setAdditional((current) => ({ ...current, end_m }))} palette={palette} placeholder="m" required value={additional.end_m} /></View>
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.formColumn}><AdminField editable={additionalEditable} label="Reasons" onChangeText={(reason) => setAdditional((current) => ({ ...current, reason }))} palette={palette} required value={additional.reason} /></View>
                  <View style={styles.formColumn}><AdminField editable={additionalEditable} label="Note (optional)" onChangeText={(note) => setAdditional((current) => ({ ...current, note }))} palette={palette} value={additional.note} /></View>
                </View>
                {canEdit ? <View style={styles.confirmRow}><AdminButton disabled={busy || !additionalEditable || additionalMissing} label="Mark as an additional" onPress={() => void markAdditional()} palette={palette} /></View> : null}
                {additionalUnits.length ? (
                  <View style={styles.additionalList}>
                    {additionalUnits.map((sample) => (
                      <Text key={sample.id} style={[styles.muted, { color: palette.text }]}>SU{sample.unit_number} · {formatNumber(sample.start_m, ' m')}–{formatNumber(sample.end_m, ' m')}{sample.inspection_notes ? ` · ${sample.inspection_notes.split('\n')[0].replace(/^Reason: /, '')}` : ''}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </AdminPanel>
        )}
      </View>

      {confirmed && currentSamples.length ? (
        <AdminPanel palette={palette}>
          <Text style={[styles.panelTitle, { color: palette.text }]}>Section PCI{currentRound > 1 ? ` · Round ${currentRound}` : ''}</Text>
          <Text accessibilityLabel={`Published sample units: ${publishedCount} of ${currentSamples.length}`} style={[styles.muted, { color: palette.text }]}>
            {publishedCount} of {currentSamples.length} sample units have published results{approvedCount ? ` · ${approvedCount} approved, awaiting publication` : ''}.
          </Text>
          <Text style={[styles.muted, { color: palette.muted }]}>
            {publishedCount === currentSamples.length
              ? 'Every sample unit is published. Compute the area-weighted section PCI (§11.1) and publish it to the Viewer.'
              : 'Approve and publish every sample unit in this section first. The section PCI uses all of them.'}
          </Text>
          {canEdit && onPublishSection ? <View style={styles.confirmRow}>
            <AdminButton disabled={busy || publishedCount !== currentSamples.length} label={busy ? 'Publishing...' : 'Compute and publish section PCI'} onPress={() => void onPublishSection()} palette={palette} />
          </View> : null}
        </AdminPanel>
      ) : null}
    </View>
  );
}

/** Station in km+m with one decimal when needed: 37.5 m → 0+037.5, 300 m → 0+300. */
function formatStation(meters: number) {
  const tenths = Math.round(Math.max(0, meters) * 10);
  const km = Math.floor(tenths / 10000);
  const rest = (tenths - km * 10000) / 10;
  const [whole, decimal] = rest.toFixed(1).split('.');
  return `${km}+${whole.padStart(3, '0')}${decimal === '0' ? '' : `.${decimal}`}`;
}

/** 6 → "6th", 2 → "2nd", 11 → "11th". */
function ordinal(value: number) {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th';
  return `${value}${suffix}`;
}

function UnitChips({ palette, units }: { palette: AdminPalette; units: number[] }) {
  return (
    <View style={styles.chips}>
      {units.map((unit) => (
        <View key={unit} style={[styles.chip, { backgroundColor: palette.blueSoft, borderColor: palette.border }]}><Text style={[styles.chipText, { color: palette.text }]}>SU{unit}</Text></View>
      ))}
    </View>
  );
}

function PlanRow({ action, label, palette, value }: { action?: ReactNode; label: string; palette: AdminPalette; value: string }) {
  return (
    <View style={[styles.planRow, { borderBottomColor: palette.border }]}>
      <Text style={[styles.planLabel, { color: palette.text }]}>{label}</Text>
      <Text accessibilityLabel={`${label}: ${value}`} style={[styles.planValue, { color: palette.text }]}>{value}</Text>
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
  statLabel: { fontSize: 13, fontWeight: '600' },
  statValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.3 },
  panelTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  muted: { fontSize: 13, lineHeight: 19 },
  previewBar: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  previewUnit: { alignItems: 'center', borderRadius: 6, borderWidth: 1, gap: 2, justifyContent: 'center', minHeight: 54, minWidth: 0, paddingHorizontal: 4, paddingVertical: 6 },
  previewUnitFlex: { flexBasis: 0, flexGrow: 1 },
  previewLabel: { fontSize: 14 },
  previewRange: { fontSize: 11 },
  // Panels in one row stretch to the tallest, so all three boxes end on the same line.
  columns: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  // Phones stack the panels; drop their desktop minimum widths so narrow screens do not overflow.
  full: { width: '100%', minWidth: 0 },
  detailsPanel: { flexBasis: 260, flexGrow: 1, minWidth: 260 },
  detailRow: { alignItems: 'baseline', borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 7 },
  detailLabel: { flexShrink: 0, fontSize: 14, fontWeight: '600' },
  detailValue: { flexShrink: 1, fontSize: 14, textAlign: 'right' },
  link: { paddingTop: 6 },
  linkText: { fontSize: 13, fontWeight: '800' },
  planPanel: { flexBasis: 420, flexGrow: 2, minWidth: 320 },
  planColumns: { flexDirection: 'row', flexGrow: 1, flexWrap: 'wrap', gap: 18 },
  planOptions: { flexBasis: 300, flexGrow: 1, gap: 8 },
  tabs: { borderWidth: 1, flexDirection: 'row' },
  tab: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  tabText: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  option: { borderRadius: 8, gap: 4, paddingHorizontal: 12, paddingVertical: 10 },
  optionLocked: { opacity: 0.55 },
  optionHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  radio: { alignItems: 'center', borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { borderRadius: 5, height: 10, width: 10 },
  optionText: { flex: 1, fontSize: 15 },
  optionTitle: { fontWeight: '800' },
  optionHint: { fontSize: 12, lineHeight: 16 },
  planDetail: { flexBasis: 280, flexGrow: 1, gap: 12, justifyContent: 'center' },
  planLine: { fontSize: 14, fontWeight: '700' },
  planNote: { marginTop: 8 },
  roundLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
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
