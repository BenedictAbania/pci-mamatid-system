import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    type TextInputInstance,
    useWindowDimensions,
    View,
} from 'react-native';

import { supabase } from '@/lib/data/supabase';
import { useAppTheme } from '@/providers/ThemeProvider';

const logoImage = require('../../assets/images/LAKAD.png');
/** Open road under a clear sky: the login backdrop. */
const roadImage = require('../../assets/images/lakad_hero_bg.png');

const palettes = {
  light: {
    card: '#FFFFFF',
    cardBorder: 'rgba(255,255,255,0.7)',
    text: '#0B1D4D',
    secondary: '#4B5B7C',
    label: '#0B1D4D',
    input: '#F3F5F9',
    inputFocus: '#FFFFFF',
    inputBorder: '#E3E8F2',
    placeholder: '#7A87A6',
    icon: '#5B6E98',
    primary: '#1850E0',
    primaryHover: '#1038B0',
    primaryPressed: '#0B2C8C',
    focus: '#1850E0',
    ring: 'rgba(24,80,224,0.16)',
    link: '#1850E0',
    divider: '#E1E6F2',
    error: '#B62135',
    errorSurface: '#FFF0F2',
    errorBorder: '#FDA29B',
    tint: 'rgba(6,18,58,0.38)',
  },
  dark: {
    card: '#0C1A42',
    cardBorder: '#1F3366',
    text: '#F8FAFC',
    secondary: '#A8B5D6',
    label: '#E3EAFB',
    input: '#091536',
    inputFocus: '#0A1A44',
    inputBorder: '#14275A',
    placeholder: '#7F8FB8',
    icon: '#8FA1CC',
    primary: '#2A5FF0',
    primaryHover: '#3D72FF',
    primaryPressed: '#1850E0',
    focus: '#7DA8FF',
    ring: 'rgba(125,168,255,0.22)',
    link: '#8FB4FF',
    divider: '#1F3366',
    error: '#FECACA',
    errorSurface: '#451A1A',
    errorBorder: '#7F1D1D',
    tint: 'rgba(3,8,28,0.58)',
  },
} as const;

/** Sends the visitor to the Contact section of the landing page. */
function openContact(push: (href: '/') => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign('/#contact');
  else push('/');
}

