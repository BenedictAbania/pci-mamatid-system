import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { homeForRole, roleLabels } from '@/lib/auth/access';
import { supabase } from '@/lib/data/supabase';
import { brand } from '@/lib/ui/design-system';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';

const logoImage = require('../../assets/images/LAKAD.png');
const MIN_PASSWORD = 8;

const palettes = {
  light: { page: '#F3F6FC', card: '#FFFFFF', text: brand.ink, muted: '#4B5B7C', border: '#DBE3F2', input: '#F8FAFE', soft: '#E9F0FE', accent: brand.royal, error: '#B62135', errorSoft: '#FFF0F2' },
  dark: { page: brand.night, card: '#0C1A42', text: '#F1F5FE', muted: '#A8B5D6', border: '#1F3366', input: '#091536', soft: '#13265A', accent: '#7DA8FF', error: '#FECACA', errorSoft: '#451A1A' },
} as const;

type Stage = 'checking' | 'invalid' | 'password' | 'done';
const noSubscribe = () => () => {};

/** Error details Supabase appends to the redirect when an invitation link is expired or already used. */
function linkErrorFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return '';
  return code === 'otp_expired'
    ? 'This invitation link has expired or was already used.'
    : params.get('error_description')?.replace(/\+/g, ' ') || 'This invitation link is not valid.';
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const c = palettes[colorScheme];
  const { session, profile, role, isLoading } = useAuth();
  // Server snapshot is empty so the static HTML and first client render match.
  const linkError = useSyncExternalStore(noSubscribe, linkErrorFromUrl, () => '');
  const [saved, setSaved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stage: Stage = saved ? 'done' : linkError ? 'invalid' : session ? 'password' : timedOut ? 'invalid' : 'checking';

  useEffect(() => {
    if (session || linkError || isLoading) return;
    // The client may still be exchanging the token in the link; give it a moment.
    const timer = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(timer);
  }, [isLoading, linkError, session]);

  const name = (profile?.full_name || (session?.user.user_metadata?.full_name as string | undefined) || '').trim();
  const firstName = name.split(/\s+/)[0];

  const savePassword = async () => {
    if (saving) return;
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      if (__DEV__) console.debug('Password setup error:', updateError);
      setError('We could not save your password. Please try again.');
      return;
    }
    setSaved(true);
  };

  const shadow = Platform.OS === 'web'
    ? { boxShadow: colorScheme === 'dark' ? '0 18px 40px rgba(0,0,0,0.28)' : '0 18px 40px rgba(10,27,77,0.10)' }
    : { shadowColor: brand.navy, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.1, shadowRadius: 30 };
  const field = [styles.input, { backgroundColor: c.input, borderColor: c.border, color: c.text }];

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: c.page }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.band, Platform.OS === 'web' ? { backgroundImage: brand.gradient } as object : { backgroundColor: brand.royal }]}>
        <View style={[styles.stripe, { left: '62%' }]} />
        <View style={[styles.stripe, { left: '74%', opacity: 0.08 }]} />
      </View>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, shadow]}>
        <View style={styles.brandRow}>
          <Image accessibilityLabel="LAKAD logo" contentFit="contain" source={logoImage} style={styles.logo} />
          <View>
            <Text style={[styles.brandName, { color: c.text }]}>LAKAD</Text>
            <Text style={[styles.brandTag, { color: c.accent }]}>Where Data Meets the Road</Text>
          </View>
        </View>

        {stage === 'checking' ? (
          <View style={styles.center}>
            <ActivityIndicator color={brand.royal} size="large" />
            <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>Opening your invitation…</Text>
          </View>
        ) : null}

        {stage === 'invalid' ? (
          <View style={styles.block}>
            <View style={[styles.badge, { backgroundColor: c.errorSoft }]}><Feather color={c.error} name="link-2" size={26} /></View>
            <Text style={[styles.heading, { color: c.text }]}>This link can’t be used</Text>
            <Text style={[styles.body, { color: c.muted }]}>{linkError || 'This invitation link is not valid.'} Ask your LAKAD administrator to send you a new invitation.</Text>
            <Action label="Go to sign in" onPress={() => router.replace('/login')} />
          </View>
        ) : null}

        {stage === 'password' ? (
          <View style={styles.block}>
            <View style={[styles.badge, { backgroundColor: c.soft }]}><Feather color={c.accent} name="award" size={26} /></View>
            <Text style={[styles.eyebrow, { color: c.accent }]}>INVITATION ACCEPTED</Text>
            <Text style={[styles.heading, { color: c.text }]}>Congratulations{firstName ? `, ${firstName}` : ''}!</Text>
            <Text style={[styles.body, { color: c.muted }]}>
              You’re now part of the LAKAD team for Barangay Mamatid{role ? ` as a ${roleLabels[role]}` : ''}. Together we turn road inspections into clear, data-driven maintenance decisions.
            </Text>
            <Text style={[styles.body, { color: c.text, fontWeight: '700', marginTop: 4 }]}>Create a password to finish setting up your account.</Text>

            {error ? <View style={[styles.error, { backgroundColor: c.errorSoft }]}><Feather color={c.error} name="alert-circle" size={16} /><Text style={[styles.errorText, { color: c.error }]}>{error}</Text></View> : null}

            <Text style={[styles.label, { color: c.text }]}>New password</Text>
            <View>
              <TextInput autoComplete="new-password" onChangeText={v => { setPassword(v); setError(''); }} placeholder={`At least ${MIN_PASSWORD} characters`} placeholderTextColor={c.muted} secureTextEntry={!show} style={field} textContentType="newPassword" value={password} />
              <Pressable accessibilityLabel={show ? 'Hide password' : 'Show password'} accessibilityRole="button" hitSlop={8} onPress={() => setShow(v => !v)} style={styles.eye}>
                <Feather color={c.muted} name={show ? 'eye-off' : 'eye'} size={18} />
              </Pressable>
            </View>
            <Text style={[styles.label, { color: c.text }]}>Confirm password</Text>
            <TextInput autoComplete="new-password" onChangeText={v => { setConfirm(v); setError(''); }} onSubmitEditing={() => void savePassword()} placeholder="Type it again" placeholderTextColor={c.muted} secureTextEntry={!show} style={field} textContentType="newPassword" value={confirm} />

            <Action busy={saving} label={saving ? 'Saving…' : 'Save password'} onPress={() => void savePassword()} />
          </View>
        ) : null}

        {stage === 'done' ? (
          <View style={styles.block}>
            <View style={[styles.badge, { backgroundColor: c.soft }]}><Feather color={c.accent} name="check-circle" size={26} /></View>
            <Text style={[styles.heading, { color: c.text }]}>You’re all set{firstName ? `, ${firstName}` : ''}!</Text>
            <Text style={[styles.body, { color: c.muted }]}>Your password is saved. Next time, sign in with your email and this password.</Text>
            <Action label="Open my workspace" onPress={() => router.replace(role ? homeForRole(role) : '/login')} />
          </View>
        ) : null}
      </View>

      <Text style={[styles.footer, { color: c.muted }]}>Barangay Mamatid · Cabuyao, Laguna</Text>
    </ScrollView>
  );
}

