import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { usePathname, useRouter } from 'expo-router';
import { ComponentRef, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  Platform,
  useWindowDimensions,
  View,
  ViewStyle,
  type ViewProps,
} from 'react-native';

import { supabase } from '@/lib/data/supabase';
import { changeOwnPassword, PASSWORD_MIN_LENGTH, profilePhotoUrl, saveOwnProfile } from '@/lib/data/profile-data';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { canAccess, ROLE_ORDER, roleColors, roleHints, roleLabels } from '@/lib/auth/access';
import { brand, createPalette, layout } from '@/lib/ui/design-system';
import { accountDisplayName } from '@/lib/auth/account-display';
import { navigationForRole, navigationRoute } from '@/lib/auth/navigation';

const logo = require('../../../assets/images/LAKAD.png');
/** React Native Web reports hover in Pressable state; native leaves it undefined. */
type PressState = { pressed: boolean; hovered?: boolean };

export type AdminPalette = ReturnType<typeof createPalette>;

export function useAdminPalette() {
  const { colorScheme } = useAppTheme();
  return useMemo(() => createPalette(colorScheme === 'dark'), [colorScheme]);
}

function getName(fullName?: string, email?: string) {
  return accountDisplayName(fullName, email);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LU';
}

export function AdminShell({
  action,
  children,
  loading = false,
  onRefresh,
  onSearchChange,
  searchValue,
  searchLabel,
  subtitle,
  title,
  dashboard = false,
}: {
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  searchLabel?: string;
  subtitle: string;
  title: string;
  dashboard?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { profile, role, user } = useAuth();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const palette = useAdminPalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hasShownPage, setHasShownPage] = useState(!loading);
  const sidebarRef = useRef<ComponentRef<typeof View>>(null);
  const isCompact = width < layout.compact;
  const isPhone = width < layout.phone;
  const name = getName(profile?.full_name, user?.email);
  useEffect(() => {
    // The first successful render unlocks in-place updates for this shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!loading) setHasShownPage(true);
  }, [loading]);
  useEffect(() => {
    if (Platform.OS !== 'web' || document.getElementById('lakad-print-styles')) return;
    const style = document.createElement('style');
    style.id = 'lakad-print-styles';
    style.textContent = `@media print {
      @page { margin: 15mm; }
      [data-testid="lakad-print-heading"] { display: block !important; margin-bottom: 16px; }
      html, body, #root { height: auto !important; overflow: visible !important; }
      [data-testid="lakad-navigation"], [data-testid="lakad-toolbar"], [data-testid="lakad-action"], [data-testid="lakad-tabs"], [data-testid="lakad-search"],
      [data-testid="lakad-report-register-with-selection"] { display: none !important; }
      [data-testid="lakad-main"], [data-testid="lakad-content"] { height: auto !important; overflow: visible !important; display: block !important; }
      [data-testid="lakad-content"] * { color: ${brand.ink} !important; background-color: white !important; box-shadow: none !important; }
      [data-testid="lakad-content"] { padding: 0 !important; }
    }`;
    document.head.appendChild(style);
  }, []);
  useEffect(() => {
    if (!menuOpen || !isCompact || Platform.OS !== 'web') return;
    const node = sidebarRef.current as unknown as HTMLElement | null;
    if (!node?.querySelectorAll) return;
    const before = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>('[tabindex="0"],button,a[href],input'));
    controls()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); before?.focus(); };
  }, [menuOpen, isCompact]);

  if (!role || !canAccess(role, pathname)) {
    return (
      <View style={[styles.restrictedScreen, { backgroundColor: palette.background }]}>
        <View style={[styles.restrictedCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Feather color={palette.red} name="shield" size={34} />
          <Text style={[styles.restrictedTitle, { color: palette.text }]}>Access denied</Text>
          <Text style={[styles.restrictedText, { color: palette.muted }]}>Your signed-in role cannot access this workspace.</Text>
          <AdminButton label="Sign out" onPress={() => void supabase.auth.signOut()} palette={palette} />
        </View>
      </View>
    );
  }

  const showSidebar = !isCompact || menuOpen;
  const searchField = onSearchChange ? (
    <View testID="lakad-search" style={[styles.search, { backgroundColor: palette.input, borderColor: palette.border }]}>
      <Feather color={palette.muted} name="search" size={16} />
      <TextInput
        accessibilityLabel={searchLabel ?? `Search ${title.toLowerCase()} on this page`}
        onChangeText={onSearchChange}
        placeholder={searchLabel ?? `Search ${title.toLowerCase()} on this page`}
        placeholderTextColor={palette.muted}
        style={[styles.searchInput, { color: palette.text }]}
        value={searchValue}
      />
      {searchValue ? (
        <Pressable accessibilityLabel="Clear search" onPress={() => onSearchChange('')}>
          <Feather color={palette.muted} name="x" size={16} />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const headerSearch = !isPhone ? searchField : null;
  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {showSidebar ? (
        <>
          {isCompact ? <Pressable accessibilityLabel="Dismiss navigation" accessibilityRole="button" onPress={() => setMenuOpen(false)} style={styles.scrim} /> : null}
          <View testID="lakad-navigation" accessibilityLabel="Main navigation" ref={sidebarRef} accessibilityViewIsModal={isCompact} style={[styles.sidebar, isCompact && styles.sidebarOverlay]}>
            <View style={styles.brandRow}>
              <Image source={logo} resizeMode="contain" accessibilityLabel="LAKAD logo" style={styles.brandLogo} />
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>LAKAD</Text>
                <Text style={styles.brandTagline}>Where Data Meets the Road</Text>
              </View>
              {isCompact ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setMenuOpen(false)} style={styles.closeButton}>
                  <Feather color="#FFFFFF" name="x" size={21} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView style={styles.navScroll} contentContainerStyle={styles.navList} showsVerticalScrollIndicator={false}>
              {navigationForRole(role).map((item) => {
                const active = navigationRoute(role, pathname) === item.route;
                return (
                  <Pressable
                    key={item.route}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setMenuOpen(false);
                      if (!active) router.navigate(item.route as never);
                    }}
                    style={({ pressed, hovered }: PressState) => [styles.navItem, !active && hovered && styles.navItemHover, active && styles.navItemActive, pressed && styles.navItemPressed]}>
                    <Feather color={active ? '#FFFFFF' : '#9FB3E6'} name={item.icon} size={17} />
                    <Text style={active ? styles.navTextActive : styles.navText}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Signed-in account and sign out live at the foot of the sidebar. */}
            <View style={styles.sidebarFooter}>
              <Pressable
                accessibilityHint="Opens My Profile"
                accessibilityLabel={`${name}, ${roleLabels[role]}`}
                accessibilityRole="button"
                onPress={() => { setMenuOpen(false); setProfileOpen(true); }}
                style={({ hovered, pressed }: PressState) => [styles.profile, hovered && styles.profileHover, pressed && styles.navItemPressed]}>
                <ProfileAvatar name={name} path={profile?.avatar_path} size={42} />
                <View style={styles.profileCopy}>
                  <Text numberOfLines={1} style={styles.profileName}>{name}</Text>
                  <Text numberOfLines={1} style={styles.profileRole}>{roleLabels[role]}</Text>
                </View>
                <Feather color="#9FB3E6" name="edit-2" size={14} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={({ hovered, pressed }: PressState) => [styles.signOut, hovered && styles.signOutHover, pressed && styles.navItemPressed]}>
                <Feather color="#D7E5FF" name="log-out" size={16} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {profileOpen ? <ProfileDialog onClose={() => setProfileOpen(false)} palette={palette} /> : null}
      <View testID="lakad-main" style={styles.main}>
        <View testID="lakad-toolbar" style={[styles.header, isPhone && styles.headerPhone, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          {isCompact ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: menuOpen }} accessibilityLabel="Open navigation" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Feather color={palette.text} name="menu" size={22} />
          </Pressable> : null}
          {/* Title always grows so search, refresh and theme sit together at the right. */}
          <View style={[styles.titleBlock, styles.titleBlockGrow]}>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.pageTitle, isPhone && styles.pageTitlePhone, { color: palette.text }]}>{title}</Text>
            {!isPhone && subtitle ? <Text numberOfLines={1} style={[styles.pageSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
          </View>
          {headerSearch}
          {action && !isPhone ? <View style={styles.headerAction}>{action}</View> : null}
          {onRefresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh data" onPress={onRefresh} style={({ hovered, pressed }: PressState) => [styles.roundButton, { backgroundColor: hovered ? palette.blueSoft : palette.panel, borderColor: hovered ? palette.blue : palette.border }, pressed && styles.pressedScale]}>
              <Feather color={palette.text} name="refresh-cw" size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
            onPress={toggleColorScheme}
            style={({ hovered, pressed }: PressState) => [styles.roundButton, { backgroundColor: hovered ? palette.blueSoft : palette.panel, borderColor: hovered ? palette.blue : palette.border }, pressed && styles.pressedScale]}>
            <Feather color={colorScheme === 'dark' ? '#FFD66B' : palette.text} name={colorScheme === 'dark' ? 'sun' : 'moon'} size={17} />
          </Pressable>
          {/* Tablets and phones hide the sidebar, so the signed-in account shows here until the drawer opens. */}
          {isCompact && !menuOpen ? (
            <Pressable accessibilityHint="Opens My Profile" accessibilityLabel={`${name}, ${roleLabels[role]}`} accessibilityRole="button" onPress={() => setProfileOpen(true)} style={({ pressed }: PressState) => [pressed && styles.pressedScale]}>
              <ProfileAvatar name={name} path={profile?.avatar_path} size={42} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView testID="lakad-content" contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}>
          {dashboard && !isPhone && <View testID="lakad-print-heading" style={styles.printHeading}><Text style={[styles.pageTitle, { color: palette.text }]}>{title}</Text></View>}
          {isPhone && (subtitle || action) ? <View style={styles.phoneIntro}>
            {subtitle ? <Text style={[styles.pageSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
            {action}
          </View> : null}
          {isPhone && searchField ? <View style={styles.phoneSearchRow}>{searchField}</View> : null}
          {loading && !hasShownPage ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.blue} size="large" />
              <Text style={[styles.loadingText, { color: palette.muted }]}>Loading live data...</Text>
            </View>
          ) : <>
            {loading && <View accessibilityLiveRegion="polite" style={styles.refreshing}>
              <ActivityIndicator color={palette.blue} size="small" />
              <Text style={[styles.loadingText, { color: palette.muted }]}>Updating this page…</Text>
            </View>}
            {children}
          </>}
        </ScrollView>
      </View>
    </View>
  );
}

/** Message of a thrown error, also when it comes from another JavaScript realm. */
function messageOf(reason: unknown, fallback: string) {
  const message = (reason as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** Profile photo when one is saved (or chosen), otherwise the person's initials. */
export function ProfileAvatar({ name, path, preview, size }: { name: string; path?: string | null; preview?: string | null; size: number }) {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path || preview) return;
    let live = true;
    profilePhotoUrl(path).then((url) => { if (live) setLoaded({ path, url }); }, () => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [path, preview]);
  const source = preview ?? (loaded && loaded.path === path ? loaded.url : null);
  const round = { borderRadius: size / 2, height: size, width: size };
  return (
    <View style={[styles.profileAvatar, round]}>
      {source
        ? <Image accessibilityIgnoresInvertColors accessibilityLabel={`Profile photo of ${name}`} source={{ uri: source }} style={round} />
        : <Text style={[styles.profileInitials, size >= 64 && styles.profileInitialsLarge]}>{getInitials(name)}</Text>}
    </View>
  );
}

/** My Profile: the signed-in person edits their own name, office, job title, photo and password. Same layout as Edit User. */
function ProfileDialog({ onClose, palette }: { onClose: () => void; palette: AdminPalette }) {
  const { profile, refreshProfile, role, user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [office, setOffice] = useState(profile?.office ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '');
  const [photo, setPhoto] = useState<{ uri: string } | 'remove' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; text: string } | null>(null);
  const currentPath = profile?.avatar_path ?? null;
  const shownPath = photo === 'remove' ? null : currentPath;
  const hasPhoto = photo ? photo !== 'remove' : !!currentPath;
  const name = getName(fullName.trim() || profile?.full_name, user?.email);

  async function choosePhoto() {
    setError('');
    try {
      // Imported up front: an on-demand import() of the picker failed in the web build.
      const picked = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 });
      if (picked.canceled) return;
      // Large originals are fine: the photo is compressed before upload.
      setPhoto({ uri: picked.assets[0].uri });
    } catch (reason) {
      setError(messageOf(reason, 'The photo picker is unavailable on this device.'));
    }
  }

  async function save() {
    if (!user) return;
    if (!fullName.trim()) { setError('Enter your full name.'); return; }
    setSaving(true);
    setError('');
    try {
      await saveOwnProfile({ userId: user.id, fullName, office, jobTitle, currentPath, photo });
      await refreshProfile();
      onClose();
    } catch (reason) {
      setError(messageOf(reason, 'Your profile could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    const problem = !currentPassword || !newPassword || !confirmPassword ? 'Fill in all three password fields.'
      : newPassword.length < PASSWORD_MIN_LENGTH ? `Use at least ${PASSWORD_MIN_LENGTH} characters for the new password.`
      : newPassword !== confirmPassword ? 'The new passwords do not match.'
      : newPassword === currentPassword ? 'Choose a new password that is different from your current one.' : '';
    if (problem) { setPasswordResult({ ok: false, text: problem }); return; }
    if (!user?.email) { setPasswordResult({ ok: false, text: 'Your account has no email address to confirm the current password.' }); return; }
    setPasswordBusy(true);
    setPasswordResult(null);
    try {
      await changeOwnPassword(user.email, currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordResult({ ok: true, text: 'Password changed. Use the new password the next time you sign in.' });
    } catch (reason) {
      setPasswordResult({ ok: false, text: messageOf(reason, 'Your password could not be changed.') });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.dialogBackdrop}>
        <View accessibilityLabel="My Profile" accessibilityViewIsModal style={[styles.dialogCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <ScrollView contentContainerStyle={[styles.dialogBody, wide && styles.dialogBodyWide]}>
            <View style={styles.dialogHead}>
              <Pressable accessibilityLabel="Close My Profile" accessibilityRole="button" hitSlop={10} onPress={onClose} style={({ pressed }: PressState) => [styles.dialogBack, pressed && styles.pressedScale]}>
                <Feather color={palette.text} name="arrow-left" size={22} />
              </Pressable>
              <Text accessibilityRole="header" style={[styles.dialogTitle, { color: palette.text }]}>My Profile</Text>
            </View>
            <Text style={[styles.dialogLead, { color: palette.text }]}>Update your own details. Your email and role are managed by the system administrator.</Text>

            <View style={styles.dialogPhotoRow}>
              <ProfileAvatar name={name} path={shownPath} preview={photo && photo !== 'remove' ? photo.uri : null} size={88} />
              <View style={styles.dialogPhotoActions}>
                <View style={styles.dialogPhotoButtons}>
                  <AdminButton disabled={saving} icon="camera" label={hasPhoto ? 'Change photo' : 'Add photo'} onPress={() => void choosePhoto()} palette={palette} tone="secondary" />
                  {hasPhoto ? <AdminButton disabled={saving} icon="trash-2" label="Remove photo" onPress={() => setPhoto(currentPath ? 'remove' : null)} palette={palette} tone="secondary" /> : null}
                </View>
                <Text style={[styles.dialogHint, { color: palette.muted }]}>JPEG, PNG or WebP. Photos are resized and compressed before upload.</Text>
              </View>
            </View>

            <Text style={[styles.dialogSectionLabel, { color: palette.muted }]}>Person</Text>
            <View style={[styles.dialogGrid, !wide && styles.dialogGridStack]}>
              <View style={styles.dialogCell}><AdminField label="Full name" onChangeText={setFullName} palette={palette} placeholder="First name and last name" required value={fullName} /></View>
              <View style={styles.dialogCell}><AdminField editable={false} label="Email" onChangeText={() => {}} palette={palette} value={user?.email ?? ''} /></View>
            </View>
            <View style={[styles.dialogGrid, !wide && styles.dialogGridStack]}>
              <View style={styles.dialogCell}><AdminField label="Office or department" onChangeText={setOffice} palette={palette} placeholder="Example, City Engineering Office" value={office} /></View>
              <View style={styles.dialogCell}><AdminField label="Position or job title" onChangeText={setJobTitle} palette={palette} placeholder="Example, Civil Engineer" value={jobTitle} /></View>
            </View>
            {error ? <Text accessibilityLiveRegion="polite" role="alert" style={[styles.dialogError, { color: palette.red }]}>{error}</Text> : null}

            <Text style={[styles.dialogSectionLabel, { color: palette.muted }]}>Role</Text>
            <View accessibilityLabel={`Role: ${role ? roleLabels[role] : 'none'}`} accessibilityRole="radiogroup" style={styles.dialogRoleGrid}>
              {ROLE_ORDER.map((item) => {
                const selected = item === role;
                return (
                  <View key={item} accessibilityLabel={`${roleLabels[item]}: ${roleHints[item]}`} accessibilityRole="radio" aria-checked={selected} aria-disabled
                    style={[styles.dialogRoleCard, !wide && styles.dialogRoleCardStack, { borderColor: selected ? palette.blue : palette.border, backgroundColor: selected ? palette.blueSoft : palette.input }, !selected && styles.dialogRoleOther]}>
                    <View style={[styles.dialogRadio, { borderColor: selected ? palette.blue : palette.muted }]}>{selected ? <View style={[styles.dialogRadioDot, { backgroundColor: palette.blue }]} /> : null}</View>
                    <View style={styles.dialogRoleBody}>
                      <View style={styles.dialogRoleName}>
                        <View style={[styles.dialogRoleDot, { backgroundColor: roleColors[item] }]} />
                        <Text style={[styles.dialogRoleTitle, { color: palette.text }]}>{roleLabels[item]}</Text>
                      </View>
                      <Text style={[styles.dialogRoleHint, { color: palette.muted }]}>{roleHints[item]}.</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.dialogHint, { color: palette.muted }]}>Only an administrator can change your role.</Text>

            <Text style={[styles.dialogSectionLabel, { color: palette.muted }]}>Change password</Text>
            <View style={[styles.dialogGrid, !wide && styles.dialogGridStack]}>
              <View style={styles.dialogCell}><AdminField autoComplete="current-password" label="Current password" onChangeText={setCurrentPassword} palette={palette} secureTextEntry value={currentPassword} /></View>
              {wide ? <View style={styles.dialogCell} /> : null}
            </View>
            <View style={[styles.dialogGrid, !wide && styles.dialogGridStack]}>
              <View style={styles.dialogCell}><AdminField autoComplete="new-password" label="New password" onChangeText={setNewPassword} palette={palette} placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`} secureTextEntry value={newPassword} /></View>
              <View style={styles.dialogCell}><AdminField autoComplete="new-password" label="Confirm new password" onChangeText={setConfirmPassword} palette={palette} placeholder="Type it again" secureTextEntry value={confirmPassword} /></View>
            </View>
            {passwordResult ? <Text accessibilityLiveRegion="polite" role={passwordResult.ok ? 'status' : 'alert'} style={[styles.dialogError, { color: passwordResult.ok ? palette.green : palette.red }]}>{passwordResult.text}</Text> : null}
            <View style={styles.dialogInlineAction}>
              <AdminButton disabled={passwordBusy || saving} icon="lock" label={passwordBusy ? 'Changing...' : 'Change password'} onPress={() => void changePassword()} palette={palette} tone="secondary" />
            </View>
          </ScrollView>
          <View style={[styles.dialogActions, { borderTopColor: palette.border }]}>
            <AdminButton disabled={saving} label="Cancel" onPress={onClose} palette={palette} tone="secondary" />
            <AdminButton disabled={saving} icon="check" label={saving ? 'Saving...' : 'Save changes'} onPress={() => void save()} palette={palette} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AdminPanel({
  children,
  onLayout,
  palette,
  style,
  subtitle,
  title,
}: {
  children: ReactNode;
  onLayout?: ViewProps['onLayout'];
  palette: AdminPalette;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title?: string;
}) {
  return (
    <View onLayout={onLayout} style={[styles.panel, { backgroundColor: palette.panel, borderColor: palette.border }, style]}>
      {title ? (
        <View style={styles.panelHeading}>
          <Text style={[styles.panelTitle, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.panelSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function AdminButton({
  disabled,
  icon,
  label,
  onPress,
  palette,
  tone = 'primary',
}: {
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  palette: AdminPalette;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  const colors = tone === 'primary'
    ? { background: palette.action ?? palette.blue, hover: brand.deep, border: palette.action ?? palette.blue, text: '#FFFFFF' }
    : tone === 'danger'
      ? { background: palette.redSoft, hover: palette.redSoft, border: palette.red, text: palette.red }
      : { background: palette.panel, hover: palette.blueSoft, border: palette.blue, text: palette.blue };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="lakad-action"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.button,
        { backgroundColor: hovered && !disabled ? colors.hover : colors.background, borderColor: hovered && !disabled && tone === 'primary' ? brand.deep : colors.border },
        hovered && !pressed && !disabled && (tone === 'primary' ? styles.buttonLiftPrimary : styles.buttonLift),
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? <Feather color={colors.text} name={icon} size={15} /> : null}
      <Text style={[styles.buttonText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function AdminField({
  autoComplete,
  editable = true,
  keyboardType,
  label,
  multiline,
  onChangeText,
  palette,
  placeholder,
  required,
  secureTextEntry,
  value,
}: {
  autoComplete?: 'current-password' | 'new-password' | 'email' | 'name' | 'off';
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  palette: AdminPalette;
  placeholder?: string;
  /** Shows a red asterisk after the label. */
  required?: boolean;
  /** Hides the typed text, for passwords. */
  secureTextEntry?: boolean;
  value: string;
}) {
  const labelId = `lakad-field-label-${useId()}`;
  return (
    <View style={styles.fieldGroup}>
      <Text nativeID={labelId} style={[styles.fieldLabel, { color: palette.text }]}>{label}{required ? <Text style={{ color: palette.red }}> *</Text> : null}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={Platform.OS === 'android' ? labelId : undefined}
        aria-labelledby={Platform.OS === 'web' ? labelId : undefined}
        autoCapitalize={secureTextEntry ? 'none' : undefined}
        autoComplete={autoComplete}
        editable={editable}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          { backgroundColor: palette.input, borderColor: palette.border, color: palette.text },
        ]}
        value={value}
      />
    </View>
  );
}

export function AdminEmpty({ icon, message, palette }: { icon: keyof typeof Feather.glyphMap; message: string; palette: AdminPalette }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.blueSoft }]}>
        <Feather color={palette.blue} name={icon} size={24} />
      </View>
      <Text style={[styles.emptyText, { color: palette.muted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  printHeading: { display: 'none' },
  screen: { flex: 1, flexDirection: 'row', minHeight: '100%' },
  main: { flex: 1, minWidth: 0 },
  scrim: { backgroundColor: layout.scrim, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  sidebar: { backgroundColor: layout.navy.sidebar, borderRightWidth: 1, borderRightColor: 'rgba(78, 139, 254, 0.14)', overflow: 'hidden', width: layout.sidebar },
  sidebarOverlay: { bottom: 0, left: 0, position: 'absolute', top: 0, zIndex: 30 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 104, paddingHorizontal: 20 },
  brandLogo: { height: 50, width: 46 },
  brandCopy: { flexShrink: 1 },
  brandName: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 0.6, lineHeight: 31 },
  brandTagline: { color: '#B9C9F2', fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  closeButton: { marginLeft: 'auto', padding: 5 },
  navScroll: { flex: 1 },
  navList: { gap: 4, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16 },
  navItem: { alignItems: 'center', borderRadius: layout.radius.control, flexDirection: 'row', gap: 12, minHeight: 46, paddingHorizontal: 14, paddingVertical: 11 },
  navItemHover: { backgroundColor: 'rgba(78, 139, 254, 0.12)' },
  navItemActive: { backgroundColor: 'rgba(78, 139, 254, 0.22)', borderColor: 'rgba(125, 168, 255, 0.35)', borderWidth: 1 },
  navItemPressed: { transform: [{ scale: 0.98 }] },
  navText: { color: '#DCE6FF', fontSize: 14.5, fontWeight: '500' },
  navTextActive: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  sidebarFooter: { borderTopColor: 'rgba(185, 201, 242, 0.16)', borderTopWidth: 1, gap: 6, marginHorizontal: 14, paddingBottom: 14, paddingTop: 16 },
  profile: { alignItems: 'center', flexDirection: 'row', gap: 11, paddingHorizontal: 6, paddingBottom: 6 },
  profileAvatar: { alignItems: 'center', backgroundColor: layout.navy.active, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 21, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  profileInitials: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  profileInitialsLarge: { fontSize: 28 },
  profileHover: { backgroundColor: 'rgba(255,255,255,0.08)' },
  dialogBackdrop: { alignItems: 'center', backgroundColor: layout.scrim, flex: 1, justifyContent: 'center', padding: 18 },
  dialogCard: { borderRadius: 22, borderWidth: 1, maxHeight: '94%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  dialogTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  dialogBody: { gap: 14, padding: 20 },
  dialogBodyWide: { paddingHorizontal: 28, paddingTop: 26 },
  dialogHead: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  dialogBack: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  dialogLead: { fontSize: 14.5, lineHeight: 20, marginTop: -6 },
  dialogPhotoRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 4 },
  dialogPhotoActions: { flexGrow: 1, flexShrink: 1, gap: 8, minWidth: 200 },
  dialogPhotoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dialogSectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginTop: 10, textTransform: 'uppercase' },
  dialogGrid: { flexDirection: 'row', gap: 16 },
  dialogGridStack: { flexDirection: 'column', gap: 14 },
  dialogCell: { flex: 1, minWidth: 0 },
  dialogRoleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dialogRoleCard: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexBasis: '45%', flexDirection: 'row', flexGrow: 1, gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  dialogRoleCardStack: { flexBasis: '100%' },
  dialogRoleOther: { opacity: 0.6 },
  dialogRoleBody: { flex: 1, gap: 3 },
  dialogRoleName: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  dialogRoleDot: { borderRadius: 4, height: 7, width: 7 },
  dialogRoleTitle: { fontSize: 15, fontWeight: '800' },
  dialogRoleHint: { fontSize: 12.5 },
  dialogRadio: { alignItems: 'center', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  dialogRadioDot: { borderRadius: 5, height: 10, width: 10 },
  dialogHint: { fontSize: 12, lineHeight: 17 },
  dialogError: { fontSize: 13, fontWeight: '600' },
  dialogInlineAction: { alignItems: 'flex-start' },
  dialogActions: { borderTopWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'flex-end', padding: 16 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  profileRole: { color: '#B9C9F2', fontSize: 12, marginTop: 2 },
  signOut: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 10, minHeight: 40, paddingHorizontal: 10 },
  signOutHover: { backgroundColor: 'rgba(78, 139, 254, 0.12)' },
  signOutText: { color: '#D7E5FF', fontSize: 13.5, fontWeight: '600' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, height: 74, paddingHorizontal: 24 },
  headerPhone: { gap: 6, height: 62, paddingHorizontal: 12 },
  titleBlock: { flexShrink: 1, minWidth: 0, marginRight: 8 },
  titleBlockGrow: { flex: 1 },
  headerAction: { marginRight: 4 },
  headerAvatar: { alignItems: 'center', backgroundColor: layout.navy.active, borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  phoneIntro: { gap: 12 },
  iconButton: { padding: 10, minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  search: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', flexShrink: 1, gap: 8, paddingHorizontal: 12, width: 460 },
  phoneSearchRow: { flexDirection: 'row' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, height: 44 },
  roundButton: { alignItems: 'center', borderRadius: 24, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  content: { gap: 17, padding: 24, paddingBottom: 44 },
  contentPhone: { padding: 14 },
  pageTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
  pageTitlePhone: { fontSize: 19 },
  pageSubtitle: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 420 },
  refreshing: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  loadingText: { fontSize: 13, marginTop: 11 },
  panel: { ...layout.shadow, borderRadius: layout.radius.card, borderWidth: 1, padding: layout.spacing.md },
  panelHeading: { marginBottom: 15 },
  panelTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  panelSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  button: { alignItems: 'center', borderRadius: layout.radius.control, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  buttonText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.1 },
  buttonLift: { transform: [{ translateY: -1 }] },
  buttonLiftPrimary: { boxShadow: '0px 8px 18px rgba(24, 80, 224, 0.28)', transform: [{ translateY: -1 }] },
  pressedScale: { transform: [{ scale: 0.96 }] },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  field: { borderRadius: 9, borderWidth: 1, fontSize: 16, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 },
  fieldMultiline: { minHeight: 88, textAlignVertical: 'top' },
  empty: { alignItems: 'center', justifyContent: 'center', minHeight: 210, padding: 24 },
  emptyIcon: { alignItems: 'center', borderRadius: 27, height: 54, justifyContent: 'center', marginBottom: 11, width: 54 },
  emptyText: { fontSize: 13, lineHeight: 20, maxWidth: 360, textAlign: 'center' },
  restrictedScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  restrictedCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, maxWidth: 430, padding: 32, width: '100%' },
  restrictedTitle: { fontSize: 21, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  restrictedText: { fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 7, textAlign: 'center' },
});
