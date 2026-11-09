import { PageControls } from '@/components/workflow/pagination';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminEmpty, AdminField, AdminPanel, AdminShell, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { ROLE_ORDER, roleColors, roleHints } from '@/lib/auth/access';
import { brand, layout } from '@/lib/ui/design-system';
import { formatDate, titleCase } from '@/lib/utils/admin-utils';
import { supabase } from '@/lib/data/supabase';
import { callWorkflow, ensureWorkflowReady } from '@/lib/data/workflow-data';
import { useAuth, UserRole } from '@/providers/AuthProvider';

const roles: UserRole[] = ['admin', 'reviewer', 'encoder', 'viewer'];
/** "What a <role> can do" box under the role cards. Mirrors the route rules in src/lib/auth/access.ts. */
const rolePermissions: Record<UserRole, { can: string[]; cannot: string[] }> = {
  admin: {
    can: ['Add, edit and deactivate user accounts', 'Change settings and the road network', 'See PCI results, reports and the maintenance plan'],
    cannot: ['Cannot record or review inspections'],
  },
  reviewer: {
    can: ['Check, approve or return submitted inspections', 'Record inspections and set up sampling', 'See PCI results, reports and repair priorities'],
    cannot: ['Cannot manage accounts or settings'],
  },
  encoder: {
    can: ['Record inspections and distress data in the field', 'Submit inspections for review'],
    cannot: ['Cannot approve results', 'Cannot view reports or manage accounts'],
  },
  viewer: {
    can: ['See published PCI results and repair priorities', 'View and print reports'],
    cannot: ['Cannot record or edit inspections', 'Cannot approve results or manage accounts'],
  },
};
const statusColors = { active: '#00BF63', inactive: '#A9B4CC' };
/** Choices for "Office or department". Saved as text in profiles.office, so this list can change freely. */
const offices = [
  'City Engineering Office',
  'City Planning and Development Office',
  'Barangay Mamatid Office',
  'Other',
];
const OTHER_OFFICE = 'Other';
const PAGE_SIZE = 50;
type PressState = { pressed: boolean; hovered?: boolean };

export interface LakadAccount {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Missing until the accounts_last_sign_in migration is applied; null means never signed in. */
  last_sign_in_at?: string | null;
  /** Missing until the edit_user_accounts migration is applied. */
  office?: string;
  job_title?: string;
}

/** An activate/deactivate or a permanent delete waiting for confirmation in a dialog. */
type Pending = { kind: 'status'; account: LakadAccount; active: boolean } | { kind: 'delete'; account: LakadAccount };
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

/**
 * Calls the admin-account Edge Function (set_password or delete). Throws an Error carrying the
 * function's own reason when it gives one.
 */
async function accountAction(body: { action: 'set_password' | 'delete'; target: string; password?: string }) {
  const { error: failure } = await supabase.functions.invoke('admin-account', { body });
  if (!failure) return;
  // FunctionsHttpError carries the function's JSON reply; use its reason when there is one.
  const reply = (failure as { context?: Response }).context;
  const reason = reply && typeof reply.json === 'function' ? await reply.json().then(json => json?.error, () => null) : null;
  throw new Error(typeof reason === 'string' && reason ? reason : 'The account service did not respond. Verify that the protected admin-account function has been deployed.');
}
/** The Add User or Edit User form, shown in place of the account list. */
type FormMode = { mode: 'add' } | { mode: 'edit'; account: LakadAccount };
type Draft = { name: string; email: string; office: string; jobTitle: string; role: UserRole | null };
const emptyDraft: Draft = { name: '', email: '', office: '', jobTitle: '', role: null };