function Action({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.button,
        { backgroundColor: hovered || pressed ? brand.deep : brand.royal, opacity: busy ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }, { translateY: hovered && !pressed ? -1 : 0 }] },
      ] as any}>
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', flexGrow: 1, paddingBottom: 32, paddingHorizontal: 16 },
  band: { height: 220, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  stripe: { backgroundColor: '#FFFFFF', height: 420, opacity: 0.12, position: 'absolute', top: -100, transform: [{ rotate: '28deg' }], width: 48 },
  card: { borderRadius: 20, borderWidth: 1, marginTop: 72, maxWidth: 520, paddingHorizontal: 28, paddingVertical: 32, width: '100%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 26 },
  logo: { height: 60, width: 60 },
  brandName: { fontSize: 32, fontWeight: '900', letterSpacing: 1.2, lineHeight: 34 },
  brandTag: { fontSize: 12, fontWeight: '600' },
  center: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  block: { gap: 10 },
  badge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 14, height: 52, justifyContent: 'center', marginBottom: 6, width: 52 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  heading: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 36 },
  body: { fontSize: 15, lineHeight: 23 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 15, height: 50, paddingLeft: 14, paddingRight: 44 },
  eye: { alignItems: 'center', bottom: 0, justifyContent: 'center', position: 'absolute', right: 6, top: 0, width: 36 },
  error: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 8, marginTop: 4, padding: 10 },
  errorText: { flex: 1, fontSize: 14 },
  button: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 10, height: 52, justifyContent: 'center', marginTop: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  footer: { fontSize: 12, marginTop: 22 },
});
