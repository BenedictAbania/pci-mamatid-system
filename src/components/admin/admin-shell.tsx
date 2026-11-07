import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { ComponentRef, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
} from 'react-native';

import { supabase } from '@/lib/data/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { canAccess, roleLabels } from '@/lib/auth/access';
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
              <View accessibilityLabel={`${name}, ${roleLabels[role]}`} style={styles.profile}>
                <View style={styles.profileAvatar}><Text style={styles.profileInitials}>{getInitials(name)}</Text></View>
                <View style={styles.profileCopy}>
                  <Text numberOfLines={1} style={styles.profileName}>{name}</Text>
                  <Text numberOfLines={1} style={styles.profileRole}>{roleLabels[role]}</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={({ hovered, pressed }: PressState) => [styles.signOut, hovered && styles.signOutHover, pressed && styles.navItemPressed]}>
                <Feather color="#D7E5FF" name="log-out" size={16} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      <View testID="lakad-main" style={styles.main}>
        <View testID="lakad-toolbar" style={[styles.header, isPhone && styles.headerPhone, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          {isCompact ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: menuOpen }} accessibilityLabel="Open navigation" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Feather color={palette.text} name="menu" size={22} />
          </Pressable> : null}
          <View style={[styles.titleBlock, !headerSearch && styles.titleBlockGrow]}>
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
          {isCompact && !menuOpen ? <View accessibilityLabel={`${name}, ${roleLabels[role]}`} style={styles.headerAvatar}><Text style={styles.profileInitials}>{getInitials(name)}</Text></View> : null}
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
  editable = true,
  keyboardType,
  label,
  multiline,
  onChangeText,
  palette,
  placeholder,
  required,
  value,
}: {
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  palette: AdminPalette;
  placeholder?: string;
  /** Shows a red asterisk after the label. */
  required?: boolean;
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
        editable={editable}
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
  search: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, maxWidth: 460, paddingHorizontal: 12 },
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
