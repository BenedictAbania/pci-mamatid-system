import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminEmpty, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import {
  BranchRecord,
  createInspection,
  InspectionRecord,
  loadInspections,
  ProfileRecord,
  removeInspection,
  SectionRecord,
  updateInspectionStatus,
} from '@/lib/admin-data';
import { confirmAction, formatDate, formatNumber, titleCase } from '@/lib/admin-utils';
import { useAuth } from '@/providers/AuthProvider';

type InspectionForm = {
  section_id: string;
  unit_number: string;
  area_sqm: string;
  latitude: string;
  longitude: string;
  sample_type: 'random' | 'additional';
};

const emptyForm: InspectionForm = {
  section_id: '',
  unit_number: '',
  area_sqm: '',
  latitude: '',
  longitude: '',
  sample_type: 'random' as const,
};

type StatusFilter = 'all' | InspectionRecord['status'];

export default function InspectionsScreen() {
  const palette = useAdminPalette();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [sections, setSections] = useState<SectionRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [reviewing, setReviewing] = useState<{ inspection: InspectionRecord; status: 'approved' | 'rejected' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isPhone = width < 720;

  const refresh = useCallback(async () => {
    try {
      const result = await loadInspections();
      setError('');
      setInspections(result.inspections);
      setSections(result.sections);
      setBranches(result.branches);
      setProfiles(result.profiles);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inspection data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const sectionById = useMemo(() => new Map(sections.map((item) => [item.id, item])), [sections]);
  const branchById = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item.full_name])), [profiles]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = inspections.filter((inspection) => {
    const section = sectionById.get(inspection.section_id);
    const matchesStatus = status === 'all' || inspection.status === status;
    const text = `${section?.name ?? ''} ${section ? branchById.get(section.branch_id) : ''} ${inspection.unit_number} ${inspection.status} ${inspection.surveyed_by ? profileById.get(inspection.surveyed_by) : ''}`.toLowerCase();
    return matchesStatus && text.includes(normalizedQuery);
  });

  async function submitInspection() {
    if (!user || !form.section_id || !form.unit_number) {
      setError('Road section and unit number are required.');
      return;
    }
    const values = [form.unit_number, form.area_sqm, form.latitude, form.longitude].filter(Boolean).map(Number);
    if (values.some((value) => !Number.isFinite(value)) || Number(form.unit_number) <= 0 || (form.area_sqm && Number(form.area_sqm) <= 0)) {
      setError('Enter valid numeric inspection details.');
      return;
    }
    if ((form.latitude && Math.abs(Number(form.latitude)) > 90) || (form.longitude && Math.abs(Number(form.longitude)) > 180)) {
      setError('Latitude or longitude is outside its valid range.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createInspection(form, user.id);
      setFormOpen(false);
      setForm(emptyForm);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inspection could not be created.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(inspection: InspectionRecord, nextStatus: InspectionRecord['status']) {
    if (!user) return;
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      setReviewNotes(inspection.review_notes ?? '');
      setReviewing({ inspection, status: nextStatus });
      return;
    }
    setSaving(true);
    try {
      await updateInspectionStatus(inspection, nextStatus, user.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inspection status could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function submitReview() {
    if (!user || !reviewing) return;
    setSaving(true);
    setError('');
    try {
      await updateInspectionStatus(reviewing.inspection, reviewing.status, user.id, reviewNotes);
      setReviewing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteInspection(inspection: InspectionRecord) {
    if (!await confirmAction('Delete inspection?', `Sample unit ${inspection.unit_number} will be permanently removed.`)) return;
    try {
      await removeInspection(inspection.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inspection could not be deleted.');
    }
  }

  return (
    <AdminShell
      action={<AdminButton disabled={!sections.length} icon="plus" label="New inspection" onPress={() => { setForm({ ...emptyForm, section_id: sections[0]?.id ?? '' }); setError(''); setFormOpen(true); }} palette={palette} />}
      loading={loading}
      onRefresh={() => void refresh()}
      onSearchChange={setQuery}
      searchValue={query}
      subtitle="Create sample units and manage the inspection review workflow."
      title="Inspections">
      {error ? <Notice message={error} palette={palette} /> : null}
      {!sections.length ? <Notice message="Add a road section before creating an inspection." palette={palette} tone="info" /> : null}

      <View style={styles.filters}>
        {(['all', 'draft', 'submitted', 'approved', 'rejected'] as StatusFilter[]).map((item) => (
          <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filter, { backgroundColor: status === item ? palette.blue : palette.panel, borderColor: status === item ? palette.blue : palette.border }]}>
            <Text style={{ color: status === item ? '#FFFFFF' : palette.text, fontSize: 12, fontWeight: '700' }}>{titleCase(item)}</Text>
            <Text style={{ color: status === item ? '#DCEAFF' : palette.muted, fontSize: 10 }}>{item === 'all' ? inspections.length : inspections.filter((record) => record.status === item).length}</Text>
          </Pressable>
        ))}
      </View>

      <AdminPanel palette={palette} subtitle={`${filtered.length} matching inspection${filtered.length === 1 ? '' : 's'}`} title="Inspection register">
        {filtered.length ? (
          <View>
            {!isPhone ? <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: palette.panelAlt }]}><Text style={[styles.dateCell, styles.headerText, { color: palette.muted }]}>Date</Text><Text style={[styles.mainCell, styles.headerText, { color: palette.muted }]}>Road section</Text><Text style={[styles.cell, styles.headerText, { color: palette.muted }]}>Inspector</Text><Text style={[styles.cell, styles.headerText, { color: palette.muted }]}>PCI</Text><Text style={[styles.statusCell, styles.headerText, { color: palette.muted }]}>Status</Text><View style={styles.actionCell} /></View> : null}
            {filtered.map((inspection) => {
              const section = sectionById.get(inspection.section_id);
              return (
                <View key={inspection.id} style={[styles.tableRow, isPhone && styles.tableRowPhone, { borderBottomColor: palette.border }]}>
                  <View style={styles.dateCell}><Text style={[styles.primaryText, { color: palette.text }]}>{formatDate(inspection.surveyed_at ?? inspection.created_at)}</Text><Text style={[styles.secondaryText, { color: palette.muted }]}>Unit {inspection.unit_number} · {titleCase(inspection.sample_type ?? 'Unspecified')}</Text></View>
                  <View style={styles.mainCell}><Text style={[styles.primaryText, { color: palette.text }]}>{section?.name ?? 'Unknown section'}</Text><Text style={[styles.secondaryText, { color: palette.muted }]}>{section ? branchById.get(section.branch_id) : ''}</Text></View>
                  <Text numberOfLines={1} style={[styles.cell, styles.primaryText, { color: palette.text }]}>{inspection.surveyed_by ? profileById.get(inspection.surveyed_by) ?? 'Inspector' : 'Unassigned'}</Text>
                  <View style={styles.cell}><Text style={[styles.pciText, { color: palette.text }]}>{formatNumber(inspection.pci_score)}</Text><Text style={[styles.secondaryText, { color: palette.muted }]}>{inspection.condition_label ?? 'Not computed'}</Text></View>
                  <View style={styles.statusCell}><StatusBadge palette={palette} status={inspection.status} /></View>
                  <View style={styles.actionCell}>
                    {inspection.status === 'draft' ? <ActionIcon icon="send" label="Submit" onPress={() => void changeStatus(inspection, 'submitted')} palette={palette} /> : null}
                    {inspection.status === 'submitted' ? <><ActionIcon icon="check" label="Approve" onPress={() => void changeStatus(inspection, 'approved')} palette={palette} /><ActionIcon icon="x" label="Reject" onPress={() => void changeStatus(inspection, 'rejected')} palette={palette} danger /></> : null}
                    {inspection.status === 'rejected' ? <ActionIcon icon="rotate-ccw" label="Return to draft" onPress={() => void changeStatus(inspection, 'draft')} palette={palette} /> : null}
                    <ActionIcon icon="trash-2" label="Delete" onPress={() => void deleteInspection(inspection)} palette={palette} danger />
                  </View>
                </View>
              );
            })}
          </View>
        ) : <AdminEmpty icon="clipboard" message={query || status !== 'all' ? 'No inspections match the selected filters.' : 'No inspections have been recorded yet.'} palette={palette} />}
      </AdminPanel>

      <Modal animationType="fade" onRequestClose={() => setFormOpen(false)} transparent visible={formOpen}>
        <View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: palette.panel, borderColor: palette.border }]}><ModalTitle onClose={() => setFormOpen(false)} palette={palette} subtitle="Create a draft sample unit using live road-section data." title="New inspection" /><ScrollView contentContainerStyle={styles.form}><Text style={[styles.label, { color: palette.text }]}>Road section</Text><View style={styles.options}>{sections.map((section) => <Pressable key={section.id} onPress={() => setForm((current) => ({ ...current, section_id: section.id }))} style={[styles.option, { backgroundColor: form.section_id === section.id ? palette.blueSoft : palette.panel, borderColor: form.section_id === section.id ? palette.blue : palette.border }]}><Text style={{ color: form.section_id === section.id ? palette.blue : palette.text, fontSize: 12, fontWeight: '700' }}>{section.name}</Text></Pressable>)}</View><AdminField keyboardType="numeric" label="Sample unit number" onChangeText={(unit_number) => setForm((current) => ({ ...current, unit_number }))} palette={palette} value={form.unit_number} /><AdminField keyboardType="numeric" label="Area (m²)" onChangeText={(area_sqm) => setForm((current) => ({ ...current, area_sqm }))} palette={palette} value={form.area_sqm} /><View style={styles.twoColumns}><View style={styles.column}><AdminField keyboardType="numeric" label="Latitude" onChangeText={(latitude) => setForm((current) => ({ ...current, latitude }))} palette={palette} value={form.latitude} /></View><View style={styles.column}><AdminField keyboardType="numeric" label="Longitude" onChangeText={(longitude) => setForm((current) => ({ ...current, longitude }))} palette={palette} value={form.longitude} /></View></View><Text style={[styles.label, { color: palette.text }]}>Sample type</Text><View style={styles.options}>{(['random', 'additional'] as const).map((sampleType) => <Pressable key={sampleType} onPress={() => setForm((current) => ({ ...current, sample_type: sampleType }))} style={[styles.option, { backgroundColor: form.sample_type === sampleType ? palette.blueSoft : palette.panel, borderColor: form.sample_type === sampleType ? palette.blue : palette.border }]}><Text style={{ color: form.sample_type === sampleType ? palette.blue : palette.text, fontSize: 12, fontWeight: '700' }}>{titleCase(sampleType)}</Text></Pressable>)}</View>{error ? <Notice message={error} palette={palette} /> : null}</ScrollView><View style={styles.modalActions}><AdminButton label="Cancel" onPress={() => setFormOpen(false)} palette={palette} tone="secondary" /><AdminButton disabled={saving} label={saving ? 'Creating...' : 'Create draft'} onPress={() => void submitInspection()} palette={palette} /></View></View></View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setReviewing(null)} transparent visible={reviewing !== null}>
        <View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: palette.panel, borderColor: palette.border }]}><ModalTitle onClose={() => setReviewing(null)} palette={palette} subtitle="Record an accountable review decision." title={`${titleCase(reviewing?.status ?? '')} inspection`} /><View style={styles.form}><AdminField label="Review notes" multiline onChangeText={setReviewNotes} palette={palette} placeholder="Optional review notes" value={reviewNotes} />{error ? <Notice message={error} palette={palette} /> : null}</View><View style={styles.modalActions}><AdminButton label="Cancel" onPress={() => setReviewing(null)} palette={palette} tone="secondary" /><AdminButton disabled={saving} label={saving ? 'Saving...' : 'Confirm decision'} onPress={() => void submitReview()} palette={palette} tone={reviewing?.status === 'rejected' ? 'danger' : 'primary'} /></View></View></View>
      </Modal>
    </AdminShell>
  );
}

