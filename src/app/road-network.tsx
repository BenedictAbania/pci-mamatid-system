import { PageControls } from '@/components/workflow/pagination';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
    AdminButton,
    AdminField,
    AdminPanel,
    AdminShell,
    useAdminPalette,
} from '@/components/admin/admin-shell';
import { SectionPlan, type AdditionalUnitPayload, type ConfirmPlanPayload } from '@/components/road-network/section-plan';
import { Notice, useWorkflow } from '@/components/workflow/shared';
import { callWorkflow } from '@/lib/data/workflow-data';
import { layout } from '@/lib/ui/design-system';
import {
    BranchFormValues,
    BranchRecord,
    EncoderWorkload,
    loadEncoderWorkload,
    loadRoadNetworkCounts,
    RoadNetworkCounts,
    saveBranch,
    saveSection,
    SectionFormValues,
    SectionRecord,
} from '@/lib/data/admin-data';
import { formatNumber } from '@/lib/utils/admin-utils';
import { useAuth } from '@/providers/AuthProvider';

const emptyBranchForm: BranchFormValues = { id: undefined, branch_code: '', name: '', location: '', classification: '', length_meters: '', start_description: '', end_description: '', notes: '' };
const emptySectionForm: SectionFormValues = {
  id: undefined,
  branch_id: '',
  name: '',
  length_meters: '',
  width_meters: '',
  area_sqm: '',
  pavement_design: '',
  construction_history: '',
  traffic_classification: '',
  pavement_condition: '',
  notes: '',
};
/** Area follows length × width until the reviewer types an area of their own. */
function productArea(length: string, width: string) {
  const area = Number(length) * Number(width);
  return length.trim() && width.trim() && Number.isFinite(area) && area > 0 ? String(Math.round(area * 100) / 100) : '';
}
const branchDefinition = 'A branch is an identifiable, single entity within a pavement network that serves a distinct function or purpose. Start by adding one, then divide it into sections according to its pavement design, construction history, pavement condition, and traffic classification.';

