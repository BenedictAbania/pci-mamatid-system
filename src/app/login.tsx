import { Feather } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/providers/ThemeProvider';

const heroImage = require('../../assets/images/lakad_hero_bg.jpg');
const logoImage = require('../../assets/images/LAKAD.png');

const FEATURES = [
  { icon: 'clipboard' as const, label: 'Standardized\nInspection' },
  { icon: 'bar-chart-2' as const, label: 'Automatic\nPCI Computation' },
  { icon: 'map-pin' as const, label: 'Data-Driven\nPrioritization' },
];

const palettes = {
  light: {
    page: '#F7FAFF',
    card: '#FFFFFF',
    text: '#101B3D',
    secondary: '#64748B',
    label: '#172554',
    border: '#CEDBF0',
    input: '#FFFFFF',
    icon: '#7183A5',
    primary: '#2563EB',
    primaryPressed: '#1D4ED8',
    focus: '#3B82F6',
    error: '#B42318',
    errorSurface: '#FEF3F2',
    errorBorder: '#FDA29B',
    themeButton: '#FFFFFF',
  },
  dark: {
    page: '#071127',
    card: '#12203D',
    text: '#F8FAFC',
    secondary: '#94A3B8',
    label: '#E2E8F0',
    border: '#233451',
    input: '#0E1A33',
    icon: '#94A3B8',
    primary: '#3B82F6',
    primaryPressed: '#2563EB',
    focus: '#60A5FA',
    error: '#FECACA',
    errorSurface: '#451A1A',
    errorBorder: '#7F1D1D',
    themeButton: '#12203D',
  },
} as const;

type BrandMarkProps = {
  compact?: boolean;
  inverse?: boolean;
};