export default function LoginScreen() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const colors = palettes[colorScheme];
  const isDark = colorScheme === 'dark';
  const isCompact = width < 520;
  const passwordRef = useRef<TextInputInstance>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // On native Fabric, changing a TextInput parent's shadowColor during onFocus
  // can immediately blur the input. Focus feedback below changes its border only.

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

  const edge = isCompact ? 18 : width >= 1024 ? 56 : 32;

  return (
    <View style={[styles.page, { minHeight: height }]}>
      <Image
        accessible={false}
        contentFit="cover"
        contentPosition={{ left: '50%', top: '52%' }}
        source={roadImage}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.tint }]} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.frame, { paddingHorizontal: edge }]}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Back to Home"
              hitSlop={6}
              onPress={() => router.push('/')}
              style={styles.backLink}>
              {({ hovered, pressed }: any) => (
                <>
                  <Feather
                    color="#FFFFFF"
                    name="arrow-left"
                    size={20}
                    style={{ transform: [{ translateX: hovered && !pressed ? -3 : 0 }] }}
                  />
                  <Text style={[styles.backText, { textDecorationLine: hovered ? 'underline' : 'none' }]}>
                    Back to Home
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              accessibilityRole="button"
              hitSlop={8}
              onPress={toggleColorScheme}
              style={({ pressed, hovered }: any) => [
                styles.themeButton,
                {
                  backgroundColor: hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)',
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ] as any}>
              <Feather color={isDark ? '#FFD66B' : '#FFFFFF'} name={isDark ? 'sun' : 'moon'} size={18} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <View
              style={[
                styles.card,
                isCompact && styles.cardCompact,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  ...(Platform.OS === 'web'
                    ? { boxShadow: `0 24px 60px ${isDark ? 'rgba(0,0,0,0.45)' : 'rgba(6,18,58,0.28)'}` }
                    : { shadowColor: '#000000' }),
                },
              ]}>
              <View accessible accessibilityLabel="LAKAD, Where Data Meets the Road" style={styles.brand}>
                <Image contentFit="contain" source={logoImage} style={isCompact ? styles.logoCompact : styles.logo} />
                <View>
                  <Text style={[styles.brandName, isCompact && styles.brandNameCompact, { color: colors.text }]}>LAKAD</Text>
                  <Text style={[styles.brandTagline, { color: isDark ? '#B9C9F2' : '#1850E0' }]}>Where Data Meets the Road</Text>
                </View>
              </View>

              <Text accessibilityRole="header" style={[styles.heading, isCompact && styles.headingCompact, { color: colors.text }]}>
                Sign in to LAKAD
              </Text>
              <Text style={[styles.subheading, { color: colors.secondary }]}>Use the account your system administrator created for you.</Text>

              {errorMessage ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[styles.errorBanner, { backgroundColor: colors.errorSurface, borderColor: colors.errorBorder }]}>
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
                    { backgroundColor: colors.input, borderColor: colors.inputBorder },
                    focusedField === 'email' && {
                      backgroundColor: colors.inputFocus,
                      borderColor: colors.focus,
                      ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 3px ${colors.ring}` } : {}),
                    },
                  ]}>
                  <Feather color={colors.icon} name="mail" size={17} style={styles.inputIcon} />
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
                    placeholder="name@example.com"
                    placeholderTextColor={colors.placeholder}
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
                    { backgroundColor: colors.input, borderColor: colors.inputBorder },
                    focusedField === 'password' && {
                      backgroundColor: colors.inputFocus,
                      borderColor: colors.focus,
                      ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 3px ${colors.ring}` } : {}),
                    },
                  ]}>
                  <Feather color={colors.icon} name="lock" size={17} style={styles.inputIcon} />
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
                    placeholderTextColor={colors.placeholder}
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
                    <Feather color={colors.icon} name={showPassword ? 'eye-off' : 'eye'} size={18} />
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
                    backgroundColor: pressed ? colors.primaryPressed : hovered ? colors.primaryHover : colors.primary,
                    opacity: loading ? 0.72 : 1,
                    transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.98 : 1 }],
                  },
                ] as any}>
                {loading ? (
                  <View style={styles.loadingLabel}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.submitButtonText}>Signing in…</Text>
                  </View>
                ) : (
                  <View style={styles.loadingLabel}>
                    <Text style={styles.submitButtonText}>Sign in</Text>
                    <Feather color="#FFFFFF" name="arrow-right" size={18} />
                  </View>
                )}
              </Pressable>

              <View style={[styles.accessHelp, { borderTopColor: colors.divider }]}>
                <Text style={[styles.accessHelpText, { color: colors.secondary }]}>
                  Need access?{' '}
                  <Text
                    accessibilityRole="link"
                    onPress={() => openContact(router.push)}
                    style={[styles.accessLink, { color: colors.link }]}>
                    Contact your system administrator.
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#0A1B4D',
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  frame: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 1320,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 24 : 52,
  },
  backLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  themeButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 440,
    paddingBottom: 28,
    paddingHorizontal: 36,
    paddingTop: 36,
    width: '100%',
    ...Platform.select({
      web: {},
      default: { shadowOffset: { height: 14, width: 0 }, shadowOpacity: 0.22, shadowRadius: 30 },
    }),
  },
  cardCompact: {
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 28,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  logo: {
    height: 54,
    width: 50,
  },
  logoCompact: {
    height: 48,
    width: 44,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 31,
  },
  brandNameCompact: {
    fontSize: 25,
    lineHeight: 28,
  },
  brandTagline: {
    fontSize: 12,
    fontWeight: '600',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 34,
    marginTop: 26,
    textAlign: 'center',
  },
  headingCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 6,
    textAlign: 'center',
  },
  errorBanner: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 18,
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
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 7,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 50,
    ...Platform.select({
      web: {},
      default: { shadowOffset: { height: 0, width: 0 }, shadowOpacity: 0.2, shadowRadius: 3 },
    }),
  },
  inputIcon: {
    marginLeft: 14,
  },
  textInput: {
    flex: 1,
    fontSize: 15.5,
    height: '100%',
    paddingHorizontal: 12,
    ...Platform.select({ web: { outlineStyle: 'none' } as object, default: {} }),
  },
  passwordToggle: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    marginTop: 8,
    ...Platform.select({
      web: { boxShadow: '0 10px 22px rgba(24,80,224,0.30)', transitionDuration: '150ms', transitionProperty: 'transform, background-color' } as object,
      default: { shadowColor: '#1850E0', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.2, shadowRadius: 10 },
    }),
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  accessHelp: {
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 18,
  },
  accessHelpText: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  accessLink: {
    fontWeight: '600',
  },
});