export default function RoadNetworkScreen() {
  const palette = useAdminPalette();
  const { role, user } = useAuth();
  const { width } = useWindowDimensions();

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  // Passing the open section makes the workflow load its sample units too.
  const { data, error: loadError, loading, refresh, pagination, referencesPagination } = useWorkflow(undefined, selectedSectionId ?? undefined);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [assignMode, setAssignMode] = useState<'all' | 'choose'>('all');
  const [assignUnits, setAssignUnits] = useState<number[]>([]);
  const [workload, setWorkload] = useState<EncoderWorkload | null>(null);
  const [counts, setCounts] = useState<RoadNetworkCounts | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [sectionForm, setSectionForm] = useState(emptySectionForm);
  const [modal, setModal] = useState<'branch' | 'section' | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const isPhone = width < 700;
  const canEdit = role === 'reviewer';

  const reloadCounts = useCallback(async () => {
    try {
      setCounts(await loadRoadNetworkCounts());
    } catch {
      setCounts(null);
    }
  }, []);
  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadCounts();
  }, [reloadCounts]);
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), reloadCounts()]);
  }, [refresh, reloadCounts]);

  const branches = data?.branches ?? [];
  const sections = data?.sections ?? [];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const selectedBranch = (selectedBranchId ? branchById.get(selectedBranchId) : undefined) ?? branches[0];
  const sectionsOf = (branchId: string) => sections.filter((section) => section.branch_id === branchId);
  const sectionCount = (count: number) => `${count} Section${count === 1 ? '' : 's'}`;
  const selectedSection = selectedSectionId ? sections.find((section) => section.id === selectedSectionId) : undefined;
  const sectionSamples = selectedSection ? (data?.samples ?? []).filter((sample) => sample.section_id === selectedSection.id) : [];
  const encoders = (data?.profiles ?? []).filter((profile) => profile.role === 'encoder' && profile.is_active !== false);
  const currentEncoderId = sectionSamples.find((sample) => sample.assigned_to)?.assigned_to ?? '';

  /** Runs one plan action; failures stay on screen and the page reloads only on success. */
  async function runPlanAction(action: () => Promise<void>, success: string) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await action();
      await refreshAll();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const confirmPlan = (payload: ConfirmPlanPayload) => runPlanAction(
    () => callWorkflow('lakad_confirm_sampling_plan', { target: selectedSection!.id, payload }),
    'Sampling plan confirmed. Assign an encoder to start the inspection.',
  );
  const addAdditional = (payload: AdditionalUnitPayload) => runPlanAction(
    () => callWorkflow('lakad_add_additional_sample_unit', { target: selectedSection!.id, payload }),
    `U${payload.unit} marked as an additional sample unit.`,
  );

  // Only planned units can change hands; started units stay with their encoder.
  const assignableUnits = sectionSamples.filter((sample) => sample.workflow_state === 'planned').sort((a, b) => a.unit_number - b.unit_number);
  const encoderName = (id: string | null) => encoders.find((encoder) => encoder.id === id)?.full_name || null;

  function openAssign() {
    setAssignee(currentEncoderId);
    setAssignMode('all');
    // Choose units starts with the units nobody has yet.
    setAssignUnits(assignableUnits.filter((sample) => !sample.assigned_to).map((sample) => sample.unit_number));
    setError('');
    setAssignOpen(true);
    setWorkload(null);
    loadEncoderWorkload().then(setWorkload).catch(() => setWorkload(null));
  }

  function toggleAssignUnit(unit: number) {
    setAssignUnits((current) => current.includes(unit) ? current.filter((value) => value !== unit) : [...current, unit].sort((a, b) => a - b));
  }

  async function assignEncoder() {
    if (!selectedSection || !assignee) return;
    const name = encoderName(assignee) || 'The encoder';
    const units = assignMode === 'choose' ? assignUnits : null;
    if (await runPlanAction(
      () => callWorkflow('lakad_assign_section_encoder', { target: selectedSection.id, payload: units ? { inspector: assignee, units } : { inspector: assignee } }),
      units ? `${name} is assigned to ${units.map((unit) => `U${unit}`).join(', ')} in ${selectedSection.name}.` : `${name} is assigned to every planned unit in ${selectedSection.name}.`,
    )) setAssignOpen(false);
  }

  function openBranch(branch?: BranchRecord) {
    setBranchForm(branch ? {
      id: branch.id,
      branch_code: branch.branch_code ?? '',
      name: branch.name,
      location: branch.location ?? '',
      classification: branch.classification ?? '',
      length_meters: branch.length_meters?.toString() ?? '',
      start_description: branch.start_description ?? '',
      end_description: branch.end_description ?? '',
      notes: branch.notes ?? '',
    } : emptyBranchForm);
    setError('');
    setMessage('');
    setModal('branch');
  }

  function openSection(branchId: string, section?: SectionRecord) {
    setSectionForm(section ? {
      id: section.id,
      branch_id: section.branch_id,
      name: section.name,
      length_meters: section.length_meters?.toString() ?? '',
      width_meters: section.width_meters?.toString() ?? '',
      area_sqm: section.area_sqm?.toString() ?? '',
      pavement_design: section.pavement_design ?? '',
      construction_history: section.construction_history ?? '',
      traffic_classification: section.traffic_classification ?? '',
      pavement_condition: section.pavement_condition ?? '',
      notes: section.notes ?? '',
    } : { ...emptySectionForm, branch_id: branchId });
    setError('');
    setMessage('');
    setModal('section');
  }

  function setSectionField(key: keyof SectionFormValues, value: string) {
    setSectionForm((current) => ({ ...current, [key]: value }));
  }

  function setSectionMeasure(key: 'length_meters' | 'width_meters', value: string) {
    setSectionForm((current) => {
      const next = { ...current, [key]: value };
      const followsProduct = !current.area_sqm || current.area_sqm === productArea(current.length_meters, current.width_meters);
      return followsProduct ? { ...next, area_sqm: productArea(next.length_meters, next.width_meters) } : next;
    });
  }

  async function submitBranch() {
    if (!canEdit) {
      setError('Only a Reviewer can add or edit road branches.');
      return;
    }
    if (!user || !branchForm.branch_code.trim() || !branchForm.name.trim()) {
      setError('Branch ID and road name are required.');
      return;
    }
    if (branchForm.branch_code.trim().length > 40) {
      setError('Branch ID must be 40 characters or fewer.');
      return;
    }
    if (branchForm.name.trim().length > 160) {
      setError('Road name must be 160 characters or fewer.');
      return;
    }
    const length = Number(branchForm.length_meters);
    if (branchForm.length_meters.trim() && (!Number.isFinite(length) || length <= 0)) {
      setError('Length must be a positive number of meters.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const savedId = await saveBranch(branchForm);
      setSelectedBranchId(savedId);
      setModal(null);
      await refreshAll();
      setMessage(`Road branch ${branchForm.id ? 'updated' : 'created'} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Branch could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function submitSection() {
    if (!canEdit) {
      setError('Only a Reviewer can add or edit road sections.');
      return;
    }
    const required: [keyof SectionFormValues, string][] = [
      ['name', 'Section ID or name'],
      ['length_meters', 'Length'],
      ['width_meters', 'Width'],
      ['area_sqm', 'Area'],
      ['pavement_design', 'Pavement design'],
      ['construction_history', 'Construction history'],
      ['traffic_classification', 'Traffic classification'],
      ['pavement_condition', 'Pavement condition'],
    ];
    const missing = required.filter(([key]) => !sectionForm[key]?.trim()).map(([, label]) => label);
    if (!user || !sectionForm.branch_id || missing.length) {
      setError(`Required: ${missing.join(', ') || 'road branch'}.`);
      return;
    }
    if ([sectionForm.length_meters, sectionForm.width_meters, sectionForm.area_sqm].map(Number).some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('Length, width and area must be positive numbers.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveSection(sectionForm, user.id);
      setModal(null);
      await refreshAll();
      setMessage(`Road section ${sectionForm.id ? 'updated' : 'created'} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Road section could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const sectionLayoutLocked = !!sections.find((section) => section.id === sectionForm.id)?.homogeneous_confirmed_by;

  return (
    <AdminShell
      action={canEdit ? (
        <View style={styles.headerActions}>
          {selectedSection ? <AdminButton disabled={!sectionSamples.length} label="Assign Encoder" onPress={openAssign} palette={palette} /> : null}
          <AdminButton icon="plus" label="Add branch" onPress={() => openBranch()} palette={palette} />
        </View>
      ) : undefined}
      loading={loading}
      onRefresh={() => void refreshAll()}
      subtitle=""
      title="Road Network">
      {loadError ? <Notice error>{loadError} Use Refresh to try again.</Notice> : null}
      {error && !assignOpen ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      {selectedSection ? (
        <SectionPlan
          key={selectedSection.id}
          branchName={branchById.get(selectedSection.branch_id)?.name ?? 'Saved branch'}
          busy={saving}
          canEdit={canEdit}
          isPhone={isPhone}
          onAddAdditional={addAdditional}
          onBack={() => { setSelectedSectionId(null); setMessage(''); setError(''); }}
          onConfirm={confirmPlan}
          onEditDetails={() => openSection(selectedSection.branch_id, selectedSection)}
          palette={palette}
          samples={sectionSamples}
          section={selectedSection}
        />
      ) : <>
      <View style={[styles.summaryGrid, isPhone && styles.stack]}>
        <SummaryCard label="Road Branch" value={counts?.branches ?? branches.length} palette={palette} />
        <SummaryCard label="Road Section" value={counts?.sections ?? sections.length} palette={palette} />
        <SummaryCard label="Road Sample Unit" value={counts?.sampleUnits ?? null} palette={palette} />
      </View>

      {branches.length && selectedBranch ? (
        <View style={[styles.networkColumns, isPhone && styles.stack]}>
          <AdminPanel palette={palette} style={[styles.branchListPanel, isPhone && styles.branchListPanelPhone]} title="Branches">
            <View style={styles.branchList}>
              {branches.map((branch) => {
                const active = branch.id === selectedBranch.id;
                return (
                  <Pressable
                    key={branch.id}
                    accessibilityLabel={`Open branch ${branch.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedBranchId(branch.id)}
                    style={[styles.branchItem, active && { backgroundColor: palette.blueSoft, borderLeftColor: palette.blue }]}>
                    <Text numberOfLines={1} style={[styles.branchItemTitle, { color: palette.text }]}>{branch.name}</Text>
                    <Text style={[styles.branchItemMeta, { color: palette.muted }]}>{sectionCount(sectionsOf(branch.id).length)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {canEdit ? <TextLink label="+ Add branch" accessibilityLabel="Add another branch" onPress={() => openBranch()} palette={palette} /> : null}
            <PageControls label="Branches" {...referencesPagination} />
          </AdminPanel>

          <AdminPanel palette={palette} style={styles.detailPanel}>
            <View style={styles.detailHeader}>
              <View style={styles.itemCopy}>
                <Text accessibilityRole="header" style={[styles.detailTitle, { color: palette.text }]}>{selectedBranch.name}</Text>
                <Text style={[styles.branchItemMeta, { color: palette.text }]}>{sectionCount(sectionsOf(selectedBranch.id).length)}</Text>
              </View>
              {canEdit ? <TextLink label="Edit Branch" accessibilityLabel={`Edit road branch ${selectedBranch.name}`} onPress={() => openBranch(selectedBranch)} palette={palette} /> : null}
            </View>
            {sectionsOf(selectedBranch.id).length ? (
              <View>
                {sectionsOf(selectedBranch.id).map((section) => (
                  <Pressable
                    key={section.id}
                    accessibilityLabel={`Open section ${section.name}`}
                    accessibilityRole="button"
                    onPress={() => { setSelectedSectionId(section.id); setMessage(''); setError(''); }}
                    style={({ pressed }) => [styles.sectionRow, isPhone && styles.sectionRowPhone, { borderBottomColor: palette.border }, pressed && { backgroundColor: palette.blueSoft }]}>
                    <View style={styles.sectionIdentity}>
                      <Text style={[styles.itemTitle, { color: palette.text }]}>{section.name}</Text>
                      <Text style={[styles.itemMeta, { color: palette.muted }]}>{section.homogeneous_confirmed_by ? `Sampling plan confirmed · ${section.total_sample_units ?? '—'} units` : 'No sampling plan yet'}</Text>
                    </View>
                    <DataPoint label="Length" value={formatNumber(section.length_meters, ' m')} palette={palette} />
                    <DataPoint label="Width" value={formatNumber(section.width_meters, ' m')} palette={palette} />
                    <DataPoint label="Area" value={formatNumber(section.area_sqm, ' m²')} palette={palette} />
                    {canEdit ? <Pressable accessibilityLabel={`Edit road section ${section.name}`} onPress={() => openSection(selectedBranch.id, section)} style={styles.smallIcon}><Feather color={palette.blue} name="edit-2" size={16} /></Pressable> : null}
                    <Feather color={palette.muted} name="chevron-right" size={18} />
                  </Pressable>
                ))}
                {canEdit ? <View style={styles.addSectionRow}><TextLink label="+ Add section" accessibilityLabel={`Add road section to ${selectedBranch.name}`} onPress={() => openSection(selectedBranch.id)} palette={palette} /></View> : null}
                <PageControls label="Sections" {...pagination} />
              </View>
            ) : (
              <View style={[styles.noSections, { borderColor: palette.muted }]}>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>No sections yet</Text>
                {canEdit ? <AdminButton icon="plus" label="Add sections" onPress={() => openSection(selectedBranch.id)} palette={palette} /> : null}
              </View>
            )}
          </AdminPanel>
        </View>
      ) : (
        <AdminPanel palette={palette} style={styles.mainPanel}>
          <View style={styles.empty}>
            <MaterialCommunityIcons color={palette.blue} name="road-variant" size={64} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No branches yet</Text>
            <Text style={[styles.emptyText, { color: palette.muted }]}>{branchDefinition}</Text>
            {canEdit ? <AdminButton icon="plus" label="Add your first branch" onPress={() => openBranch()} palette={palette} /> : null}
          </View>
        </AdminPanel>
      )}
      </>}

      <Modal animationType="fade" onRequestClose={() => setAssignOpen(false)} transparent visible={assignOpen && canEdit && !!selectedSection}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.branchModalCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <View style={styles.formModalHeader}>
              <View style={styles.formModalTitleRow}>
                <Pressable accessibilityLabel="Close dialog" accessibilityRole="button" onPress={() => setAssignOpen(false)} style={styles.backButton}><Feather color={palette.text} name="arrow-left" size={24} /></Pressable>
                <Text accessibilityRole="header" style={[styles.modalTitle, styles.formModalTitle, { color: palette.text }]}>Assign Encoder</Text>
              </View>
              <Text style={[styles.formModalSubtitle, { color: palette.text }]}>{selectedSection?.name}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={[styles.assignHeading, { color: palette.text }]}>Which sample units to inspect</Text>
              <View style={styles.segment}>
                {(['all', 'choose'] as const).map((mode) => {
                  const active = assignMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setAssignMode(mode)}
                      style={[styles.segmentButton, { borderColor: active ? palette.blue : palette.text, backgroundColor: active ? palette.blueSoft : palette.panel }]}>
                      <Text style={[styles.segmentText, { color: palette.text }]}>{mode === 'all' ? 'All units' : 'Choose units'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {assignMode === 'all' ? (
                <Text style={[styles.itemMeta, { color: palette.muted }]}>All {assignableUnits.length} planned unit{assignableUnits.length === 1 ? '' : 's'} go to the selected encoder, including additional units.</Text>
              ) : (
                <>
                  <View style={styles.unitGrid}>
                    {assignableUnits.map((sample) => {
                      const checked = assignUnits.includes(sample.unit_number);
                      const owner = encoderName(sample.assigned_to);
                      return (
                        <Pressable
                          key={sample.id}
                          accessibilityLabel={`U${sample.unit_number}${owner ? `, assigned to ${owner}` : ''}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          onPress={() => toggleAssignUnit(sample.unit_number)}
                          style={[styles.unitCell, { borderColor: palette.text }]}>
                          <View style={[styles.checkbox, { borderColor: palette.text, backgroundColor: checked ? palette.blue : palette.panel }]}>{checked ? <Feather color="#FFFFFF" name="check" size={14} /> : null}</View>
                          <View style={styles.itemCopy}>
                            <Text style={[styles.unitText, { color: palette.text }]}>U{sample.unit_number}</Text>
                            {owner || sample.sample_type === 'additional' ? <Text numberOfLines={1} style={[styles.unitMeta, { color: palette.muted }]}>{[sample.sample_type === 'additional' ? 'Additional' : null, owner].filter(Boolean).join(' · ')}</Text> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={[styles.unitMeta, { color: palette.muted }]}>
                    {assignUnits.length} of {assignableUnits.length} selected · {assignableUnits.filter((sample) => !assignUnits.includes(sample.unit_number) && !sample.assigned_to).length} stay unassigned
                  </Text>
                </>
              )}
              {sectionSamples.length > assignableUnits.length ? <Text style={[styles.unitMeta, { color: palette.muted }]}>{sectionSamples.length - assignableUnits.length} unit{sectionSamples.length - assignableUnits.length === 1 ? ' has' : 's have'} already started and keep their encoder.</Text> : null}

              <Text style={[styles.assignHeading, { color: palette.text }]}>Encoder</Text>
              {encoders.length ? encoders.map((encoder) => {
                const active = assignee === encoder.id;
                const load = workload?.[encoder.id];
                const name = encoder.full_name || encoder.email || 'Unnamed encoder';
                return (
                  <Pressable
                    key={encoder.id}
                    accessibilityLabel={`Assign ${name}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setAssignee(encoder.id)}
                    style={[styles.encoderOption, { borderColor: active ? palette.blue : palette.text }]}>
                    <View style={[styles.radio, { borderColor: active ? palette.blue : palette.muted, backgroundColor: active ? palette.blue : palette.panel }]} />
                    <Text numberOfLines={1} style={[styles.encoderName, { color: palette.text }]}>{name}</Text>
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      {workload === null ? '' : load && load.units ? `${load.sections} section${load.sections === 1 ? '' : 's'} · ${load.units} unit${load.units === 1 ? '' : 's'}` : 'No assignments'}
                    </Text>
                  </Pressable>
                );
              }) : <Notice>No active encoder accounts yet. Ask the administrator to create one.</Notice>}
              {error ? <ErrorBanner message={error} palette={palette} /> : null}
            </ScrollView>
            <View style={styles.modalActions}><AdminButton label="Cancel" onPress={() => setAssignOpen(false)} palette={palette} tone="secondary" /><AdminButton disabled={saving || !assignee || !assignableUnits.length || (assignMode === 'choose' && !assignUnits.length)} label={saving ? 'Saving...' : 'Assign'} onPress={() => void assignEncoder()} palette={palette} /></View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setModal(null)} transparent visible={modal !== null && canEdit}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, modal === 'branch' ? styles.branchModalCard : styles.sectionModalCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <View style={styles.formModalHeader}>
              <View style={styles.formModalTitleRow}>
                <Pressable accessibilityLabel="Close dialog" accessibilityRole="button" onPress={() => setModal(null)} style={styles.backButton}><Feather color={palette.text} name="arrow-left" size={24} /></Pressable>
                <Text accessibilityRole="header" style={[styles.modalTitle, styles.formModalTitle, { color: palette.text }]}>{modal === 'branch' ? (branchForm.id ? 'Edit branch' : 'Add branch') : (sectionForm.id ? 'Edit section' : 'Add section')}</Text>
              </View>
              {modal === 'section' ? <Text style={[styles.formModalSubtitle, { color: palette.text }]}>{branchById.get(sectionForm.branch_id)?.name ?? 'Saved branch'}</Text> : null}
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              {modal === 'branch' ? (
                <>
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField label="Branch ID" onChangeText={(branch_code) => setBranchForm((current) => ({ ...current, branch_code }))} palette={palette} placeholder="e.g. MMTD-B01" value={branchForm.branch_code} /></View>
                    <View style={styles.formColumn}><AdminField label="Road Name" onChangeText={(name) => setBranchForm((current) => ({ ...current, name }))} palette={palette} value={branchForm.name} /></View>
                  </View>
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField label="Location" onChangeText={(location) => setBranchForm((current) => ({ ...current, location }))} palette={palette} value={branchForm.location} /></View>
                    <View style={styles.formColumn}><AdminField label="Classification" onChangeText={(classification) => setBranchForm((current) => ({ ...current, classification }))} palette={palette} value={branchForm.classification} /></View>
                  </View>
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField keyboardType="numeric" label="Length" onChangeText={(length_meters) => setBranchForm((current) => ({ ...current, length_meters }))} palette={palette} placeholder="meters" value={branchForm.length_meters} /></View>
                    <View style={styles.formColumn}><AdminField label="Starts at" onChangeText={(start_description) => setBranchForm((current) => ({ ...current, start_description }))} palette={palette} value={branchForm.start_description} /></View>
                    <View style={styles.formColumn}><AdminField label="Ends at" onChangeText={(end_description) => setBranchForm((current) => ({ ...current, end_description }))} palette={palette} value={branchForm.end_description} /></View>
                  </View>
                  <AdminField label="Notes" multiline onChangeText={(notes) => setBranchForm((current) => ({ ...current, notes }))} palette={palette} value={branchForm.notes} />
                </>
              ) : (
                <>
                  {sectionLayoutLocked ? <Notice>This section&apos;s confirmed layout is locked. You may update only the notes.</Notice> : null}
                  <AdminField editable={!sectionLayoutLocked} label="Section ID or name" onChangeText={(name) => setSectionField('name', name)} palette={palette} placeholder="e.g. MMTD-001 — Purok 2" required value={sectionForm.name} />
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} keyboardType="numeric" label="Length (m)" onChangeText={(value) => setSectionMeasure('length_meters', value)} palette={palette} required value={sectionForm.length_meters} /></View>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} keyboardType="numeric" label="Width (m)" onChangeText={(value) => setSectionMeasure('width_meters', value)} palette={palette} required value={sectionForm.width_meters} /></View>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} keyboardType="numeric" label="Area (As)" onChangeText={(area_sqm) => setSectionField('area_sqm', area_sqm)} palette={palette} placeholder="m²" required value={sectionForm.area_sqm} /></View>
                  </View>
                  <Text accessibilityRole="header" style={[styles.formSubheading, { color: palette.text }]}>What makes this section different</Text>
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} label="Pavement design" onChangeText={(value) => setSectionField('pavement_design', value)} palette={palette} required value={sectionForm.pavement_design} /></View>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} label="Construction history" onChangeText={(value) => setSectionField('construction_history', value)} palette={palette} required value={sectionForm.construction_history} /></View>
                  </View>
                  <View style={styles.twoColumns}>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} label="Traffic classification" onChangeText={(value) => setSectionField('traffic_classification', value)} palette={palette} required value={sectionForm.traffic_classification} /></View>
                    <View style={styles.formColumn}><AdminField editable={!sectionLayoutLocked} label="Pavement condition" onChangeText={(value) => setSectionField('pavement_condition', value)} palette={palette} required value={sectionForm.pavement_condition} /></View>
                  </View>
                  <AdminField label="Notes" multiline onChangeText={(notes) => setSectionField('notes', notes)} palette={palette} value={sectionForm.notes} />
                </>
              )}
              {error ? <ErrorBanner message={error} palette={palette} /> : null}
            </ScrollView>
            <View style={styles.modalActions}><AdminButton label="Cancel" onPress={() => setModal(null)} palette={palette} tone="secondary" /><AdminButton disabled={saving} label={saving ? 'Saving...' : modal === 'branch' ? 'Save branch' : 'Save section'} onPress={() => void (modal === 'branch' ? submitBranch() : submitSection())} palette={palette} /></View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

function SummaryCard({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: number | null }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <Text style={[styles.summaryLabel, { color: palette.text }]}>{label}</Text>
      <Text accessibilityLabel={`${label}: ${value ?? 'not available'}`} style={[styles.summaryValue, { color: palette.muted }]}>{value === null ? '—' : value.toLocaleString()}</Text>
    </View>
  );
}

function TextLink({ accessibilityLabel, label, onPress, palette }: { accessibilityLabel: string; label: string; onPress: () => void; palette: ReturnType<typeof useAdminPalette> }) {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.textLinkLabel, { color: palette.blue }]}>{label}</Text>
    </Pressable>
  );
}

function DataPoint({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: string }) {
  return <View style={styles.dataPoint}><Text style={[styles.dataLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.dataValue, { color: palette.text }]}>{value}</Text></View>;
}

function ErrorBanner({ message, palette }: { message: string; palette: ReturnType<typeof useAdminPalette> }) {
  return <View style={[styles.errorBanner, { backgroundColor: palette.redSoft, borderColor: palette.red }]}><Feather color={palette.red} name="alert-circle" size={17} /><Text style={[styles.errorText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  summaryGrid: { flexDirection: 'row', gap: 14 },
  stack: { flexDirection: 'column' },
  summaryCard: { borderRadius: 12, borderWidth: 1, flex: 1, gap: 2, minHeight: 96, paddingHorizontal: 20, paddingVertical: 14 },
  summaryLabel: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  summaryValue: { fontSize: 26, fontWeight: '800' },
  mainPanel: { minHeight: 460 },
  empty: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  emptyTitle: { fontSize: 21, fontWeight: '800', marginTop: 8 },
  emptyText: { fontSize: 13.5, lineHeight: 20, marginBottom: 10, maxWidth: 940, textAlign: 'center' },
  networkColumns: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 },
  branchListPanel: { gap: 4, width: 270 },
  branchListPanelPhone: { width: '100%' },
  branchList: { gap: 6, marginBottom: 6 },
  branchItem: { borderLeftColor: 'transparent', borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  branchItemTitle: { fontSize: 14, fontWeight: '800' },
  branchItemMeta: { fontSize: 11, marginTop: 1 },
  detailPanel: { alignSelf: 'stretch', flex: 1, gap: 12, minHeight: 460, minWidth: 0 },
  detailHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  detailTitle: { fontSize: 18, fontWeight: '800' },
  noSections: { alignItems: 'center', borderRadius: 12, borderStyle: 'dashed', borderWidth: 3, flex: 1, gap: 14, justifyContent: 'center', minHeight: 360, padding: 24 },
  textLink: { paddingVertical: 4 },
  textLinkLabel: { fontSize: 13, fontWeight: '800' },
  addSectionRow: { marginTop: 10 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 13, fontWeight: '800' },
  itemMeta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  smallIcon: { padding: 6 },
  sectionRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 60, paddingVertical: 10 },
  sectionRowPhone: { alignItems: 'flex-start', flexWrap: 'wrap' },
  sectionIdentity: { flex: 1.4, minWidth: 150 },
  dataPoint: { minWidth: 75 },
  dataLabel: { fontSize: 9.5, textTransform: 'uppercase' },
  dataValue: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  modalBackdrop: { alignItems: 'center', backgroundColor: layout.scrim, flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { borderRadius: 15, borderWidth: 1, maxHeight: '92%', maxWidth: 650, overflow: 'hidden', width: '100%' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  encoderOption: { alignItems: 'center', borderRadius: 4, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  encoderName: { flex: 1, fontSize: 15 },
  radio: { borderRadius: 10, borderWidth: 1.5, height: 20, width: 20 },
  assignHeading: { fontSize: 15, fontWeight: '800' },
  segment: { flexDirection: 'row', gap: 8 },
  segmentButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40 },
  segmentText: { fontSize: 15 },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitCell: { alignItems: 'center', borderWidth: 1, flexBasis: '31%', flexDirection: 'row', flexGrow: 1, gap: 10, minHeight: 40, paddingHorizontal: 8, paddingVertical: 6 },
  checkbox: { alignItems: 'center', borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  unitText: { fontSize: 15 },
  unitMeta: { fontSize: 11 },
  branchModalCard: { maxWidth: 480 },
  sectionModalCard: { maxWidth: 560 },
  formModalHeader: { paddingHorizontal: 18, paddingBottom: 10, paddingTop: 18 },
  formModalTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  formModalTitle: { fontSize: 24 },
  formModalSubtitle: { fontSize: 14, marginLeft: 44 },
  formSubheading: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 36 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  form: { gap: 13, paddingHorizontal: 18, paddingBottom: 18 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  formColumn: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end', padding: 18, paddingTop: 10 },
  errorBanner: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