export default function UsersScreen() {
  const palette = useAdminPalette();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const [profiles, setProfiles] = useState<LakadAccount[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState<Pending | null>(null);
  const isPhone = width < 760;
  const dark = palette.background !== '#F3F6FC';

  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      setLoading(true);
      await ensureWorkflowReady();
      const { data, error } = await supabase.rpc('lakad_accounts_page', { page_after: cursor, page_size: PAGE_SIZE });
      if (error) throw new Error(error.message);
      if (request !== sequence.current) return;
      setError('');
      setProfiles(data as LakadAccount[]);
    } catch (reason) {
      if (request === sequence.current) { setProfiles([]); setError(reason instanceof Error ? reason.message : 'User profiles could not be loaded.'); }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++sequence.current; };
  }, [refresh]);

  const search = query.trim().toLowerCase();
  const filtered = profiles.filter((profile) =>
    (roleFilter === 'all' || profile.role === roleFilter)
    && `${profile.full_name || ''} ${profile.email || ''}`.toLowerCase().includes(search)
  );
  const morePages = profiles.length === PAGE_SIZE || cursors.length > 1;

  async function updateAccount(account: LakadAccount, active: boolean) {
    if (account.id === user?.id) return false;
    setSavingId(account.id);
    setError('');
    setMessage('');
    try {
      await callWorkflow('lakad_manage_account', { target: account.id, new_role: account.role, active });
      await refresh();
      setMessage('Account access updated.');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The user account could not be updated.');
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function deleteAccount(account: LakadAccount) {
    if (account.id === user?.id) return false;
    const name = account.full_name || account.email || 'The account';
    setSavingId(account.id);
    setError('');
    setMessage('');
    try {
      await accountAction({ action: 'delete', target: account.id });
      await refresh();
      setMessage(`${name} was deleted. Their login and profile are gone.`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The account could not be deleted.');
      return false;
    } finally {
      setSavingId(null);
    }
  }

  /** Shared checks for both forms. Returns the role when every required field is filled. */
  function validDraft(): UserRole | null {
    if (!draft.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setError('Enter a full name and valid email address.');
      return null;
    }
    if (!draft.office.trim() || !draft.jobTitle.trim()) {
      setError('Choose an office (type it in if you chose Other) and enter a position or job title.');
      return null;
    }
    if (!draft.role) {
      setError('Choose a role for this account.');
      return null;
    }
    return draft.role;
  }

  /** Calls admin-invite; on success shows the message, closes the form and reloads the list. */
  async function sendInvite(savingKey: string, body: Record<string, string>, success: string) {
    setSavingId(savingKey);
    setError('');
    setMessage('');
    try {
      const { error: failure } = await supabase.functions.invoke('admin-invite', { body });
      if (failure) throw failure;
      setMessage(success);
      closeForm();
      await refresh();
    } catch (failure) {
      // FunctionsHttpError carries the function's JSON reply; show its reason when there is one.
      const reply = (failure as { context?: Response }).context;
      const reason = reply && typeof reply.json === 'function' ? await reply.json().then(body => body?.error, () => null) : null;
      setError(typeof reason === 'string' && reason ? `Invitation failed: ${reason}` : 'Invitation failed. Verify that the protected admin-invite function has been deployed.');
    } finally {
      setSavingId(null);
    }
  }

  /** Full Add User form: details and role are saved right away; they set a password from the email link. */
  function addAccount() {
    const role = validDraft();
    if (!role) return;
    const name = draft.name.trim();
    const email = draft.email.trim();
    void sendInvite('form', { email, full_name: name, office: draft.office.trim(), job_title: draft.jobTitle.trim(), role },
      `${name} was added as ${titleCase(role)}. They set a password from the email link sent to ${email}.`);
  }

  async function saveEdit(account: LakadAccount) {
    const role = validDraft();
    if (!role) return;
    setSavingId('form');
    setError('');
    setMessage('');
    try {
      await callWorkflow('lakad_update_account', {
        target: account.id, new_full_name: draft.name.trim(), new_office: draft.office.trim(), new_job_title: draft.jobTitle.trim(), new_role: role,
      });
      setMessage(`${draft.name.trim()}'s account was updated.`);
      closeForm();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `Changes were not saved: ${reason.message}` : 'Changes were not saved.');
    } finally {
      setSavingId(null);
    }
  }

  function openAdd() {
    setError('');
    setMessage('');
    setDraft(emptyDraft);
    setForm({ mode: 'add' });
  }

  function openEdit(account: LakadAccount) {
    setError('');
    setMessage('');
    setDraft({ name: account.full_name ?? '', email: account.email ?? '', office: account.office ?? '', jobTitle: account.job_title ?? '', role: account.role });
    setForm({ mode: 'edit', account });
  }

  /** Leaves the form and clears it. */
  function closeForm() {
    setForm(null);
    setDraft(emptyDraft);
  }

  const setField = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const addUser = form ? undefined : <AdminButton icon="user-plus" label="Add User" onPress={openAdd} palette={palette} />;

  return (
    <AdminShell action={addUser} loading={loading} onRefresh={refresh} subtitle="Invite people and choose what each account can do." title="User Accounts">
      {error ? <Notice message={error} palette={palette} tone="error" /> : null}
      {message ? <Notice message={message} palette={palette} tone="success" /> : null}

      {form ? <>
        <AccountForm
          key={form.mode === 'edit' ? form.account.id : 'new'}
          busy={savingId !== null}
          draft={draft}
          editing={form.mode === 'edit' ? form.account : null}
          isPhone={isPhone}
          onCancel={closeForm}
          onField={setField}
          onSubmit={() => { if (form.mode === 'edit') void saveEdit(form.account); else addAccount(); }}
          palette={palette}
          saving={savingId === 'form'}
        />
        {form.mode === 'edit' ? <PasswordPanel account={form.account} isPhone={isPhone} palette={palette} /> : null}
      </> : <>

      <View style={[styles.filters, isPhone && styles.filtersPhone]}>
        <View style={[styles.search, isPhone && styles.searchPhone, { backgroundColor: dark ? palette.panelAlt : palette.border }]}>
          <Feather color={palette.text} name="search" size={20} />
          <TextInput
            accessibilityLabel="Search by name or email"
            onChangeText={setQuery}
            placeholder="Search by name or email"
            placeholderTextColor={palette.text}
            style={[styles.searchInput, { color: palette.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            value={query}
          />
          {query ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={8} onPress={() => setQuery('')}><Feather color={palette.muted} name="x" size={16} /></Pressable> : null}
        </View>
        <View accessibilityRole="tablist" style={styles.chips}>
          {(['all', ...roles] as const).map((value) => {
            const selected = roleFilter === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setRoleFilter(value)}
                style={({ hovered, pressed }: PressState) => [styles.chip, {
                  backgroundColor: selected ? (dark ? palette.action : brand.navy) : hovered ? palette.blueSoft : palette.panel,
                }, pressed && styles.pressed]}>
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : palette.text }]}>{value === 'all' ? 'All' : titleCase(value)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.count, { color: palette.text }]}>
          {filtered.length} account{filtered.length === 1 ? '' : 's'}{morePages ? ' on this page' : ''}
        </Text>
      </View>

      <View style={[styles.table, { backgroundColor: palette.panel }]}>
        {filtered.length ? (
          <>
            {!isPhone ? (
              <View style={[styles.row, styles.headRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.nameCell, styles.headText, { color: palette.text }]}>Name</Text>
                <Text style={[styles.roleCell, styles.headText, styles.centerText, { color: palette.text }]}>Role</Text>
                <Text style={[styles.statusCell, styles.headText, styles.centerText, { color: palette.text }]}>Status</Text>
                <Text style={[styles.seenCell, styles.headText, styles.centerText, { color: palette.text }]}>Last Log-in</Text>
                <Text style={[styles.actionCell, styles.headText, { color: palette.text }]}>Actions</Text>
              </View>
            ) : null}
            {filtered.map((profile, index) => (
              <AccountRow
                key={profile.id}
                busy={savingId === profile.id}
                isLast={index === filtered.length - 1}
                isPhone={isPhone}
                isSelf={profile.id === user?.id}
                onDelete={() => setPending({ kind: 'delete', account: profile })}
                onEdit={() => openEdit(profile)}
                onToggle={() => setPending({ kind: 'status', account: profile, active: !profile.is_active })}
                palette={palette}
                profile={profile}
              />
            ))}
          </>
        ) : <AdminEmpty icon="users" message={query || roleFilter !== 'all' ? 'No accounts match this search or filter.' : 'No accounts yet. Use Add User to send the first invitation.'} palette={palette} />}
      </View>

      <PageControls page={cursors.length} busy={loading} hasNext={profiles.length === PAGE_SIZE} previous={() => setCursors(cursors.slice(0, -1))} next={() => { const last = profiles.at(-1); if (last) setCursors([...cursors, last.id]); }} />

      <ConfirmDialog
        busy={savingId !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          // A failed delete closes the dialog so the reason shows on the page.
          if (pending.kind === 'delete') void deleteAccount(pending.account).then(() => setPending(null));
          else void updateAccount(pending.account, pending.active).then((saved) => { if (saved) setPending(null); });
        }}
        palette={palette}
        pending={pending}
      />
      </>}
    </AdminShell>
  );
}

function AccountRow({ profile, palette, isPhone, isSelf, isLast, busy, onEdit, onToggle, onDelete }: {
  profile: LakadAccount; palette: AdminPalette; isPhone: boolean; isSelf: boolean; isLast: boolean; busy: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const name = profile.full_name || 'Unnamed user';
  const identity = <View style={styles.nameCell}>
    <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{name}{isSelf ? ' (You)' : ''}</Text>
    <Text numberOfLines={1} style={[styles.email, { color: palette.text }]}>{profile.email || 'No email'}</Text>
  </View>;
  const actions = isSelf
    ? <Text style={[styles.selfNote, { color: palette.muted }]}>Your account</Text>
    : <View style={styles.actions}>
      <LinkAction disabled={busy} label="Edit" a11y={`Edit ${name}`} onPress={onEdit} color={palette.blue} />
      <LinkAction disabled={busy} label={profile.is_active ? 'Deactivate' : 'Reactivate'} a11y={`${profile.is_active ? 'Deactivate' : 'Reactivate'} ${name}`} onPress={onToggle} color={palette.blue} />
      <LinkAction disabled={busy} label="Delete" a11y={`Delete ${name}`} onPress={onDelete} color={palette.red} />
    </View>;

  if (isPhone) {
    return <View style={[styles.card, !isLast && { borderBottomColor: palette.border, borderBottomWidth: 1 }]}>
      {identity}
      <View style={styles.cardPills}><RolePill role={profile.role} /><StatusPill active={profile.is_active} /></View>
      <Text style={[styles.cardMeta, { color: palette.text }]}>Last log-in: {lastSeen(profile.last_sign_in_at)}</Text>
      {actions}
    </View>;
  }
  return <Pressable accessible={false} style={({ hovered }: PressState) => [styles.row, !isLast && { borderBottomColor: palette.border, borderBottomWidth: 1 }, hovered && { backgroundColor: palette.panelAlt }]}>
    {identity}
    <View style={[styles.roleCell, styles.centerCell]}><RolePill role={profile.role} /></View>
    <View style={[styles.statusCell, styles.centerCell]}><StatusPill active={profile.is_active} /></View>
    <Text style={[styles.seenCell, styles.seenText, styles.centerText, { color: palette.text }]}>{lastSeen(profile.last_sign_in_at)}</Text>
    <View style={styles.actionCell}>{actions}</View>
  </Pressable>;
}

function LinkAction({ label, a11y, onPress, color, disabled }: { label: string; a11y: string; onPress: () => void; color: string; disabled?: boolean }) {
  return <Pressable accessibilityLabel={a11y} accessibilityRole="button" disabled={disabled} hitSlop={6} onPress={onPress} style={({ pressed }: PressState) => [styles.link, disabled && styles.disabled, pressed && styles.pressed]}>
    {({ hovered }: PressState) => <Text style={[styles.linkText, { color, textDecorationLine: hovered && !disabled ? 'underline' : 'none' }]}>{label}</Text>}
  </Pressable>;
}

function RolePill({ role }: { role: UserRole }) {
  return <View style={[styles.pill, { backgroundColor: roleColors[role] }]}><Text style={styles.pillText}>{titleCase(role)}</Text></View>;
}

function StatusPill({ active }: { active: boolean }) {
  return <View style={[styles.pill, { backgroundColor: active ? statusColors.active : statusColors.inactive }]}>
    <Text style={styles.pillText}>{active ? 'Active' : 'Inactive'}</Text>
  </View>;
}

/** Add User and Edit User share this form. Edit mode adds a blue "Editing" badge, banner and top stripe. */
function AccountForm({ draft, editing, isPhone, busy, saving, palette, onField, onSubmit, onCancel }: {
  draft: Draft; editing: LakadAccount | null; isPhone: boolean; busy: boolean; saving: boolean; palette: AdminPalette;
  onField: <K extends keyof Draft>(key: K) => (value: Draft[K]) => void; onSubmit: () => void; onCancel: () => void;
}) {
  const unchanged = !!editing && draft.name.trim() === (editing.full_name ?? '') && draft.office.trim() === (editing.office ?? '')
    && draft.jobTitle.trim() === (editing.job_title ?? '') && draft.role === editing.role;
  const roleChanged = !!editing && !!draft.role && draft.role !== editing.role;
  const submitLabel = editing ? (saving ? 'Saving…' : unchanged ? 'No Changes' : 'Save Changes') : (saving ? 'Adding…' : 'Add User');
  // "Other" lets the administrator type the office. A saved office that is not in the list opens as Other,
  // with the saved text in the box, so editing never silently drops it.
  const [otherOffice, setOtherOffice] = useState(() => !!draft.office && (draft.office === OTHER_OFFICE || !offices.includes(draft.office)));
  const chooseOffice = (value: string) => {
    setOtherOffice(value === OTHER_OFFICE);
    onField('office')(value === OTHER_OFFICE ? '' : value);
  };

  return (
    <AdminPanel palette={palette} style={[styles.form, editing && { borderTopColor: palette.action, borderTopWidth: 3 }]}>
      <View style={styles.formHead}>
        {editing ? <Pressable accessibilityLabel="Back to user accounts" accessibilityRole="button" hitSlop={10} onPress={onCancel} style={({ pressed }: PressState) => [styles.back, pressed && styles.pressed]}>
          <Feather color={palette.text} name="arrow-left" size={22} />
        </Pressable> : null}
        <Text accessibilityRole="header" style={[styles.formTitle, { color: palette.text }]}>{editing ? 'Edit User' : 'Add User'}</Text>
        {editing ? <View style={[styles.editBadge, { backgroundColor: palette.blueSoft }]}>
          <Feather color={palette.blue} name="edit-2" size={12} />
          <Text style={[styles.editBadgeText, { color: palette.blue }]}>Editing</Text>
        </View> : null}
      </View>
      {editing ? (
        <View style={[styles.editBanner, { backgroundColor: palette.blueSoft, borderColor: palette.blue }]}>
          <Feather color={palette.blue} name="user-check" size={18} />
          <View style={styles.editBannerBody}>
            <Text style={[styles.editBannerTitle, { color: palette.text }]}>You are editing {editing.full_name || editing.email || 'this account'}</Text>
            <Text style={[styles.editBannerText, { color: palette.muted }]}>Changes apply as soon as you save. The sign-in email cannot be changed here.</Text>
          </View>
        </View>
      ) : null}

      <Text style={[styles.section, { color: palette.muted }]}>Person</Text>
      <View style={[styles.grid, isPhone && styles.stack]}>
        <View style={styles.gridCell}><AdminField label="Full name" onChangeText={onField('name')} palette={palette} placeholder="First name and last name" required value={draft.name} /></View>
        <View style={styles.gridCell}><AdminField editable={!editing} keyboardType="email-address" label="Email address" onChangeText={onField('email')} palette={palette} placeholder="name@example.com" required value={draft.email} /></View>
      </View>
      <View style={[styles.grid, isPhone && styles.stack]}>
        <View style={[styles.gridCell, { gap: 12 }]}>
          <OfficeSelect onChange={chooseOffice} options={offices} palette={palette} value={otherOffice ? OTHER_OFFICE : draft.office} />
          {otherOffice ? <AdminField label="Specify office" onChangeText={value => onField('office')(value.slice(0, 150))} palette={palette} placeholder="Type the office or department" required value={draft.office} /> : null}
        </View>
        <View style={styles.gridCell}><AdminField label="Position or job title" onChangeText={onField('jobTitle')} palette={palette} placeholder="Example, Civil Engineer" required value={draft.jobTitle} /></View>
      </View>

      <Text style={[styles.section, { color: palette.muted }]}>Role<Text style={{ color: palette.red }}>*</Text></Text>
      <View accessibilityRole="radiogroup" style={styles.roleGrid}>
        {ROLE_ORDER.map((role) => {
          const selected = draft.role === role;
          const current = editing?.role === role;
          return <Pressable key={role} accessibilityLabel={`${titleCase(role)}: ${roleHints[role]}${current ? ' (current role)' : ''}`} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onField('role')(role)}
            style={({ hovered }: PressState) => [styles.roleCard, isPhone && styles.roleCardPhone, { borderColor: selected ? palette.blue : palette.border, backgroundColor: selected ? palette.blueSoft : hovered ? palette.panelAlt : palette.input }]}>
            <View style={[styles.radio, { borderColor: selected ? palette.blue : palette.muted }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: palette.blue }]} /> : null}</View>
            <View style={styles.roleBody}>
              <View style={styles.roleName}>
                <Text style={[styles.roleTitle, { color: palette.text }]}>{titleCase(role)}</Text>
                {current ? <Text style={[styles.currentTag, { color: palette.muted, borderColor: palette.border }]}>Current</Text> : null}
              </View>
              <Text style={[styles.roleCardHint, { color: palette.muted }]}>{roleHints[role]}.</Text>
            </View>
          </Pressable>;
        })}
      </View>

      {draft.role ? (
        <View style={[styles.permissions, { backgroundColor: palette.panelAlt, borderColor: palette.border }]}>
          <Text style={[styles.permissionsTitle, { color: palette.text }]}>What a{draft.role === 'admin' || draft.role === 'encoder' ? 'n' : ''} {titleCase(draft.role)} can do</Text>
          {roleChanged && editing ? <Text style={[styles.permissionLine, { color: palette.blue, fontWeight: '700' }]}>Role changes from {titleCase(editing.role)} to {titleCase(draft.role)}.</Text> : null}
          {rolePermissions[draft.role].can.map(line => <View key={line} style={styles.permissionRow}><Feather color={palette.green} name="check" size={14} /><Text style={[styles.permissionLine, { color: palette.green }]}>{line}</Text></View>)}
          {rolePermissions[draft.role].cannot.map(line => <View key={line} style={styles.permissionRow}><Feather color={palette.red} name="x" size={14} /><Text style={[styles.permissionLine, { color: palette.red }]}>{line}</Text></View>)}
        </View>
      ) : null}

      <View style={styles.formActions}>
        <AdminButton disabled={saving} label="Cancel" onPress={onCancel} palette={palette} tone="secondary" />
        <AdminButton disabled={busy || unchanged} icon={editing ? 'check' : 'user-plus'} label={submitLabel} onPress={onSubmit} palette={palette} />
      </View>
    </AdminPanel>
  );
}