function StatusBadge({ palette, status }: { palette: ReturnType<typeof useAdminPalette>; status: InspectionRecord['status'] }) {
  const foreground = status === 'approved' ? palette.green : status === 'rejected' ? palette.red : status === 'submitted' ? palette.blue : palette.amber;
  const background = status === 'approved' ? palette.greenSoft : status === 'rejected' ? palette.redSoft : status === 'submitted' ? palette.blueSoft : palette.amberSoft;
  return <View style={[styles.badge, { backgroundColor: background }]}><Text style={[styles.badgeText, { color: foreground }]}>{titleCase(status)}</Text></View>;
}

function ActionIcon({ danger, icon, label, onPress, palette }: { danger?: boolean; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; palette: ReturnType<typeof useAdminPalette> }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={[styles.actionIcon, { backgroundColor: danger ? palette.redSoft : palette.blueSoft }]}><Feather color={danger ? palette.red : palette.blue} name={icon} size={14} /></Pressable>;
}

function ModalTitle({ onClose, palette, subtitle, title }: { onClose: () => void; palette: ReturnType<typeof useAdminPalette>; subtitle: string; title: string }) {
  return <View style={styles.modalHeader}><View><Text style={[styles.modalTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.modalSubtitle, { color: palette.muted }]}>{subtitle}</Text></View><Pressable accessibilityLabel="Close dialog" onPress={onClose}><Feather color={palette.muted} name="x" size={21} /></Pressable></View>;
}

