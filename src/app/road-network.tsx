import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
    AdminButton,
    AdminEmpty,
    AdminField,
    AdminPanel,
    AdminShell,
    useAdminPalette,
} from '@/components/admin/admin-shell';
import { Notice, useWorkflow } from '@/components/workflow/shared';
import {
    BranchRecord,
    removeBranch,
    removeSection,
    saveBranch,
    saveSection,
    SectionRecord,
} from '@/lib/admin-data';
import { confirmAction, formatNumber } from '@/lib/admin-utils';
import { useAuth } from '@/providers/AuthProvider';

const emptyBranchForm = { id: undefined as string | undefined, name: '', description: '', location: 'Barangay Mamatid, Cabuyao, Laguna', administrative_status: 'active' };
const emptySectionForm = {
  id: undefined as string | undefined,
  branch_id: '',
  name: '',
  description: '',
  length_meters: '',
  width_meters: '',
  start_description: '',
  end_description: '',
  latitude: '',
  longitude: '',
  notes: '',
};

export default function RoadNetworkScreen() {
  const palette = useAdminPalette();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const { data, loading, refresh } = useWorkflow();

  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [sectionForm, setSectionForm] = useState(emptySectionForm);
  const [modal, setModal] = useState<'branch' | 'section' | null>(null);
  const [saving, setSaving] = useState(false);
  const isPhone = width < 700;

  if (!data) {
    return (
      <AdminShell loading={loading} onRefresh={refresh} onSearchChange={setQuery} searchValue={query} subtitle="Manage road branches, section dimensions, and sampling requirements." title="Road Network">
        <View />
      </AdminShell>
    );
  }

  const { branches = [], sections = [], results = [] } = data;

  // Need to get PCI score from latest result
  const latestResultsMap = new Map();
  for (const r of results) {
    if (!latestResultsMap.has(r.section_id) || latestResultsMap.get(r.section_id).published_at < r.published_at) {
      latestResultsMap.set(r.section_id, r);
    }
  }

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = sections.filter((section) => {
    const branch = branchById.get(section.branch_id);
    return `${section.name} ${section.description ?? ''} ${branch?.name ?? ''}`
      .toLowerCase()
      .includes(normalizedQuery);
  });

  function openBranch(branch?: BranchRecord) {
    setBranchForm(branch
      ? { id: branch.id, name: branch.name, description: branch.description ?? '', location: branch.location ?? '', administrative_status: branch.administrative_status ?? 'active' }
      : emptyBranchForm);
    setError('');
    setModal('branch');
  }

  function openSection(section?: SectionRecord) {
    setSectionForm(section ? {
      id: section.id,
      branch_id: section.branch_id,
      name: section.name,
      description: section.description ?? '',
      start_description: section.start_description ?? '',
      end_description: section.end_description ?? '',
      length_meters: section.length_meters?.toString() ?? '',
      width_meters: section.width_meters?.toString() ?? '',
      latitude: section.latitude?.toString() ?? '',
      longitude: section.longitude?.toString() ?? '',
      notes: section.notes ?? '',
    } : { ...emptySectionForm, branch_id: branches[0]?.id ?? '' });
    setError('');
    setModal('section');
  }

  async function submitBranch() {
    if (!user || !branchForm.name.trim()) {
      setError('Branch name is required.');
      return;
    }
    if (!['active', 'inactive', 'archived'].includes(branchForm.administrative_status.trim().toLowerCase())) {
      setError('Administrative status must be active, inactive or archived.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveBranch(branchForm, user.id);
      setModal(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Branch could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function submitSection() {
    if (!user || !sectionForm.branch_id || !sectionForm.name.trim()) {
      setError('Road branch and section name are required.');
      return;
    }
    const numericValues = [
      sectionForm.length_meters,
      sectionForm.width_meters,
    ].filter(Boolean).map(Number);
    if (numericValues.some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('Measurements and sample counts must be positive numbers.');
      return;
    }
    if ((sectionForm.latitude === '') !== (sectionForm.longitude === '')) {
      setError('Enter both coordinates or leave both empty.');
      return;
    }
    if (sectionForm.latitude && (Math.abs(Number(sectionForm.latitude)) > 90 || Math.abs(Number(sectionForm.longitude)) > 180)) {
      setError('Enter valid latitude and longitude.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveSection(sectionForm, user.id);
      setModal(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Road section could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSection(section: SectionRecord) {
    if (!await confirmAction('Delete road section?', `${section.name} and its dependent records may be affected.`)) return;
    try {
      await removeSection(section.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Road section could not be deleted.');
    }
  }

  async function deleteBranch(branch: BranchRecord) {
    if (!await confirmAction('Delete road branch?', 'A branch with road sections cannot be removed.')) return;
    try {
      await removeBranch(branch.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Road branch could not be deleted.');
    }
  }

  return (
    <AdminShell
      action={<View style={styles.actions}><AdminButton icon="plus" label="Add branch" onPress={() => openBranch()} palette={palette} tone="secondary" /><AdminButton disabled={!branches.length} icon="plus" label="Add section" onPress={() => openSection()} palette={palette} /></View>}
      loading={loading}
      onRefresh={refresh}
      onSearchChange={setQuery}
      searchValue={query}
      subtitle="Manage road branches, section dimensions, and sampling requirements."
      title="Road Network">
      {error ? <Notice error>{error}</Notice> : null}

      <View style={[styles.summaryGrid, isPhone && styles.stack]}>
        <SummaryCard icon="git-branch" label="Road Branches" value={branches.length} palette={palette} />
        <SummaryCard icon="map" label="Road Sections" value={sections.length} palette={palette} />
        <SummaryCard icon="maximize" label="Mapped Area" value={sections.reduce((sum, section) => sum + Number(section.area_sqm ?? 0), 0)} suffix=" m²" palette={palette} />
      </View>

      <AdminPanel palette={palette} title="Road branches" subtitle="Organizational groups for the barangay road network">
        {branches.length ? (
          <View style={styles.branchGrid}>
            {branches.map((branch) => (
              <View key={branch.id} style={[styles.branchCard, { backgroundColor: palette.panelAlt, borderColor: palette.border }]}>
                <View style={[styles.itemIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name="git-branch" size={19} /></View>
                <View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: palette.text }]}>{branch.name}</Text><Text numberOfLines={3} style={[styles.itemMeta, { color: palette.muted }]}>{branch.location || 'Location not recorded'} · {branch.administrative_status} · {sections.filter((section) => section.branch_id === branch.id).length} sections{branch.description ? `\n${branch.description}` : ''}</Text></View>
                <Pressable accessibilityLabel={`Edit ${branch.name}`} onPress={() => openBranch(branch)} style={styles.smallIcon}><Feather color={palette.muted} name="edit-2" size={16} /></Pressable>
                <Pressable accessibilityLabel={`Delete ${branch.name}`} onPress={() => void deleteBranch(branch)} style={styles.smallIcon}><Feather color={palette.red} name="trash-2" size={16} /></Pressable>
              </View>
            ))}
          </View>
        ) : <AdminEmpty icon="git-branch" message="Add the first road branch to begin organizing sections." palette={palette} />}
      </AdminPanel>

      <AdminPanel palette={palette} title="Road sections" subtitle={`${filteredSections.length} matching section${filteredSections.length === 1 ? '' : 's'}`}>
        {filteredSections.length ? (
          <View style={styles.sectionList}>
            {filteredSections.map((section) => {
              const latestPci = latestResultsMap.get(section.id)?.pci;
              return (
              <View key={section.id} style={[styles.sectionRow, isPhone && styles.sectionRowPhone, { borderBottomColor: palette.border }]}>
                <View style={[styles.itemIcon, { backgroundColor: palette.blueSoft }]}><MaterialRoad color={palette.blue} /></View>
                <View style={styles.sectionIdentity}><Text style={[styles.itemTitle, { color: palette.text }]}>{section.name}</Text><Text style={[styles.itemMeta, { color: palette.muted }]}>{branchById.get(section.branch_id)?.name ?? 'Unknown branch'} · Asphalt{section.start_description || section.end_description ? `\n${section.start_description || 'Start not set'} → ${section.end_description || 'End not set'}` : ''}</Text></View>
                <DataPoint label="Length" value={formatNumber(section.length_meters, ' m')} palette={palette} />
                <DataPoint label="Width" value={formatNumber(section.width_meters, ' m')} palette={palette} />
                <DataPoint label="Area" value={formatNumber(section.area_sqm, ' m²')} palette={palette} />
                <DataPoint label="PCI" value={formatNumber(latestPci)} palette={palette} />
                <View style={styles.rowActions}><Pressable accessibilityLabel={`Edit ${section.name}`} onPress={() => openSection(section)} style={styles.smallIcon}><Feather color={palette.blue} name="edit-2" size={16} /></Pressable><Pressable accessibilityLabel={`Delete ${section.name}`} onPress={() => void deleteSection(section)} style={styles.smallIcon}><Feather color={palette.red} name="trash-2" size={16} /></Pressable></View>
              </View>
            )})}
          </View>
        ) : <AdminEmpty icon="map" message={query ? 'No road sections match your search.' : 'No road sections have been added yet.'} palette={palette} />}
      </AdminPanel>

      <Modal animationType="fade" onRequestClose={() => setModal(null)} transparent visible={modal !== null}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <View style={styles.modalHeader}><View><Text style={[styles.modalTitle, { color: palette.text }]}>{modal === 'branch' ? `${branchForm.id ? 'Edit' : 'Add'} road branch` : `${sectionForm.id ? 'Edit' : 'Add'} road section`}</Text><Text style={[styles.modalSubtitle, { color: palette.muted }]}>Changes are saved directly to the secured project database.</Text></View><Pressable accessibilityLabel="Close dialog" onPress={() => setModal(null)}><Feather color={palette.muted} name="x" size={21} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.form}>
              {modal === 'branch' ? (
                <><AdminField label="Branch name" onChangeText={(name) => setBranchForm((current) => ({ ...current, name }))} palette={palette} placeholder="Enter branch name" value={branchForm.name} /><AdminField label="Barangay / location" onChangeText={(location) => setBranchForm((current) => ({ ...current, location }))} palette={palette} value={branchForm.location} /><AdminField label="Administrative status" onChangeText={(administrative_status) => setBranchForm((current) => ({ ...current, administrative_status }))} palette={palette} placeholder="active, inactive or archived" value={branchForm.administrative_status} /><AdminField label="Description" multiline onChangeText={(description) => setBranchForm((current) => ({ ...current, description }))} palette={palette} placeholder="Optional description" value={branchForm.description} /></>
              ) : (
                <><Text style={[styles.fieldLabel, { color: palette.text }]}>Road branch</Text><View style={styles.optionWrap}>{branches.map((branch) => <Pressable key={branch.id} onPress={() => setSectionForm((current) => ({ ...current, branch_id: branch.id }))} style={[styles.optionChip, { borderColor: sectionForm.branch_id === branch.id ? palette.blue : palette.border, backgroundColor: sectionForm.branch_id === branch.id ? palette.blueSoft : palette.panel }]}><Text style={{ color: sectionForm.branch_id === branch.id ? palette.blue : palette.text, fontSize: 12, fontWeight: '700' }}>{branch.name}</Text></Pressable>)}</View><AdminField label="Section code and name" onChangeText={(name) => setSectionForm((current) => ({ ...current, name }))} palette={palette} placeholder="e.g. MMTD-001 — Purok 2" value={sectionForm.name} /><AdminField label="Description" multiline onChangeText={(description) => setSectionForm((current) => ({ ...current, description }))} palette={palette} placeholder="Optional description" value={sectionForm.description} /><View style={styles.twoColumns}><View style={styles.formColumn}><AdminField label="Start location / chainage" onChangeText={(start_description) => setSectionForm((current) => ({ ...current, start_description }))} palette={palette} value={sectionForm.start_description} /></View><View style={styles.formColumn}><AdminField label="End location / chainage" onChangeText={(end_description) => setSectionForm((current) => ({ ...current, end_description }))} palette={palette} value={sectionForm.end_description} /></View></View><View style={styles.twoColumns}><View style={styles.formColumn}><AdminField keyboardType="numeric" label="Length (meters)" onChangeText={(length_meters) => setSectionForm((current) => ({ ...current, length_meters }))} palette={palette} value={sectionForm.length_meters} /></View><View style={styles.formColumn}><AdminField keyboardType="numeric" label="Width (meters)" onChangeText={(width_meters) => setSectionForm((current) => ({ ...current, width_meters }))} palette={palette} value={sectionForm.width_meters} /></View></View><Text style={[styles.itemMeta, { color: palette.muted }]}>Pavement type: Asphalt. Sample counts come from an engineer-confirmed plan.</Text><View style={styles.twoColumns}><View style={styles.formColumn}><AdminField keyboardType="numeric" label="Latitude (optional)" onChangeText={(latitude) => setSectionForm((current) => ({ ...current, latitude }))} palette={palette} value={sectionForm.latitude} /></View><View style={styles.formColumn}><AdminField keyboardType="numeric" label="Longitude (optional)" onChangeText={(longitude) => setSectionForm((current) => ({ ...current, longitude }))} palette={palette} value={sectionForm.longitude} /></View></View><AdminField label="Notes" multiline onChangeText={(notes) => setSectionForm((current) => ({ ...current, notes }))} palette={palette} placeholder="Administrative and field notes" value={sectionForm.notes} /></>
              )}
              {error ? <ErrorBanner message={error} palette={palette} /> : null}
            </ScrollView>
            <View style={styles.modalActions}><AdminButton label="Cancel" onPress={() => setModal(null)} palette={palette} tone="secondary" /><AdminButton disabled={saving} label={saving ? 'Saving...' : 'Save'} onPress={() => void (modal === 'branch' ? submitBranch() : submitSection())} palette={palette} /></View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

function MaterialRoad({ color }: { color: string }) {
  return <Feather color={color} name="navigation" size={19} />;
}

function SummaryCard({ icon, label, palette, suffix = '', value }: { icon: keyof typeof Feather.glyphMap; label: string; palette: ReturnType<typeof useAdminPalette>; suffix?: string; value: number }) {
  return <View style={[styles.summaryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.summaryIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={icon} size={20} /></View><View><Text style={[styles.summaryLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.summaryValue, { color: palette.text }]}>{value.toLocaleString()}{suffix}</Text></View></View>;
}

function DataPoint({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: string }) {
  return <View style={styles.dataPoint}><Text style={[styles.dataLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.dataValue, { color: palette.text }]}>{value}</Text></View>;
}

function ErrorBanner({ message, palette }: { message: string; palette: ReturnType<typeof useAdminPalette> }) {
  return <View style={[styles.errorBanner, { backgroundColor: palette.redSoft, borderColor: palette.red }]}><Feather color={palette.red} name="alert-circle" size={17} /><Text style={[styles.errorText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  summaryGrid: { flexDirection: 'row', gap: 14 },
  stack: { flexDirection: 'column' },
  summaryCard: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 12, minHeight: 96, padding: 16 },
  summaryIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  branchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  branchCard: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, minWidth: 260, padding: 12 },
  itemIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 13, fontWeight: '800' },
  itemMeta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  smallIcon: { padding: 6 },
  sectionList: { minWidth: 0 },
  sectionRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 72, paddingVertical: 9 },
  sectionRowPhone: { alignItems: 'flex-start', flexWrap: 'wrap' },
  sectionIdentity: { flex: 1.4, minWidth: 150 },
  dataPoint: { minWidth: 75 },
  dataLabel: { fontSize: 9.5, textTransform: 'uppercase' },
  dataValue: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  rowActions: { flexDirection: 'row' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(3,10,26,0.62)', flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { borderRadius: 15, borderWidth: 1, maxHeight: '92%', maxWidth: 650, overflow: 'hidden', width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '900' },
  modalSubtitle: { fontSize: 11, marginTop: 3 },
  form: { gap: 13, paddingHorizontal: 18, paddingBottom: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionChip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  formColumn: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end', padding: 18, paddingTop: 10 },
  errorBanner: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