function ConfirmDialog({ pending, palette, busy, onConfirm, onCancel }: {
  pending: Pending | null; palette: AdminPalette; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!pending) return null;
  const name = pending.account.full_name || pending.account.email || 'this account';
  const remove = pending.kind === 'delete';
  const title = remove ? 'Delete account' : pending.active ? 'Reactivate account' : 'Deactivate account';
  const text = remove
    ? `${name} (${pending.account.email ?? 'no email'}) will be permanently deleted. Their login and profile are removed and cannot be restored. Only accounts with no inspection records can be deleted; deactivate the others instead.`
    : pending.active
      ? `${name} will be able to sign in and use LAKAD again.`
      : `${name} will no longer be able to sign in. Their inspection history stays saved.`;
  const confirmLabel = busy ? (remove ? 'Deleting…' : 'Saving…') : remove ? 'Delete Permanently' : pending.active ? 'Reactivate' : 'Deactivate';
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close dialog" accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Text accessibilityRole="header" style={[styles.dialogTitle, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.dialogText, { color: palette.muted }]}>{text}</Text>
          <View style={styles.dialogActions}>
            <AdminButton label="Cancel" onPress={onCancel} palette={palette} tone="secondary" />
            <AdminButton disabled={busy} label={confirmLabel} onPress={onConfirm} palette={palette} tone={!remove && pending.active ? 'primary' : 'danger'} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Edit User only: the administrator sets a new sign-in password for this account. */
function PasswordPanel({ account, isPhone, palette }: { account: LakadAccount; isPhone: boolean; palette: AdminPalette }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const name = account.full_name || account.email || 'this account';

  async function save() {
    setError('');
    setMessage('');
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) { setError(`Use a password of ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      await accountAction({ action: 'set_password', target: account.id, password });
      setPassword('');
      setConfirm('');
      setMessage(`The password for ${name} was changed. Give them the new password; they can sign in with it now.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel palette={palette} style={styles.form} subtitle="Set a new sign-in password for this account. The old password stops working right away." title="Password">
      {error ? <Notice message={error} palette={palette} tone="error" /> : null}
      {message ? <Notice message={message} palette={palette} tone="success" /> : null}
      <View style={[styles.grid, isPhone && styles.stack]}>
        <View style={styles.gridCell}><AdminField autoComplete="new-password" label="New password" onChangeText={value => { setPassword(value); setError(''); }} palette={palette} placeholder={`At least ${MIN_PASSWORD} characters`} required secureTextEntry value={password} /></View>
        <View style={styles.gridCell}><AdminField autoComplete="new-password" label="Confirm new password" onChangeText={value => { setConfirm(value); setError(''); }} palette={palette} placeholder="Type it again" required secureTextEntry value={confirm} /></View>
      </View>
      <View style={styles.formActions}>
        <AdminButton disabled={busy || !password || !confirm} icon="lock" label={busy ? 'Saving…' : 'Set Password'} onPress={() => void save()} palette={palette} />
      </View>
    </AdminPanel>
  );
}

/** Today, Yesterday, N days ago, then a date. A dash means the backend does not report sign-ins yet. */
function lastSeen(value: string | null | undefined) {
  if (value === undefined) return '—';
  if (!value) return 'Never';
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(value))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

/** "Office or department" picker, styled like AdminField: native select on web, choice sheet on phones. */
function OfficeSelect({ value, options, onChange, palette }: { value: string; options: string[]; onChange: (value: string) => void; palette: AdminPalette }) {
  const id = `lakad-office-${useId()}`;
  const [open, setOpen] = useState(false);
  const label = 'Office or department';
  const heading = <Text nativeID={`${id}-label`} style={[styles.selectLabel, { color: palette.text }]}>{label}<Text style={{ color: palette.red }}> *</Text></Text>;
  if (Platform.OS === 'web') {
    return <View style={styles.selectGroup}>
      {heading}
      <select aria-labelledby={`${id}-label`} id={id} onChange={event => onChange(event.currentTarget.value)} value={value}
        style={{ appearance: 'auto', background: palette.input, borderColor: palette.border, borderRadius: 9, borderStyle: 'solid', borderWidth: 1, color: value ? palette.text : palette.muted, fontSize: 16, minHeight: 46, padding: '0 12px', width: '100%' }}>
        <option disabled value="">Select an office</option>
        {options.map(office => <option key={office} value={office}>{office}</option>)}
      </select>
    </View>;
  }
  return <View style={styles.selectGroup}>
    {heading}
    <Pressable accessibilityLabel={`${label}: ${value || 'Select an office'}`} accessibilityRole="button" onPress={() => setOpen(true)}
      style={[styles.selectButton, { backgroundColor: palette.input, borderColor: palette.border }]}>
      <Text numberOfLines={1} style={[styles.selectText, { color: value ? palette.text : palette.muted }]}>{value || 'Select an office'}</Text>
      <Feather color={palette.muted} name="chevron-down" size={18} />
    </Pressable>
    <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
      <View style={styles.sheetBackdrop}>
        <Pressable accessibilityLabel="Close office choices" accessibilityRole="button" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { backgroundColor: palette.panel }]}>
          <Text accessibilityRole="header" style={[styles.dialogTitle, { color: palette.text }]}>{label}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(office => <Pressable key={office} accessibilityLabel={office} accessibilityRole="button" accessibilityState={{ selected: office === value }} onPress={() => { onChange(office); setOpen(false); }}
              style={[styles.sheetOption, { borderColor: palette.border }]}>
              <Text style={[styles.selectText, { color: palette.text, fontWeight: office === value ? '800' : '500' }]}>{office}</Text>
              {office === value ? <Feather color={palette.blue} name="check" size={18} /> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

function Notice({ message, palette, tone }: { message: string; palette: AdminPalette; tone: 'error' | 'success' }) {
  const color = tone === 'error' ? palette.red : palette.green;
  return <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: tone === 'error' ? palette.redSoft : palette.greenSoft, borderColor: color }]}><Feather color={color} name={tone === 'error' ? 'alert-circle' : 'check-circle'} size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  form: { gap: 16, padding: 24 },
  formHead: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  back: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  formTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginTop: 8, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', gap: 16 },
  gridCell: { flex: 1, minWidth: 0 },
  stack: { alignItems: 'stretch', flexDirection: 'column' },
  selectGroup: { gap: 6 },
  selectLabel: { fontSize: 12, fontWeight: '700' },
  selectButton: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 12 },
  selectText: { flex: 1, fontSize: 16 },
  sheetBackdrop: { backgroundColor: layout.scrim, flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 8, maxHeight: '75%', padding: 20 },
  sheetOption: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 52 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  roleCard: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexBasis: '45%', flexDirection: 'row', flexGrow: 1, gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  roleCardPhone: { flexBasis: '100%' },
  roleBody: { flex: 1, gap: 3 },
  roleName: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  roleTitle: { fontSize: 15, fontWeight: '800' },
  roleCardHint: { fontSize: 12.5 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  editBadge: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 4 },
  editBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  editBanner: { alignItems: 'flex-start', borderLeftWidth: 4, borderRadius: 10, flexDirection: 'row', gap: 10, padding: 12 },
  editBannerBody: { flex: 1, gap: 2 },
  editBannerTitle: { fontSize: 14.5, fontWeight: '800' },
  editBannerText: { fontSize: 13, lineHeight: 18 },
  currentTag: { borderRadius: 6, borderWidth: 1, fontSize: 10.5, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1, textTransform: 'uppercase' },
  permissions: { borderRadius: 12, borderWidth: 1, gap: 4, padding: 14 },
  permissionsTitle: { fontSize: 13.5, fontWeight: '800', marginBottom: 2 },
  permissionRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  permissionLine: { flex: 1, fontSize: 13 },
  filters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filtersPhone: { alignItems: 'stretch', flexDirection: 'column' },
  search: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 10, paddingHorizontal: 14, width: 320 },
  searchPhone: { width: '100%' },
  searchInput: { flex: 1, fontSize: 16, height: 46, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { borderRadius: 8, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  chipText: { fontSize: 16 },
  count: { fontSize: 16, marginLeft: 'auto' },
  table: { borderRadius: 12, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 28, paddingVertical: 10 },
  headRow: { borderBottomWidth: 1, minHeight: 54 },
  headText: { fontSize: 16 },
  centerText: { textAlign: 'center' },
  centerCell: { alignItems: 'center' },
  nameCell: { flex: 2.2, minWidth: 0 },
  roleCell: { flex: 1, minWidth: 110 },
  statusCell: { flex: 1, minWidth: 110 },
  seenCell: { flex: 1.1, minWidth: 120 },
  actionCell: { flex: 1.7, minWidth: 250 },
  name: { fontSize: 16 },
  email: { fontSize: 16 },
  seenText: { fontSize: 16 },
  pill: { alignItems: 'center', borderRadius: 999, justifyContent: 'center', minWidth: 92, paddingHorizontal: 12, paddingVertical: 2 },
  pillText: { color: '#111111', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 22 },
  link: { minHeight: 32, justifyContent: 'center' },
  linkText: { fontSize: 16 },
  selfNote: { fontSize: 13, fontStyle: 'italic' },
  card: { gap: 10, padding: 16 },
  cardPills: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardMeta: { fontSize: 13 },
  backdrop: { alignItems: 'center', backgroundColor: layout.scrim, flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { borderRadius: 18, borderWidth: 1, maxWidth: 440, padding: 26, width: '100%' },
  dialogTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  dialogText: { fontSize: 14.5, lineHeight: 22, marginTop: 8 },
  radio: { alignItems: 'center', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { borderRadius: 5, height: 10, width: 10 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 22 },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.97 }] },
  notice: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  noticeText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
});