function BrandMark({ compact = false, inverse = false }: BrandMarkProps) {
  return (
    <View accessibilityLabel="LAKAD — Where Data Meets the Road" style={styles.brandMark}>
      <Image
        accessibilityLabel="LAKAD logo"
        contentFit="contain"
        source={logoImage}
        style={compact ? styles.brandIconCompact : styles.brandIcon}
      />
      <View style={styles.brandCopy}>
        <Text
          style={[
            styles.brandName,
            compact && styles.brandNameCompact,
            { color: inverse ? '#FFFFFF' : '#101B3D' },
          ]}>
          LAKAD
        </Text>
        <Text
          style={[
            styles.brandTagline,
            compact && styles.brandTaglineCompact,
            { color: inverse ? '#BFDBFE' : '#2563EB' },
          ]}>
          Where Data Meets the Road
        </Text>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const colors = palettes[colorScheme];
  const isDark = colorScheme === 'dark';
  const isWide = width >= 920;
  const isCompact = width < 520;
  const loginCardWidth = Math.max(
    280,
    Math.min(590, isWide ? width * 0.48 - 76 : width - 44)
  );
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const pageStyle = useMemo(
    () => [styles.page, { backgroundColor: colors.page, minHeight: height }],
    [colors.page, height]
  );

  const handleLogin = async () => {
    if (loading) return;

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setErrorMessage('Enter your email address and password to continue.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (__DEV__) console.debug('Supabase sign-in error:', error);

        const isInvalidCredentials = error.message.toLowerCase().includes('invalid login credentials');
        setErrorMessage(
          isInvalidCredentials
            ? 'The email address or password is incorrect.'
            : 'We could not sign you in. Please try again.'
        );
        setLoading(false);
      }
      // AuthProvider receives the session change and the root layout performs the redirect.
    } catch (error) {
      if (__DEV__) console.debug('Unexpected sign-in error:', error);
      setErrorMessage('We could not sign you in. Check your connection and try again.');
      setLoading(false);
    }
  };

  const updateEmail = (value: string) => {
    setEmail(value);
    if (errorMessage) setErrorMessage('');
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    if (errorMessage) setErrorMessage('');
  };

  return (
    <View style={[pageStyle, { flexDirection: isWide ? 'row' : 'column' }]}>
      {isWide ? (
        <ImageBackground
          contentFit="cover"
          source={heroImage}
          style={styles.heroPanel}
          transition={180}>
          <View style={styles.heroOverlay}>
            <View style={styles.heroInner}>
              <BrandMark inverse />

              <View style={styles.heroMessage}>
                <View style={styles.accentLine} />
                <Text style={styles.heroHeading}>Smarter Roads{`\n`}Through Better Data</Text>
                <Text style={styles.heroDescription}>
                  Assess pavement conditions, compute PCI, and prioritize maintenance with
                  confidence.
                </Text>

                <View style={styles.features}>
                  {FEATURES.map((feature, index) => (
                    <View key={feature.label} style={styles.featureWrapper}>
                      {index > 0 ? <View style={styles.featureDivider} /> : null}
                      <View style={styles.feature}>
                        <View style={styles.featureIcon}>
                          <Feather color="#EAF2FF" name={feature.icon} size={26} />
                        </View>
                        <Text style={styles.featureLabel}>{feature.label}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={styles.locationLabel}>BARANGAY MAMATID · CABUYAO, LAGUNA</Text>
            </View>
          </View>
        </ImageBackground>
      ) : null}

      <View style={[styles.formPanel, { backgroundColor: colors.page }]}>
        <Pressable
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={toggleColorScheme}
          style={({ pressed, hovered }: any) => [
            styles.themeButton,
            {
              backgroundColor: hovered ? (isDark ? '#1E293B' : '#E2E8F0') : colors.themeButton,
              borderColor: pressed ? colors.focus : hovered ? '#91A4C8' : colors.border,
              transform: hovered && !pressed ? [{ scale: 1.05 }] : [{ scale: 1 }],
            },
            pressed && styles.themeButtonPressed,
          ] as any}>
          <Feather color={colors.text} name={isDark ? 'sun' : 'moon'} size={20} />
        </Pressable>

        <ScrollView
          contentContainerStyle={[
            styles.formScrollContent,
            !isWide && styles.formScrollContentNarrow,
            { minHeight: height },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.loginCard,
              isCompact && styles.loginCardCompact,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                ...(Platform.OS === 'web'
                  ? { boxShadow: `0 14px 35px ${isDark ? 'rgba(0,0,0,0.20)' : 'rgba(49,89,143,0.10)'}` }
                  : { shadowColor: isDark ? '#000000' : '#31598F' }),
                width: loginCardWidth,
              },
            ]}>
            <View style={styles.formBrand}>
              <BrandMark compact={isCompact} inverse={isDark} />
            </View>

            <View style={styles.formHeader}>
              <Text style={[styles.welcomeHeading, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.welcomeDescription, { color: colors.secondary }]}>
                Sign in to access the LAKAD system.
              </Text>
            </View>

            {errorMessage ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorBanner,
                  { backgroundColor: colors.errorSurface, borderColor: colors.errorBorder },
                ]}>
                <Feather color={colors.error} name="alert-circle" size={18} />
                <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text nativeID="email-label" style={[styles.fieldLabel, { color: colors.label }]}>
                Email address
              </Text>
              <View
                style={[
                  styles.inputShell,
                  { backgroundColor: colors.input, borderColor: colors.border },
                  focusedField === 'email' && {
                    borderColor: colors.focus,
                    ...(Platform.OS === 'web'
                      ? { boxShadow: `0 0 3px ${colors.focus}` }
                      : { shadowColor: colors.focus }),
                  },
                ]}>
                <Feather color={colors.icon} name="mail" size={20} />
                <TextInput
                  accessibilityLabelledBy="email-label"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!loading}
                  keyboardType="email-address"
                  onBlur={() => setFocusedField(null)}
                  onChangeText={updateEmail}
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.icon}
                  returnKeyType="next"
                  style={[styles.textInput, { color: colors.text }]}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text nativeID="password-label" style={[styles.fieldLabel, { color: colors.label }]}>
                Password
              </Text>
              <View
                style={[
                  styles.inputShell,
                  { backgroundColor: colors.input, borderColor: colors.border },
                  focusedField === 'password' && {
                    borderColor: colors.focus,
                    ...(Platform.OS === 'web'
                      ? { boxShadow: `0 0 3px ${colors.focus}` }
                      : { shadowColor: colors.focus }),
                  },
                ]}>
                <Feather color={colors.icon} name="lock" size={20} />
                <TextInput
                  ref={passwordRef}
                  accessibilityLabelledBy="password-label"
                  autoComplete="current-password"
                  editable={!loading}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={updatePassword}
                  onFocus={() => setFocusedField('password')}
                  onSubmitEditing={() => void handleLogin()}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.icon}
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  style={[styles.textInput, { color: colors.text }]}
                  textContentType="password"
                  value={password}
                />
                <Pressable
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setShowPassword((isVisible) => !isVisible)}
                  style={styles.passwordToggle}>
                  <Feather
                    color={colors.icon}
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityLabel={loading ? 'Signing in' : 'Sign in'}
              accessibilityRole="button"
              accessibilityState={{ busy: loading, disabled: loading }}
              disabled={loading}
              onPress={() => void handleLogin()}
              style={({ pressed, hovered }: any) => [
                styles.submitButton,
                {
                  backgroundColor: pressed ? colors.primaryPressed : hovered ? colors.focus : colors.primary,
                  opacity: loading ? 0.72 : 1,
                  transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }],
                },
              ] as any}>
              {loading ? (
                <View style={styles.loadingLabel}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.submitButtonText}>Signing in…</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Sign in</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityLabel="How Automated PCI Works"
              accessibilityRole="button"
              onPress={() => router.push('/prototype')}
              style={({ pressed, hovered }: any) => [
                styles.prototypeButton,
                {
                  backgroundColor: pressed ? '#F1F5F9' : hovered ? '#F8FAFC' : '#FFFFFF',
                  borderColor: hovered ? '#CBD5E1' : '#DCE5F2',
                  opacity: pressed ? 0.8 : 1,
                  transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }],
                },
              ] as any}>
              <Text style={styles.prototypeButtonText}>How Automated PCI Works</Text>
            </Pressable>

            <View style={[styles.accessHelp, { borderTopColor: colors.border }]}>
              <Text style={[styles.accessHelpText, { color: colors.secondary }]}>
                Need access? Contact your system administrator.
              </Text>
            </View>
          </View>

          <View style={styles.authorizationFooter}>
            <Text style={[styles.footerText, { color: colors.secondary }]}>Authorized personnel only</Text>
            <Text style={[styles.footerText, { color: colors.secondary }]}>
              Barangay Mamatid, Cabuyao, Laguna
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  heroPanel: {
    flex: 1.08,
    minWidth: 0,
  },
  heroOverlay: {
    backgroundColor: 'rgba(6, 33, 94, 0.64)',
    flex: 1,
  },
  heroInner: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 48,
    paddingHorizontal: 64,
    paddingTop: 56,
  },
  brandMark: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  brandIcon: {
    height: 86,
    marginRight: 14,
    width: 86,
  },
  brandIconCompact: {
    height: 64,
    marginRight: 10,
    width: 64,
  },
  brandCopy: {
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 1.5,
    lineHeight: 49,
  },
  brandNameCompact: {
    fontSize: 36,
    lineHeight: 38,
  },
  brandTagline: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  brandTaglineCompact: {
    fontSize: 12,
  },
  heroMessage: {
    maxWidth: 590,
  },
  accentLine: {
    backgroundColor: '#60A5FA',
    borderRadius: 3,
    height: 6,
    marginBottom: 22,
    width: 62,
  },
  heroHeading: {
    color: '#FFFFFF',
    fontSize: 49,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 56,
    marginBottom: 16,
  },
  heroDescription: {
    color: '#C4D4F3',
    fontSize: 19,
    lineHeight: 29,
    marginBottom: 40,
    maxWidth: 560,
  },
  features: {
    alignItems: 'stretch',
    flexDirection: 'row',
    marginHorizontal: -12,
  },
  featureWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  featureDivider: {
    alignSelf: 'center',
    backgroundColor: 'rgba(191, 219, 254, 0.3)',
    height: 96,
    width: 1,
  },
  feature: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(191, 219, 254, 0.45)',
    borderRadius: 30,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: 12,
    width: 58,
  },
  featureLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  locationLabel: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.2,
    textAlign: 'right',
  },
  formPanel: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  formScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 28,
    paddingHorizontal: 38,
    paddingTop: 76,
  },
  formScrollContentNarrow: {
    paddingHorizontal: 22,
    paddingTop: 88,
  },
  themeButton: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    ...Platform.select({
      web: { boxShadow: '0 2px 7px rgba(15,23,42,0.08)' },
      default: { shadowColor: '#0F172A', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.08, shadowRadius: 7 },
    }),
    top: Platform.OS === 'web' ? 24 : 42,
    width: 44,
    zIndex: 10,
  },
  themeButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  loginCard: {
    borderRadius: 22,
    borderWidth: 1,
    boxSizing: 'border-box',
    maxWidth: 590,
    paddingBottom: 30,
    paddingHorizontal: 42,
    paddingTop: 38,
    ...Platform.select({
      web: {},
      default: { shadowOffset: { height: 14, width: 0 }, shadowOpacity: 0.1, shadowRadius: 35 },
    }),
  },
  loginCardCompact: {
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 30,
  },
  formBrand: {
    alignItems: 'center',
    marginBottom: 22,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 26,
  },
  welcomeHeading: {
    fontSize: 37,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 44,
    marginBottom: 5,
    textAlign: 'center',
  },
  welcomeDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorBanner: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 10,
  },
  fieldGroup: {
    marginBottom: 19,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 8,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    height: 58,
    paddingLeft: 16,
    ...Platform.select({
      web: {},
      default: { shadowOffset: { height: 0, width: 0 }, shadowOpacity: 0.2, shadowRadius: 3 },
    }),
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    paddingLeft: 12,
    paddingRight: 13,
    marginLeft: 12,
  },
  passwordToggle: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 11,
    height: 56,
    justifyContent: 'center',
    marginTop: 7,
    ...Platform.select({
      web: { boxShadow: '0 5px 10px rgba(37,99,235,0.22)' },
      default: { shadowColor: '#2563EB', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.22, shadowRadius: 10 },
    }),
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  prototypeButton: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginTop: 12,
  },
  prototypeButtonText: {
    color: '#071957',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  accessHelp: {
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 27,
    paddingTop: 22,
  },
  accessHelpText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  authorizationFooter: {
    alignItems: 'center',
    marginTop: 22,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
