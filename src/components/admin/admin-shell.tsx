import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { canAccess, roleLabels } from '@/lib/access';

export type AdminPalette = ReturnType<typeof createPalette>;

const navigation = [
  { label: 'Overview & Reports', icon: 'pie-chart', route: '/workspace' },
  { label: 'Field & Review', icon: 'edit-3', route: '/field-inspections' },
  { label: 'Sample Planning', icon: 'layers', route: '/sampling' },
  { label: 'Dashboard', icon: 'grid', route: '/dashboard' },
  { label: 'Road / Section Inventory', icon: 'map', route: '/road-network' },
  { label: 'PCI Results', icon: 'trending-up', route: '/pci-results' },
  { label: 'Maintenance Plan', icon: 'tool', route: '/maintenance-plan' },
  { label: 'Users & Roles', icon: 'users', route: '/users' },
  { label: 'Reports', icon: 'file-text', route: '/reports' },
  { label: 'System Settings', icon: 'settings', route: '/settings' },
] as const;

function createPalette(isDark: boolean) {
  return {
    background: isDark ? '#071127' : '#F5F8FC',
    panel: isDark ? '#0D1B36' : '#FFFFFF',
    panelAlt: isDark ? '#10213F' : '#F8FAFD',
    input: isDark ? '#0A1730' : '#F8FAFD',
    text: isDark ? '#F4F7FF' : '#071A43',
    muted: isDark ? '#91A4C8' : '#4E668F',
    border: isDark ? '#21365C' : '#DCE5F2',
    blue: '#1769E8',
    blueSoft: isDark ? '#122D59' : '#EAF3FF',
    green: '#0A9B5B',
    greenSoft: isDark ? '#10392F' : '#EAF8F2',
    amber: '#E18A00',
    amberSoft: isDark ? '#3D2C11' : '#FFF6E7',
    red: '#D92D3E',
    redSoft: isDark ? '#40202A' : '#FFF0F2',
  };
}

export function useAdminPalette() {
  const { colorScheme } = useAppTheme();
  return useMemo(() => createPalette(colorScheme === 'dark'), [colorScheme]);
}

function getName(fullName?: string, email?: string) {
  return fullName?.trim() || email?.split('@')[0] || 'LAKAD User';
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LU';
}

function getNavigationLabel(route: string, fallback: string, role: 'admin' | 'reviewer' | 'encoder' | 'viewer') {
  if (route === '/field-inspections') {
    return role === 'reviewer' ? 'Inspection Review' : 'Field Inspections';
  }
  if (route === '/workspace') {
    return role === 'viewer' ? 'Approved Results' : 'Overview & Reports';
  }
  return fallback;
}

