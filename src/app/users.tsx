import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminEmpty, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { formatDate, titleCase } from '@/lib/admin-utils';
import { supabase } from '@/lib/supabase';
import { callWorkflow, ensureWorkflowReady } from '@/lib/workflow-data';
import { useAuth, UserRole } from '@/providers/AuthProvider';

const roles: UserRole[] = ['admin', 'reviewer', 'encoder', 'viewer'];

export interface LakadAccount {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function UsersScreen() {
  const palette = useAdminPalette();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [profiles, setProfiles] = useState<LakadAccount[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [pending, setPending] = useState<{ account: LakadAccount; role: UserRole; active: boolean } | null>(null);
  const isPhone = width < 760;

  const refresh = useCallback(async () => {
    try {
      await ensureWorkflowReady();
      const { data, error } = await supabase.rpc('lakad_accounts');
      if (error) throw new Error(error.message);
      setError('');
      setProfiles(data as LakadAccount[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'User profiles could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const filtered = profiles.filter((profile) =>
    `${profile.full_name || ''} ${profile.email || ''} ${profile.role}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function updateAccount(profileId: string, role: UserRole, active: boolean) {
    if (profileId === user?.id) return false;
    setSavingId(profileId);
    setError('');
    setMessage('');
    try {
      await callWorkflow('lakad_manage_account', { target: profileId, new_role: role, active });
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

  async function inviteAccount() {
    if (!inviteName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setError('Enter a full name and valid email address.');
      return;
    }
    setSavingId('invite');
    setError('');
    setMessage('');
    try {
      const { error: failure } = await supabase.functions.invoke('admin-invite', {
        body: { email: inviteEmail.trim(), full_name: inviteName.trim() },
      });
      if (failure) throw failure;
      setInviteEmail('');
      setInviteName('');
      setMessage('Invitation sent with the Field Inspector role.');
      await refresh();
    } catch {
      setError('Invitation failed. Verify that the protected admin-invite function has been deployed.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell loading={loading} onRefresh={refresh} onSearchChange={setQuery} searchValue={query} subtitle="Review authenticated profiles and assign system responsibilities." title="Users & Roles">
      {error ? <Notice message={error} palette={palette} tone="error" /> : null}
      {message ? <Notice message={message} palette={palette} tone="info" /> : null}
      <Notice message="Account changes use checked backend operations. Deactivation blocks database access while preserving inspection history." palette={palette} tone="info" />

      <AdminPanel palette={palette} subtitle="New accounts start as Field Inspector and can be reassigned after invitation." title="Invite user">
        <View style={[styles.inviteRow, isPhone && styles.stack]}>
          <View style={styles.inviteField}><AdminField label="Full name" onChangeText={setInviteName} palette={palette} value={inviteName} /></View>
          <View style={styles.inviteField}><AdminField keyboardType="email-address" label="Email address" onChangeText={setInviteEmail} palette={palette} value={inviteEmail} /></View>
          <AdminButton disabled={savingId !== null} icon="user-plus" label="Send invitation" onPress={() => void inviteAccount()} palette={palette} />
        </View>
      </AdminPanel>

      <View style={[styles.roleGrid, isPhone && styles.stack]}>
        {roles.map((role) => <View key={role} style={[styles.roleCard, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.roleIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={role === 'admin' ? 'shield' : role === 'reviewer' ? 'check-circle' : role === 'encoder' ? 'edit-3' : 'eye'} size={19} /></View><View><Text style={[styles.roleLabel, { color: palette.muted }]}>{titleCase(role)}</Text><Text style={[styles.roleCount, { color: palette.text }]}>{profiles.filter((profile) => profile.role === role).length}</Text></View></View>)}
      </View>

      <AdminPanel palette={palette} subtitle={`${filtered.length} matching account${filtered.length === 1 ? '' : 's'}`} title="User Directory">
        {filtered.length ? (
          <View>
            {!isPhone ? (
              <View style={[styles.userRow, styles.headerRow, { backgroundColor: palette.panelAlt }]}>
                <Text style={[styles.nameCell, styles.headerText, { color: palette.muted }]}>User</Text>
                <Text style={[styles.emailCell, styles.headerText, { color: palette.muted }]}>Email & Date</Text>
                <Text style={[styles.activeCell, styles.headerText, { color: palette.muted }]}>Active</Text>
                <Text style={[styles.rolesCell, styles.headerText, { color: palette.muted }]}>Assigned role</Text>
              </View>
            ) : null}

            {filtered.map((profile) => {
              const isSelf = profile.id === user?.id;
              const isSaving = savingId === profile.id;

              return (
                <View key={profile.id} style={[styles.userRow, isPhone && styles.userRowPhone, { borderBottomColor: palette.border }]}>
                  <View style={styles.nameCell}>
                    <View style={styles.identity}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile.full_name)}</Text></View>
                      <View style={styles.identityCopy}>
                        <Text style={[styles.name, { color: palette.text }]}>{profile.full_name || 'Unnamed user'}{isSelf ? ' (You)' : ''}</Text>
                        <Text style={[styles.userId, { color: palette.muted }]}>{profile.id}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.emailCell}>
                    <Text style={[styles.email, { color: palette.text }]}>{profile.email || 'No email'}</Text>
                    <Text style={[styles.dateCell, styles.date, { color: palette.muted }]}>{formatDate(profile.created_at)}</Text>
                  </View>

                  <View style={styles.activeCell}>
                    <Switch
                      disabled={isSelf || isSaving}
                      onValueChange={(active) => setPending({ account: profile, role: profile.role, active })}
                      value={profile.is_active}
                      trackColor={{ false: palette.border, true: palette.blue }}
                    />
                  </View>

                  <View style={styles.rolesCell}>
                    {roles.map((role) => (
                      <Pressable
                        disabled={isSelf || isSaving}
                        key={role}
                        onPress={() => setPending({ account: profile, role, active: profile.is_active })}
                        style={[styles.roleChip, { backgroundColor: profile.role === role ? palette.blue : palette.panel, borderColor: profile.role === role ? palette.blue : palette.border }, (isSelf || isSaving) && styles.disabled]}
                      >
                        <Text style={{ color: profile.role === role ? '#FFFFFF' : palette.text, fontSize: 10.5, fontWeight: '700' }}>{titleCase(role)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        ) : <AdminEmpty icon="users" message={query ? 'No profiles match your search.' : 'No authenticated profiles are available.'} palette={palette} />}
      </AdminPanel>
      {pending ? <AdminPanel palette={palette} title="Confirm account access change">
        <Text style={[styles.confirmText, { color: palette.text }]}>{pending.active ? 'Activate' : 'Deactivate'} {pending.account.full_name || pending.account.email}? Assign role: {titleCase(pending.role)}.</Text>
        <View style={styles.confirmActions}><AdminButton disabled={savingId !== null} label="Confirm change" onPress={() => void updateAccount(pending.account.id, pending.role, pending.active).then((saved) => { if (saved) setPending(null); })} palette={palette} /><AdminButton label="Cancel" onPress={() => setPending(null)} palette={palette} tone="secondary" /></View>
      </AdminPanel> : null}
    </AdminShell>
  );
}

function initials(name: string | null) {
  if (!name) return 'U';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function Notice({ message, palette, tone }: { message: string; palette: ReturnType<typeof useAdminPalette>; tone: 'error' | 'info' }) {
  const color = tone === 'error' ? palette.red : palette.blue;
  return <View style={[styles.notice, { backgroundColor: tone === 'error' ? palette.redSoft : palette.blueSoft, borderColor: color }]}><Feather color={color} name={tone === 'error' ? 'alert-circle' : 'info'} size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  roleGrid: { flexDirection: 'row', gap: 13, marginBottom: 16 },
  inviteRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 12 },
  inviteField: { flex: 1, minWidth: 180 },
  confirmText: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stack: { flexDirection: 'column' },
  roleCard: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 10, minHeight: 86, padding: 14 },
  roleIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  roleLabel: { fontSize: 10.5 },
  roleCount: { fontSize: 21, fontWeight: '900', marginTop: 3 },
  userRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: 10, paddingVertical: 9 },
  userRowPhone: { alignItems: 'flex-start', flexDirection: 'column', gap: 10 },
  headerRow: { borderBottomWidth: 0, borderRadius: 8, minHeight: 35, paddingVertical: 0 },
  headerText: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase' },
  nameCell: { flex: 1.2, minWidth: 200 },
  emailCell: { flex: 1.0, minWidth: 160 },
  activeCell: { flex: 0.5, minWidth: 60, alignItems: 'center' },
  dateCell: { marginTop: 2 },
  rolesCell: { flex: 1.8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, minWidth: 260 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  identityCopy: { flex: 1, minWidth: 0 },
  avatar: { alignItems: 'center', backgroundColor: '#2878F0', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  avatarText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  name: { fontSize: 12.5, fontWeight: '700' },
  userId: { fontSize: 9, marginTop: 3 },
  email: { fontSize: 12 },
  date: { fontSize: 11 },
  roleChip: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  disabled: { opacity: 0.62 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
});