function Notice({ message, palette, tone = 'error' }: { message: string; palette: ReturnType<typeof useAdminPalette>; tone?: 'error' | 'info' }) {
  const foreground = tone === 'error' ? palette.red : palette.blue;
  const background = tone === 'error' ? palette.redSoft : palette.blueSoft;
  return <View style={[styles.notice, { backgroundColor: background, borderColor: foreground }]}><Feather color={foreground} name={tone === 'error' ? 'alert-circle' : 'info'} size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 38, paddingHorizontal: 12 },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: 9, paddingVertical: 8 },
  tableRowPhone: { alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 },
  tableHeader: { borderBottomWidth: 0, borderRadius: 8, minHeight: 35, paddingVertical: 0 },
  headerText: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase' },
  dateCell: { flex: 1.05, minWidth: 115, paddingHorizontal: 5 },
  mainCell: { flex: 1.3, minWidth: 140, paddingHorizontal: 5 },
  cell: { flex: 1, minWidth: 100, paddingHorizontal: 5 },
  statusCell: { flex: 0.8, minWidth: 85, paddingHorizontal: 5 },
  actionCell: { flexDirection: 'row', gap: 5, justifyContent: 'flex-end', minWidth: 100 },
  primaryText: { fontSize: 12, fontWeight: '600' },
  secondaryText: { fontSize: 10, marginTop: 3 },
  pciText: { fontSize: 15, fontWeight: '900' },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  actionIcon: { alignItems: 'center', borderRadius: 7, height: 30, justifyContent: 'center', width: 30 },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(3,10,26,0.62)', flex: 1, justifyContent: 'center', padding: 18 },
  modal: { borderRadius: 15, borderWidth: 1, maxHeight: '92%', maxWidth: 620, overflow: 'hidden', width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '900' },
  modalSubtitle: { fontSize: 11, marginTop: 3 },
  form: { gap: 13, paddingHorizontal: 18, paddingBottom: 18 },
  label: { fontSize: 12, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end', padding: 18, paddingTop: 10 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
