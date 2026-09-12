import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { loadProfiles, ProfileRecord, updateProfileRole } from '@/lib/admin-data';
import { formatDate, titleCase } from '@/lib/admin-utils';
import { UserRole, useAuth } from '@/providers/AuthProvider';

const roles: UserRole[] = ['admin', 'reviewer', 'encoder', 'viewer'];

export default function UsersScreen() {
  const palette = useAdminPalette();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isPhone = width < 760;

  const refresh = useCallback(async () => {
    try {
      const userProfiles = await loadProfiles();
      setError('');
      setProfiles(userProfiles);
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

  const filtered = profiles.filter((profile) => `${profile.full_name} ${profile.role}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function changeRole(profile: ProfileRecord, role: UserRole) {
    if (profile.id === user?.id || profile.role === role) return;
    setSavingId(profile.id);
    setError('');
    try {
      await updateProfileRole(profile.id, role);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The user role could not be updated.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell loading={loading} onRefresh={() => void refresh()} onSearchChange={setQuery} searchValue={query} subtitle="Review authenticated profiles and assign system responsibilities." title="Users & Roles">
      {error ? <Notice message={error} palette={palette} tone="error" /> : null}
      <Notice message="Account creation and invitations require a protected server-side Auth Admin endpoint. This screen intentionally exposes only profile-role controls permitted by the current RLS policies." palette={palette} tone="info" />

      <View style={[styles.roleGrid, isPhone && styles.stack]}>
        {roles.map((role) => <View key={role} style={[styles.roleCard, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.roleIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={role === 'admin' ? 'shield' : role === 'reviewer' ? 'check-circle' : role === 'encoder' ? 'edit-3' : 'eye'} size={19} /></View><View><Text style={[styles.roleLabel, { color: palette.muted }]}>{titleCase(role)}</Text><Text style={[styles.roleCount, { color: palette.text }]}>{profiles.filter((profile) => profile.role === role).length}</Text></View></View>)}
      </View>

      <AdminPanel palette={palette} subtitle={`${filtered.length} matching profile${filtered.length === 1 ? '' : 's'}`} title="User directory">
        {filtered.length ? (
          <View>
            {!isPhone ? <View style={[styles.userRow, styles.headerRow, { backgroundColor: palette.panelAlt }]}><Text style={[styles.nameCell, styles.headerText, { color: palette.muted }]}>User</Text><Text style={[styles.dateCell, styles.headerText, { color: palette.muted }]}>Added</Text><Text style={[styles.rolesCell, styles.headerText, { color: palette.muted }]}>Assigned role</Text></View> : null}
            {filtered.map((profile) => {
              const isSelf = profile.id === user?.id;
              return <View key={profile.id} style={[styles.userRow, isPhone && styles.userRowPhone, { borderBottomColor: palette.border }]}><View style={styles.nameCell}><View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile.full_name)}</Text></View><View style={styles.identityCopy}><Text style={[styles.name, { color: palette.text }]}>{profile.full_name || 'Unnamed user'}{isSelf ? ' (You)' : ''}</Text><Text style={[styles.userId, { color: palette.muted }]}>{profile.id}</Text></View></View></View><Text style={[styles.dateCell, styles.date, { color: palette.muted }]}>{formatDate(profile.created_at)}</Text><View style={styles.rolesCell}>{roles.map((role) => <Pressable disabled={isSelf || savingId === profile.id} key={role} onPress={() => void changeRole(profile, role)} style={[styles.roleChip, { backgroundColor: profile.role === role ? palette.blue : palette.panel, borderColor: profile.role === role ? palette.blue : palette.border }, (isSelf || savingId === profile.id) && styles.disabled]}><Text style={{ color: profile.role === role ? '#FFFFFF' : palette.text, fontSize: 10.5, fontWeight: '700' }}>{titleCase(role)}</Text></Pressable>)}</View></View>;
            })}
          </View>
        ) : <AdminEmpty icon="users" message={query ? 'No profiles match your search.' : 'No authenticated profiles are available.'} palette={palette} />}
      </AdminPanel>
    </AdminShell>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function Notice({ message, palette, tone }: { message: string; palette: ReturnType<typeof useAdminPalette>; tone: 'error' | 'info' }) {
  const color = tone === 'error' ? palette.red : palette.blue;
  return <View style={[styles.notice, { backgroundColor: tone === 'error' ? palette.redSoft : palette.blueSoft, borderColor: color }]}><Feather color={color} name={tone === 'error' ? 'alert-circle' : 'info'} size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  roleGrid: { flexDirection: 'row', gap: 13 },
  stack: { flexDirection: 'column' },
  roleCard: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 10, minHeight: 86, padding: 14 },
  roleIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  roleLabel: { fontSize: 10.5 },
  roleCount: { fontSize: 21, fontWeight: '900', marginTop: 3 },
  userRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: 10, paddingVertical: 9 },
  userRowPhone: { alignItems: 'flex-start', flexDirection: 'column', gap: 10 },
  headerRow: { borderBottomWidth: 0, borderRadius: 8, minHeight: 35, paddingVertical: 0 },
  headerText: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase' },
  nameCell: { flex: 1.2, minWidth: 210 },
  dateCell: { flex: 0.6, minWidth: 105 },
  rolesCell: { flex: 1.8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, minWidth: 260 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  identityCopy: { flex: 1, minWidth: 0 },
  avatar: { alignItems: 'center', backgroundColor: '#2878F0', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  avatarText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  name: { fontSize: 12.5, fontWeight: '700' },
  userId: { fontSize: 9, marginTop: 3 },
  date: { fontSize: 11 },
  roleChip: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  disabled: { opacity: 0.62 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  noticeText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
});