export function AdminShell({
  action,
  children,
  loading = false,
  onRefresh,
  onSearchChange,
  searchValue,
  subtitle,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  subtitle: string;
  title: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { profile, role, user } = useAuth();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const palette = useAdminPalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = width < 980;
  const isPhone = width < 650;
  const name = getName(profile?.full_name, user?.email);

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

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {showSidebar ? (
        <>
          {isCompact ? <Pressable onPress={() => setMenuOpen(false)} style={styles.scrim} /> : null}
          <View style={[styles.sidebar, isCompact && styles.sidebarOverlay]}>
            <View style={styles.brandRow}>
              <Image contentFit="contain" source={require('../../../assets/images/LAKAD.png')} style={styles.brandMark} />
              <View>
                <Text style={styles.brandName}>LAKAD</Text>
                <Text style={styles.brandTagline}>Where Data Meets the Road</Text>
              </View>
              {isCompact ? (
                <Pressable accessibilityLabel="Close navigation" onPress={() => setMenuOpen(false)} style={styles.closeButton}>
                  <Feather color="#FFFFFF" name="x" size={21} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.adminCard}>
              <Feather color="#C8DDFF" name="shield" size={18} />
              <View style={styles.adminCardCopy}>
                <Text numberOfLines={1} style={styles.adminName}>{name}</Text>
                <Text style={styles.adminRole}>{roleLabels[role]}</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.navList} showsVerticalScrollIndicator={false}>
              {navigation.filter(item => canAccess(role, item.route)).map((item) => {
                const active = pathname.startsWith(item.route);
                return (
                  <Pressable
                    key={item.route}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push(item.route as never);
                    }}
                    style={[styles.navItem, active && styles.navItemActive]}>
                    <Feather color={active ? '#FFFFFF' : '#C9D9F5'} name={item.icon} size={18} />
                    <Text style={active ? styles.navTextActive : styles.navText}>{getNavigationLabel(item.route, item.label, role)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sidebarVisual}>
              <Image contentFit="cover" source={require('../../../assets/images/lakad_hero_bg.jpg')} style={styles.absoluteFill} />
              <View style={styles.sidebarVisualOverlay} />
              <MaterialCommunityIcons color="#C7DCFF" name="road-variant" size={28} />
              <Text style={styles.sidebarMotto}>Smarter Roads{`\n`}Through Better Data</Text>
            </View>
            <Pressable onPress={() => void supabase.auth.signOut()} style={styles.signOut}>
              <Feather color="#D7E5FF" name="log-out" size={17} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View style={styles.main}>
        <View style={[styles.header, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Pressable accessibilityLabel="Open navigation" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Feather color={palette.text} name="menu" size={22} />
          </Pressable>
          {onSearchChange ? (
            <View style={[styles.search, { backgroundColor: palette.input, borderColor: palette.border }]}>
              <Feather color={palette.muted} name="search" size={16} />
              <TextInput
                onChangeText={onSearchChange}
                placeholder={`Search ${title.toLowerCase()}...`}
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
          ) : <View style={styles.headerSpacer} />}
          {onRefresh ? (
            <Pressable accessibilityLabel="Refresh data" onPress={onRefresh} style={[styles.roundButton, { borderColor: palette.border }]}>
              <Feather color={palette.text} name="refresh-cw" size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
            onPress={toggleColorScheme}
            style={[styles.roundButton, { borderColor: palette.border }]}>
            <Feather color={palette.text} name={colorScheme === 'dark' ? 'sun' : 'moon'} size={17} />
          </Pressable>
          {!isPhone ? (
            <View style={[styles.account, { borderLeftColor: palette.border }]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(name)}</Text></View>
              <View>
                <Text numberOfLines={1} style={[styles.accountName, { color: palette.text }]}>{name}</Text>
                <Text style={[styles.accountRole, { color: palette.muted }]}>{roleLabels[role]}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}>
          <View style={[styles.pageHeading, isPhone && styles.pageHeadingPhone]}>
            <View style={styles.pageHeadingCopy}>
              <Text style={[styles.eyebrow, { color: palette.blue }]}>{roleLabels[role]}</Text>
              <Text style={[styles.pageTitle, isPhone && styles.pageTitlePhone, { color: palette.text }]}>{title}</Text>
              <Text style={[styles.pageSubtitle, { color: palette.muted }]}>{subtitle}</Text>
            </View>
            {action}
          </View>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.blue} size="large" />
              <Text style={[styles.loadingText, { color: palette.muted }]}>Loading live data...</Text>
            </View>
          ) : children}
        </ScrollView>
      </View>
    </View>
  );
}

export function AdminPanel({
  children,
  palette,
  style,
  subtitle,
  title,
}: {
  children: ReactNode;
  palette: AdminPalette;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title?: string;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: palette.panel, borderColor: palette.border }, style]}>
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
    ? { background: palette.blue, border: palette.blue, text: '#FFFFFF' }
    : tone === 'danger'
      ? { background: palette.redSoft, border: palette.red, text: palette.red }
      : { background: palette.panel, border: palette.border, text: palette.text };
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? <Feather color={colors.text} name={icon} size={15} /> : null}
      <Text style={[styles.buttonText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function AdminField({
  keyboardType,
  label,
  multiline,
  onChangeText,
  palette,
  placeholder,
  value,
}: {
  keyboardType?: 'default' | 'numeric' | 'email-address';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  palette: AdminPalette;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text>
      <TextInput
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
  absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  screen: { flex: 1, flexDirection: 'row', minHeight: '100%' },
  main: { flex: 1, minWidth: 0 },
  scrim: { backgroundColor: 'rgba(2,10,28,0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  sidebar: { backgroundColor: '#071D43', paddingBottom: 14, width: 260 },
  sidebarOverlay: { bottom: 0, left: 0, position: 'absolute', top: 0, zIndex: 30 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 90, paddingHorizontal: 20 },
  brandMark: { height: 52, width: 52 },
  brandName: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 0.4 },
  brandTagline: { color: '#D4E3FA', fontSize: 8.2 },
  closeButton: { marginLeft: 'auto', padding: 5 },
  adminCard: { alignItems: 'center', backgroundColor: 'rgba(39,112,224,0.42)', borderColor: 'rgba(126,178,255,0.25)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 18, padding: 12 },
  adminCardCopy: { flex: 1 },
  adminName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  adminRole: { color: '#AFC6E9', fontSize: 10, marginTop: 2 },
  navList: { gap: 4, paddingHorizontal: 12, paddingTop: 17, paddingBottom: 180 },
  navItem: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 13, paddingHorizontal: 15, paddingVertical: 11 },
  navItemActive: { backgroundColor: '#1755A9' },
  navText: { color: '#C9D9F5', fontSize: 13 },
  navTextActive: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sidebarVisual: { alignItems: 'center', bottom: 54, height: 120, justifyContent: 'center', left: 0, overflow: 'hidden', position: 'absolute', right: 0 },
  sidebarVisualOverlay: { backgroundColor: 'rgba(5,28,65,0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sidebarMotto: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 5, textAlign: 'center' },
  signOut: { alignItems: 'center', bottom: 8, flexDirection: 'row', gap: 9, left: 20, padding: 9, position: 'absolute' },
  signOutText: { color: '#D7E5FF', fontSize: 13, fontWeight: '600' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, height: 66, paddingHorizontal: 20 },
  iconButton: { padding: 6 },
  search: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, maxWidth: 500, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13, height: 38 },
  headerSpacer: { flex: 1 },
  roundButton: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  account: { alignItems: 'center', borderLeftWidth: 1, flexDirection: 'row', gap: 9, marginLeft: 'auto', paddingLeft: 14 },
  avatar: { alignItems: 'center', backgroundColor: '#2878F0', borderRadius: 20, height: 38, justifyContent: 'center', width: 38 },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  accountName: { fontSize: 12, fontWeight: '700', maxWidth: 145 },
  accountRole: { fontSize: 9.5, marginTop: 2 },
  content: { gap: 17, padding: 24, paddingBottom: 44 },
  contentPhone: { padding: 14 },
  pageHeading: { alignItems: 'flex-end', flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 92 },
  pageHeadingPhone: { alignItems: 'flex-start', flexDirection: 'column' },
  pageHeadingCopy: { flex: 1 },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6 },
  pageTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  pageTitlePhone: { fontSize: 25 },
  pageSubtitle: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 420 },
  loadingText: { fontSize: 13, marginTop: 11 },
  panel: { borderRadius: 13, borderWidth: 1, padding: 18 },
  panelHeading: { marginBottom: 15 },
  panelTitle: { fontSize: 17, fontWeight: '800' },
  panelSubtitle: { fontSize: 12, marginTop: 3 },
  button: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 40, paddingHorizontal: 14 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  field: { borderRadius: 9, borderWidth: 1, fontSize: 13, minHeight: 42, paddingHorizontal: 12, paddingVertical: 10 },
  fieldMultiline: { minHeight: 88, textAlignVertical: 'top' },
  empty: { alignItems: 'center', justifyContent: 'center', minHeight: 210, padding: 24 },
  emptyIcon: { alignItems: 'center', borderRadius: 27, height: 54, justifyContent: 'center', marginBottom: 11, width: 54 },
  emptyText: { fontSize: 13, lineHeight: 20, maxWidth: 360, textAlign: 'center' },
  restrictedScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  restrictedCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, maxWidth: 430, padding: 32, width: '100%' },
  restrictedTitle: { fontSize: 21, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  restrictedText: { fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 7, textAlign: 'center' },
});
