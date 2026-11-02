import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { ComponentRef, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { canAccess, roleLabels } from '@/lib/access';
import { createPalette, layout } from '@/lib/design-system';
import { accountDisplayName } from '@/lib/account-display';
import { navigationForRole, navigationRoute } from '@/lib/navigation';

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
      [data-testid="lakad-content"] * { color: #183249 !important; background-color: white !important; box-shadow: none !important; }
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

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {showSidebar ? (
        <>
          {isCompact ? <Pressable accessibilityLabel="Dismiss navigation" accessibilityRole="button" onPress={() => setMenuOpen(false)} style={styles.scrim} /> : null}
          <View testID="lakad-navigation" accessibilityLabel="Main navigation" ref={sidebarRef} accessibilityViewIsModal={isCompact} style={[styles.sidebar, isCompact && styles.sidebarOverlay]}>
            <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.absoluteFill, { pointerEvents: 'none' }]}>
              {Array.from({ length: 5 }, (_, index) => <View key={index} style={[styles.contour, { borderColor: '#B6C6D2', opacity: 0.08, width: 350 + index * 45, height: 400 + index * 50, top: 180 + index * 10, left: -240 }]} />)}
            </View>
            <View style={styles.brandRow}>
              <MaterialCommunityIcons color="#FFFFFF" name="road-variant" size={44} />
              <View>
                <Text style={styles.brandName}>LAKAD</Text>
                <Text style={styles.brandTagline}>Where Data Meets the Road</Text>
              </View>
              {isCompact ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setMenuOpen(false)} style={styles.closeButton}>
                  <Feather color="#FFFFFF" name="x" size={21} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={styles.navList} showsVerticalScrollIndicator={false}>
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
                    style={[styles.navItem, active && styles.navItemActive]}>
                    <Feather color={active ? '#FFFFFF' : '#C9D9F5'} name={item.icon} size={18} />
                    <Text style={active ? styles.navTextActive : styles.navText}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sidebarVisual}>
              <MaterialCommunityIcons color="#C7DCFF" name="road-variant" size={28} />
              <Text style={styles.sidebarMotto}>Smarter Roads{`\n`}Through Better Data</Text>
              <Text style={styles.sidebarPlace}>{roleLabels[role]}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={styles.signOut}>
              <Feather color="#D7E5FF" name="log-out" size={17} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View testID="lakad-main" style={styles.main}>
        <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.contentDecoration, { pointerEvents: 'none' }]}>
          {Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.contour, { borderColor: palette.blue, width: 400 + index * 56, height: 160 + index * 34, top: -120 - index * 17, right: -30 - index * 25 }]} />)}
        </View>
        <View testID="lakad-toolbar" style={[styles.header, dashboard && styles.dashboardHeader, isPhone && dashboard && styles.dashboardHeaderPhone, isPhone && !dashboard && styles.headerPhone, { backgroundColor: dashboard ? palette.background : palette.panel, borderColor: palette.border }]}>
          {isCompact ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: menuOpen }} accessibilityLabel="Open navigation" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Feather color={palette.text} name="menu" size={22} />
          </Pressable> : null}
          {dashboard && !isPhone ? <View style={styles.dashboardHeading}>
            <Text accessibilityRole="header" style={[styles.pageTitle, isPhone && styles.pageTitlePhone, { color: palette.text }]}>{title}</Text>
            <Text style={[styles.pageSubtitle, { color: palette.muted }]}>{subtitle}</Text>
          </View> : null}
          {!isPhone && searchField ? searchField : !dashboard || isPhone ? <View style={styles.headerSpacer} /> : null}
          {onRefresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh data" onPress={onRefresh} style={[styles.roundButton, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <Feather color={palette.text} name="refresh-cw" size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
            onPress={toggleColorScheme}
            style={[styles.roundButton, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <Feather color={palette.text} name={colorScheme === 'dark' ? 'sun' : 'moon'} size={17} />
          </Pressable>
          <View accessibilityLabel={`${name}, ${roleLabels[role]}`} style={[styles.account, isPhone && styles.accountPhone, { borderLeftColor: palette.border }]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(name)}</Text></View>
              {!isPhone ? <View>
                <Text numberOfLines={1} style={[styles.accountName, { color: palette.text }]}>{name}</Text>
                <Text style={[styles.accountRole, { color: palette.muted }]}>{roleLabels[role]}</Text>
              </View> : null}
            </View>
        </View>

        <ScrollView testID="lakad-content" contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}>
          {dashboard && !isPhone && <View testID="lakad-print-heading" style={styles.printHeading}><Text style={[styles.pageTitle, { color: palette.text }]}>{title}</Text></View>}
          {!dashboard || isPhone ? <View style={[styles.pageHeading, isPhone && styles.pageHeadingPhone]}>
            <View style={styles.pageHeadingCopy}>
              <Text style={[styles.eyebrow, { color: palette.blue }]}>{roleLabels[role]}</Text>
              <Text accessibilityRole="header" style={[styles.pageTitle, isPhone && styles.pageTitlePhone, { color: palette.text }]}>{title}</Text>
              <Text style={[styles.pageSubtitle, { color: palette.muted }]}>{subtitle}</Text>
            </View>
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
    ? { background: palette.action ?? palette.blue, border: palette.action ?? palette.blue, text: '#FFFFFF' }
    : tone === 'danger'
      ? { background: palette.redSoft, border: palette.red, text: palette.red }
      : { background: palette.panel, border: palette.blue, text: palette.blue };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="lakad-action"
      accessibilityState={{ disabled: !!disabled }}
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
  editable = true,
  keyboardType,
  label,
  multiline,
  onChangeText,
  palette,
  placeholder,
  value,
}: {
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  palette: AdminPalette;
  placeholder?: string;
  value: string;
}) {
  const labelId = `lakad-field-label-${useId()}`;
  return (
    <View style={styles.fieldGroup}>
      <Text nativeID={labelId} style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text>
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
  absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  screen: { flex: 1, flexDirection: 'row', minHeight: '100%' },
  main: { flex: 1, minWidth: 0 },
  contentDecoration: { height: 240, overflow: 'hidden', position: 'absolute', top: 0, right: 0, left: 0, opacity: 0.06 },
  contour: { position: 'absolute', borderWidth: 1, borderRadius: 400, transform: [{ rotate: '-15deg' }] },
  scrim: { backgroundColor: 'rgba(2,10,28,0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  sidebar: { backgroundColor: layout.navy.sidebar, paddingBottom: 14, width: layout.sidebar },
  sidebarOverlay: { bottom: 0, left: 0, position: 'absolute', top: 0, zIndex: 30 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 128, paddingHorizontal: 22 },
  brandMark: { height: 76, width: 64 },
  brandName: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 0.4 },
  brandTagline: { color: '#D4E3FA', fontSize: 9 },
  closeButton: { marginLeft: 'auto', padding: 5 },
  navList: { gap: 7, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 200 },
  navItem: { alignItems: 'center', borderRadius: layout.radius.control, flexDirection: 'row', gap: 15, minHeight: 50, paddingHorizontal: 16, paddingVertical: 13 },
  navItemActive: { backgroundColor: layout.navy.active },
  navText: { color: '#E2EDFF', fontSize: 14 },
  navTextActive: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sidebarVisual: { alignItems: 'flex-start', bottom: 64, height: 142, justifyContent: 'flex-end', left: 24, overflow: 'hidden', position: 'absolute', right: 20 },
  sidebarMotto: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 22, marginTop: 5 },
  sidebarPlace: { color: '#DBE8FF', fontSize: 13, lineHeight: 19, marginTop: 9 },
  signOut: { alignItems: 'center', bottom: 8, flexDirection: 'row', gap: 9, left: 20, padding: 9, position: 'absolute' },
  signOutText: { color: '#D7E5FF', fontSize: 13, fontWeight: '600' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, height: 66, paddingHorizontal: 20 },
  headerPhone: { gap: 8, height: 60, paddingHorizontal: 14 },
  dashboardHeader: { borderBottomWidth: 0, height: 'auto', minHeight: 100, padding: layout.spacing.lg, flexWrap: 'wrap' },
  dashboardHeaderPhone: { padding: 14, gap: 8, minHeight: 60 },
  dashboardHeading: { flex: 1, minWidth: 200 },
  iconButton: { padding: 10, minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  search: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, maxWidth: 500, paddingHorizontal: 12 },
  phoneSearchRow: { flexDirection: 'row' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, height: 44 },
  headerSpacer: { flex: 1 },
  roundButton: { alignItems: 'center', borderRadius: 24, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  account: { alignItems: 'center', borderLeftWidth: 1, flexDirection: 'row', gap: 9, marginLeft: 'auto', paddingLeft: 14 },
  accountPhone: { borderLeftWidth: 0, paddingLeft: 0, marginLeft: 0 },
  avatar: { alignItems: 'center', backgroundColor: layout.navy.active, borderRadius: 24, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  accountName: { fontSize: 12, fontWeight: '700', maxWidth: 145 },
  accountRole: { fontSize: 9.5, marginTop: 2 },
  content: { gap: 17, padding: 24, paddingBottom: 44 },
  contentPhone: { padding: 14 },
  pageHeading: { alignItems: 'flex-end', flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 92 },
  pageHeadingPhone: { alignItems: 'flex-start', flexDirection: 'column', minHeight: 0 },
  pageHeadingCopy: { flex: 1 },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6 },
  pageTitle: { fontSize: layout.type.title, fontWeight: '800', letterSpacing: -0.5 },
  pageTitlePhone: { fontSize: 25 },
  pageSubtitle: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 420 },
  refreshing: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  loadingText: { fontSize: 13, marginTop: 11 },
  panel: { ...layout.shadow, borderRadius: layout.radius.card, borderWidth: 1, padding: layout.spacing.md },
  panelHeading: { marginBottom: 15 },
  panelTitle: { fontSize: 17, fontWeight: '800' },
  panelSubtitle: { fontSize: 12, marginTop: 3 },
  button: { alignItems: 'center', borderRadius: layout.radius.control, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.78 },
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
  restrictedTitle: { fontSize: 21, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  restrictedText: { fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 7, textAlign: 'center' },
});
