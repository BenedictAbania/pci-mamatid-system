import { Feather } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View
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


