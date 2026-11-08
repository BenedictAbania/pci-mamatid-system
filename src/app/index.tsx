import { Feather } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, type TextInputProps, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { homeForRole } from '@/lib/auth/access';
import { brand } from '@/lib/ui/design-system';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';

const road = require('../../assets/images/lakad_landing_road.png');
const logo = require('../../assets/images/LAKAD.png');
const poster = require('../../assets/images/lakad_hero_bg.png');
type Section = 'home' | 'features' | 'roads' | 'about' | 'contact';
type PressState = { pressed: boolean; hovered?: boolean };
const nav: { label: string; target: Section }[] = [
  { label: 'Home', target: 'home' }, { label: 'Features', target: 'features' },
  { label: 'Highlight', target: 'roads' }, { label: 'About', target: 'about' },
  { label: 'Contact', target: 'contact' },
];

/** CSS gradients on web; the solid fallback colour elsewhere. */
function ground(gradient: string, fallback: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundColor: fallback, backgroundImage: gradient } : { backgroundColor: fallback }) as ViewStyle;
}
const brandBar = ground(`linear-gradient(90deg, ${brand.royal}, ${brand.sky})`, brand.royal);
/** Hero header palette: deep indigo bar with matching filled buttons. */
const hero = { bar: '#09003F', button: '#211853', buttonHover: '#2E2472', edge: 'rgba(255,255,255,0.14)' } as const;
/** Indigo text tones that pair the header bar with the logo blue. */
/** Landing text tones, all from the LAKAD navy and royal blue. */
const indigo = { ink: brand.ink, accent: brand.royal, body: '#4B5B7C', line: '#DBE3F2' } as const;
const features: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  { icon: 'layers', title: 'Road Inventory', body: 'A list of all the roads we check, divided into branches, sections, and sample units, so no road gets missed.' },
  { icon: 'edit-3', title: 'Guided Distress Entry', body: 'A step by step form for recording the cracks and holes you see, with their type, severity, and size.' },
  { icon: 'activity', title: 'Automatic PCI Computation', body: 'The system does the math for you and gives each sample unit a score from 0 to 100.' },
  { icon: 'flag', title: 'Color-Coded Repair Priority Ranking', body: 'Roads are sorted and colored by condition, so you can see which ones to fix first.' },
  { icon: 'users', title: 'Role-Based Dashboard', body: 'Each user sees only the tools they need, whether Admin, Encoder, Reviewer, or Viewer.' },
  { icon: 'printer', title: 'Printable Reports', body: 'Turn the PCI results and repair priorities into a paper copy you can print and share.' },
];

/**
 * Highlight video. Put the video's web address here (an .mp4 link, e.g. from Supabase Storage or
 * the site's public folder) and the frame plays it on the website. Leave null until the video is ready.
 */
const highlightVideo: string | null = null;
const highlights: { icon: keyof typeof Feather.glyphMap; title: string }[] = [
  { icon: 'edit-3', title: 'Record road distresses right on site' },
  { icon: 'activity', title: 'Compute PCI automatically' },
  { icon: 'flag', title: 'Rank roads by repair priority' },
  { icon: 'printer', title: 'Print and share reports' },
];
const accessCards: { icon: keyof typeof Feather.glyphMap; title: string; steps?: boolean; items: string[]; note: string }[] = [
  { icon: 'log-in', title: 'How to Sign In', steps: true, items: ['Open your browser.', 'Go to the LAKAD website.', 'Sign in with the account your administrator gave you.'], note: 'Same steps on a phone, tablet, or computer.' },
  { icon: 'smartphone', title: 'On a Phone', items: ['Record inspections right at the road.', 'Take photos of distresses as evidence.', 'Save a draft and finish it later.'], note: 'Best for field work on site.' },
  { icon: 'monitor', title: 'On a Desktop', items: ['See every road and its PCI result at a glance.', 'Review and approve submitted inspections.', 'Print reports and the repair priority list.'], note: 'Best for office work and reporting.' },
];

/** The acronym, one word per row; the first letter of each row spells LAKAD down the left edge. */
const acronym: { initial: string; rest: string }[] = [
  { initial: 'L', rest: 'ocal' }, { initial: 'A', rest: 'sphalt' }, { initial: 'K', rest: 'onditioning' },
  { initial: 'A', rest: 'ssessment and' }, { initial: 'D', rest: 'ata-Driven Prioritization' },
];
const aboutPoints: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  { icon: 'clock', title: 'Why we built it', body: 'Computing PCI by hand is slow and easy to get wrong. LAKAD handles the computation, so inspectors can focus on the road and decision makers can see clear results.' },
  { icon: 'book-open', title: 'How it is based', body: 'LAKAD follows the ASTM D6433-07 procedure, from sampling and distress records to the final PCI of each road section.' },
  { icon: 'users', title: 'Who it serves', body: 'Encoders record inspections. Reviewers check them. Admins manage accounts, and Viewers read the results. It works for any barangay, municipality, or organization that maintains its own roads.' },
];

function AcronymPanel({ dark, phone }: { dark: boolean; phone: boolean }) {
  const size = phone ? 25 : 36;
  return <View accessible accessibilityLabel="Local Asphalt Konditioning Assessment and Data-Driven Prioritization"
    style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: dark ? '#0C1A42' : hero.bar, borderWidth: 1, borderColor: dark ? '#1F3366' : 'transparent',
      paddingVertical: phone ? 28 : 44, paddingHorizontal: phone ? 24 : 44, boxShadow: dark ? '0px 18px 40px rgba(0,0,0,0.35)' : '0px 22px 48px rgba(10,27,77,0.18)' } as ViewStyle}>
    <Image aria-hidden source={logo} contentFit="contain" style={{ position: 'absolute', right: phone ? -40 : -30, bottom: phone ? -30 : -40, width: phone ? 180 : 280, height: phone ? 195 : 300, opacity: 0.12, pointerEvents: 'none' }} />
    <View style={{ flexDirection: 'row', gap: phone ? 16 : 22 }}>
      <View aria-hidden style={[{ width: 3, borderRadius: 2 }, ground(`linear-gradient(180deg, ${brand.sky}, ${brand.royal})`, brand.sky)]} />
      <View style={{ flex: 1, gap: phone ? 6 : 8 }}>
        {acronym.map((row, index) => <Text key={index} style={{ color: '#FFFFFF', fontSize: size, lineHeight: Math.round(size * 1.22), fontWeight: '700', letterSpacing: -0.4 }}>
          <Text style={{ color: brand.sky, fontWeight: '900' }}>{row.initial}</Text>{row.rest}
        </Text>)}
      </View>
    </View>
  </View>;
}

function HighlightVideo({ dark }: { dark: boolean }) {
  const frame: ViewStyle = { width: '100%', aspectRatio: 16 / 9, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: dark ? '#1F3366' : indigo.line, backgroundColor: hero.bar,
    boxShadow: dark ? '0px 18px 40px rgba(0,0,0,0.35)' : '0px 22px 48px rgba(10,27,77,0.16)' } as ViewStyle;
  if (highlightVideo && Platform.OS === 'web') {
    return <View style={frame}>
      <video src={highlightVideo} controls playsInline preload="metadata" aria-label="LAKAD highlight video" style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: hero.bar }} />
    </View>;
  }
  return <View style={frame} accessibilityLabel="LAKAD highlight video, coming soon">
    <Image source={poster} contentFit="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    <View style={[{ position: 'absolute', inset: 0 }, ground('linear-gradient(160deg, rgba(6,15,46,0.35) 0%, rgba(6,15,46,0.7) 100%)', 'rgba(6,15,46,0.55)')]} />
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <Feather name="play" size={24} color={hero.button} style={{ marginLeft: 3 }} />
        </View>
      </View>
    </View>
    <View style={{ position: 'absolute', left: 18, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(6,15,46,0.7)' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: brand.sky }} />
      <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' }}>Highlight video · coming soon</Text>
    </View>
  </View>;
}

function AccessCard({ icon, title, steps = false, items, note, basis }: { icon: keyof typeof Feather.glyphMap; title: string; steps?: boolean; items: string[]; note: string; basis: `${number}%` }) {
  return <Pressable accessible={false} style={({ hovered }: PressState) => ({ flexBasis: basis, flexGrow: 1, minWidth: 0, padding: 24, borderRadius: 16, overflow: 'hidden',
    backgroundColor: hero.bar, borderWidth: 1, borderColor: hovered ? 'rgba(125,168,255,0.55)' : 'rgba(255,255,255,0.08)',
    boxShadow: hovered ? '0px 18px 38px rgba(6,15,46,0.35)' : '0px 10px 26px rgba(6,15,46,0.18)', transform: [{ translateY: hovered ? -2 : 0 }] })}>
    <View aria-hidden style={{ position: 'absolute', right: -40, top: -20, width: 180, height: 16, backgroundColor: brand.royal, opacity: 0.35, transform: [{ rotate: '-28deg' }], pointerEvents: 'none' }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <View style={[{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, ground(`linear-gradient(135deg, ${hero.buttonHover} 0%, ${brand.royal} 100%)`, brand.royal)]}>
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800' }}>{title}</Text>
    </View>
    <View style={{ gap: 12 }}>
      {items.map((item, index) => <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {steps
          ? <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}><Text style={{ color: hero.bar, fontSize: 13, fontWeight: '800' }}>{index + 1}</Text></View>
          : <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(125,168,255,0.18)' }}><Feather name="check" size={15} color="#9DBBFF" /></View>}
        <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 22, flex: 1, paddingTop: 2 }}>{item}</Text>
      </View>)}
    </View>
    <Text style={{ color: '#B9C9F2', fontSize: 13.5, lineHeight: 20, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>{note}</Text>
  </Pressable>;
}

function Feature({ icon, title, body, index, dark, basis }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; index: number; dark: boolean; basis: `${number}%` }) {
  return <Pressable accessible={false} style={({ hovered }: PressState) => ({ flexBasis: basis, flexGrow: 1, minWidth: 0, padding: 24, borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    borderColor: hovered ? (dark ? '#4E8BFE' : '#A9B4F0') : dark ? '#1F3366' : indigo.line, backgroundColor: dark ? '#0C1A42' : '#FFFFFF',
    boxShadow: hovered ? (dark ? '0px 16px 34px rgba(0,0,0,0.35)' : '0px 18px 38px rgba(10,27,77,0.12)') : dark ? 'none' : '0px 1px 2px rgba(10,27,77,0.04), 0px 8px 22px rgba(10,27,77,0.05)',
    transform: [{ translateY: hovered ? -2 : 0 }] })}>
    {({ hovered }: PressState) => <>
      <View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, opacity: hovered ? 1 : 0 }, brandBar]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View style={[{ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, ground(`linear-gradient(135deg, ${hero.button} 0%, ${brand.royal} 100%)`, hero.button)]}>
          <Feather name={icon} size={21} color="#FFFFFF" />
        </View>
        <Text style={{ color: dark ? '#3B4C80' : '#C3C7E2', fontSize: 15, fontWeight: '800', letterSpacing: 1 }}>{String(index + 1).padStart(2, '0')}</Text>
      </View>
      <Text style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.2 }}>{title}</Text>
      <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: 15, lineHeight: 24, marginTop: 8 }}>{body}</Text>
    </>}
  </Pressable>;
}

function Brand({ dark = false, compact = false, large = false }: { dark?: boolean; compact?: boolean; large?: boolean }) {
  const mark = large ? (compact ? 48 : 64) : compact ? 39 : 51;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : large ? 10 : 11 }}>
    <Image source={logo} contentFit="contain" accessibilityLabel="LAKAD logo" style={{ width: mark, height: Math.round(mark * 1.08) }} />
    <View><Text style={{ color: dark ? '#FFFFFF' : brand.ink, fontWeight: '900', fontSize: large ? (compact ? 28 : 36) : compact ? 23 : 27, letterSpacing: 0.6, lineHeight: large ? (compact ? 31 : 39) : compact ? 26 : 30 }}>LAKAD</Text>
      <Text style={{ color: dark ? (large ? '#FFFFFF' : '#B9C9F2') : brand.royal, fontSize: large ? (compact ? 10.5 : 13) : compact ? 9 : 10, fontWeight: large ? '500' : '600', letterSpacing: 0.2 }}>Where Data Meets the Road</Text></View>
  </View>;
}
function Eyebrow({ children, inverse = false, dark = false }: { children: string; inverse?: boolean; dark?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
    <View style={[{ width: 28, height: 3, borderRadius: 2 }, inverse ? { backgroundColor: brand.sky } : brandBar]} />
    <Text style={{ color: inverse ? '#CFE0FF' : dark ? '#8FB4FF' : brand.royal, fontSize: 11, fontWeight: '800', letterSpacing: 2.2 }}>{children}</Text>
  </View>;
}
function Action({ label, icon, onPress, outline = false, inverse = false, light = false, disabled = false }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; outline?: boolean; inverse?: boolean; light?: boolean; disabled?: boolean }) {
  const solid = !outline && !light;
  const fg = light ? brand.ink : outline && !inverse ? brand.royal : '#FFFFFF';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed, hovered }: PressState) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 48, paddingHorizontal: 22, borderRadius: 10, borderWidth: 1, opacity: disabled ? 0.7 : 1,
    borderColor: solid ? (hovered ? brand.deep : brand.royal) : light ? '#FFFFFF' : inverse ? 'rgba(255,255,255,0.7)' : brand.royal,
    backgroundColor: solid ? (hovered ? brand.deep : brand.royal) : light ? (hovered ? '#EAF1FF' : '#FFFFFF') : hovered ? (inverse ? 'rgba(255,255,255,0.12)' : '#E9F0FE') : 'transparent',
    boxShadow: solid && hovered ? '0px 10px 24px rgba(24,80,224,0.35)' : 'none',
    transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.98 : 1 }] })}>
    <Feather name={icon} size={17} color={fg} />
    <Text style={{ color: fg, fontWeight: '800', fontSize: 14, letterSpacing: 0.1 }}>{label}</Text>
  </Pressable>;
}
function HeroButton({ label, a11y, onPress, outline = false, compact = false }: { label: string; a11y?: string; onPress: () => void; outline?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress}
    style={({ pressed, hovered }: PressState) => ({ minHeight: compact ? 42 : 50, paddingHorizontal: compact ? 16 : 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
      borderColor: outline ? (hovered ? '#FFFFFF' : 'rgba(255,255,255,0.72)') : hero.edge,
      backgroundColor: outline ? (hovered ? 'rgba(255,255,255,0.12)' : 'transparent') : hovered ? hero.buttonHover : hero.button,
      boxShadow: !outline && hovered ? '0px 10px 24px rgba(6,15,46,0.45)' : 'none',
      transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.98 : 1 }] })}>
    <Text style={{ color: '#FFFFFF', fontSize: compact ? 15 : 17, fontWeight: '500' }}>{label}</Text>
  </Pressable>;
}



/** Web3Forms access key from .env. It is public by design; read lazily so Expo inlines it at build time. */
const contactKey = () => process.env.EXPO_PUBLIC_WEB3FORMS_KEY ?? '';
/** Desktop web scale for the landing page (was 1.25; 80% of that). */
const pageZoom = 1;
const faqs: { icon: keyof typeof Feather.glyphMap; question: string; answer: string }[] = [
  { icon: 'key', question: 'Forgot your password or cannot sign in?', answer: 'Ask your administrator to reset it.' },
  { icon: 'alert-triangle', question: 'Found something wrong in a result?', answer: 'Tell your administrator what you were doing.' },
  { icon: 'book-open', question: 'Question about the study?', answer: 'Send it through the form and we will reply by email.' },
];
type ContactValues = { name: string; email: string; subject: string; message: string };
const emptyContact: ContactValues = { name: '', email: '', subject: '', message: '' };

/** Field colours for the form card: light card on the light theme, deep navy card on the dark theme. */
const fieldTone = {
  light: { label: indigo.ink, text: indigo.ink, fill: '#F6F7FC', focusFill: '#FFFFFF', line: indigo.line, focus: brand.royal, ring: 'rgba(24,80,224,0.16)', error: '#B42318' },
  dark: { label: '#FFFFFF', text: '#FFFFFF', fill: '#091536', focusFill: '#0A1A44', line: '#1F3366', focus: '#7DA8FF', ring: 'rgba(125,168,255,0.2)', error: '#FCA5A5' },
} as const;

function ContactField({ label, value, onChange, error, dark, multiline = false, grow = false, extra }: { label: string; value: string; onChange: (text: string) => void; error?: string; dark: boolean; multiline?: boolean; grow?: boolean; extra?: TextInputProps }) {
  const [focused, setFocused] = useState(false);
  const tone = dark ? fieldTone.dark : fieldTone.light;
  return <View style={{ gap: 7, minWidth: 0, ...(grow ? { flexBasis: 170, flexGrow: 1 } : { width: '100%' }) }}>
    <Text style={{ color: tone.label, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    <TextInput accessibilityLabel={label} aria-invalid={Boolean(error)} value={value} onChangeText={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      multiline={multiline} numberOfLines={multiline ? 5 : 1} {...extra}
      style={[{ minHeight: multiline ? 136 : 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, color: tone.text, fontSize: 15.5,
        borderColor: error ? tone.error : focused ? tone.focus : tone.line, backgroundColor: focused ? tone.focusFill : tone.fill },
        multiline ? { textAlignVertical: 'top' } : null,
        Platform.OS === 'web' ? ({ outlineStyle: 'none', boxShadow: focused ? `0px 0px 0px 3px ${tone.ring}` : 'none', transitionDuration: '150ms' } as object) : null]} />
    {error ? <Text style={{ color: tone.error, fontSize: 13 }}>{error}</Text> : null}
  </View>;
}

function ContactSection({ dark, phone, stacked, pad, title }: { dark: boolean; phone: boolean; stacked: boolean; pad: number; title: number }) {
  const [values, setValues] = useState<ContactValues>(emptyContact);
  const [errors, setErrors] = useState<Partial<ContactValues>>({});
  const [trap, setTrap] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [notice, setNotice] = useState('');
  const set = (key: keyof ContactValues) => (text: string) => { setValues(previous => ({ ...previous, [key]: text })); setErrors(previous => ({ ...previous, [key]: undefined })); };

  const submit = async () => {
    if (status === 'sending') return;
    const next: Partial<ContactValues> = {};
    if (!values.name.trim()) next.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (!values.subject.trim()) next.subject = 'Enter a subject.';
    if (values.message.trim().length < 10) next.message = 'Write at least 10 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const accessKey = contactKey();
    if (!accessKey) { setStatus('error'); setNotice('The contact form is not set up yet. Please try again later.'); return; }
    setStatus('sending');
    setNotice('');
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: accessKey, from_name: 'LAKAD landing page', name: values.name.trim(), email: values.email.trim(), subject: `LAKAD contact: ${values.subject.trim()}`, message: values.message.trim(), botcheck: trap.length > 0 }),
      });
      const result = await response.json();
      if (__DEV__) console.debug('Web3Forms response:', response.status, result);
      if (response.ok && result.success) { setValues(emptyContact); setStatus('sent'); return; }
      setStatus('error');
      setNotice('We could not send your message. Please try again.');
    } catch {
      setStatus('error');
      setNotice('Check your internet connection and try again.');
    }
  };

  const tone = dark ? fieldTone.dark : fieldTone.light;
  /** Left column colours: indigo photo ground on dark, white-to-soft-blue ground on light. */
  const side = dark
    ? { head: '#FFFFFF', body: '#DCE6FF', label: '#9DBBFF', answer: '#B9C9F2', line: 'rgba(255,255,255,0.1)', tile: 'rgba(125,168,255,0.14)', tileLine: 'rgba(125,168,255,0.22)', icon: '#9DBBFF' }
    : { head: indigo.ink, body: indigo.body, label: indigo.accent, answer: indigo.body, line: indigo.line, tile: '#E9F0FE', tileLine: indigo.line, icon: indigo.accent };
  const groundFill = dark
    ? (stacked ? 'linear-gradient(180deg, rgba(6,15,46,0.97) 0%, rgba(6,15,46,0.94) 55%, rgba(14,40,140,0.9) 100%)' : 'linear-gradient(100deg, rgba(6,15,46,0.98) 0%, rgba(6,15,46,0.95) 48%, rgba(24,80,224,0.78) 100%)')
    : (stacked ? 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 50%, #E4ECFF 100%)' : 'linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 46%, #E4ECFF 100%)');

  const inner = <View style={[{ paddingVertical: phone ? 60 : 96 }, ground(groundFill, dark ? 'rgba(6,15,46,0.95)' : '#FFFFFF')]}>
      <View style={{ width: '100%', maxWidth: 1600, alignSelf: 'center', paddingHorizontal: pad, flexDirection: stacked ? 'column' : 'row', gap: stacked ? 40 : 72, alignItems: stacked ? 'stretch' : 'center' }}>

        <View style={stacked ? {} : { flex: 1 }}>
          <Eyebrow inverse={dark}>CONTACT</Eyebrow>
          <Text accessibilityRole="header" style={{ color: side.head, fontSize: title, lineHeight: Math.round(title * 1.2), fontWeight: '800', letterSpacing: -0.6 }}>Need Help with LAKAD?</Text>
          <Text style={{ color: side.body, fontSize: phone ? 15 : 16.5, lineHeight: phone ? 24 : 26, marginTop: 14, maxWidth: 520 }}>Accounts are created by your administrator. For anything else, check the common questions below or send us a message.</Text>

          <Text style={{ color: side.label, fontSize: 12, fontWeight: '800', letterSpacing: 1.8, marginTop: phone ? 34 : 44, marginBottom: 4 }}>MOST FREQUENTLY ASKED</Text>
          {faqs.map(item => <View key={item.question} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderColor: side.line }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: side.tile, borderWidth: 1, borderColor: side.tileLine }}>
              <Feather name={item.icon} size={18} color={side.icon} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: side.head, fontSize: 16.5, lineHeight: 23, fontWeight: '800' }}>{item.question}</Text>
              <Text style={{ color: side.answer, fontSize: 15, lineHeight: 23 }}>{item.answer}</Text>
            </View>
          </View>)}
        </View>

        <View style={[{ borderRadius: 20, padding: phone ? 22 : 34, backgroundColor: dark ? '#0C1A42' : '#FFFFFF', borderWidth: 1, borderColor: dark ? '#1F3366' : indigo.line,
          boxShadow: dark ? '0px 30px 60px rgba(3,8,26,0.45)' : '0px 24px 56px rgba(10,27,77,0.12)' } as ViewStyle, stacked ? {} : { flex: 1 }]}>
          {status === 'sent' ? <View accessibilityLiveRegion="polite" style={{ alignItems: 'flex-start', gap: 12, paddingVertical: phone ? 8 : 24 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(125,168,255,0.14)' : '#E9F0FE' }}><Feather name="check-circle" size={26} color={tone.focus} /></View>
            <Text style={{ color: tone.label, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>Message sent</Text>
            <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: 15.5, lineHeight: 24 }}>Thank you. We received your message and will reply by email.</Text>
            <View style={{ marginTop: 8 }}><Action label="Send another message" icon="edit-3" onPress={() => { setStatus('idle'); setNotice(''); }} outline inverse={dark} /></View>
          </View> : <View style={{ gap: 16 }}>
            <View style={{ marginBottom: 4 }}>
              <Text accessibilityRole="header" style={{ color: tone.label, fontSize: phone ? 21 : 24, fontWeight: '800', letterSpacing: -0.3 }}>Send a Message</Text>
              <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: 14.5, marginTop: 4 }}>All fields are required.</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <ContactField dark={dark} label="Name" value={values.name} onChange={set('name')} error={errors.name} grow extra={{ autoComplete: 'name', textContentType: 'name' }} />
              <ContactField dark={dark} label="Email" value={values.email} onChange={set('email')} error={errors.email} grow extra={{ autoComplete: 'email', keyboardType: 'email-address', autoCapitalize: 'none', textContentType: 'emailAddress' }} />
            </View>
            <ContactField dark={dark} label="Subject" value={values.subject} onChange={set('subject')} error={errors.subject} />
            <ContactField dark={dark} label="Message" value={values.message} onChange={set('message')} error={errors.message} multiline />
            {/* Spam trap: hidden from people and screen readers; bots fill it in. Sent as Web3Forms' botcheck field so their server filters it. */}
            <TextInput aria-hidden tabIndex={-1} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden autoComplete="off" value={trap} onChangeText={setTrap} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            {status === 'error' ? <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="alert-circle" size={16} color={tone.error} /><Text style={{ color: tone.error, fontSize: 14.5, flexShrink: 1 }}>{notice}</Text></View> : null}
            <View style={{ marginTop: 4 }}><Action label={status === 'sending' ? 'Sending…' : 'Send message'} icon="send" onPress={() => void submit()} disabled={status === 'sending'} /></View>
          </View>}
        </View>
      </View>
    </View>;
  // Dark mode keeps the road photo under the indigo wash; light mode is a clean white-to-blue ground.
  return dark
    ? <ImageBackground source={road} contentFit="cover" style={{ width: '100%' }}>{inner}</ImageBackground>
    : <View style={{ width: '100%', borderTopWidth: 1, borderColor: indigo.line }}>{inner}</View>;
}

/** Sun/moon switch in the header; matches the Sign In button's indigo fill. */
function ThemeToggle({ dark, onPress, compact = false }: { dark: boolean; onPress?: () => void; compact?: boolean }) {
  const size = compact ? 42 : 50;
  return <Pressable accessibilityRole="button" accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'} onPress={onPress}
    style={({ pressed, hovered }: PressState) => ({ width: size, height: size, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
      borderColor: hovered ? 'rgba(255,255,255,0.4)' : hero.edge, backgroundColor: hovered ? hero.buttonHover : hero.button,
      boxShadow: hovered ? '0px 10px 24px rgba(6,15,46,0.45)' : 'none',
      transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.94 : 1 }] })}>
    {({ hovered }: PressState) => <Feather name={dark ? 'sun' : 'moon'} size={compact ? 18 : 20} color={dark ? '#FFD66B' : '#FFFFFF'}
      style={{ transform: [{ rotate: hovered ? (dark ? '45deg' : '-18deg') : '0deg' }] }} />}
  </Pressable>;
}

export default function LandingPage() {
  const router = useRouter();
  const { role, session } = useAuth();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const dark = colorScheme === 'dark', phone = width < 690, compactHeader = width < 860, stacked = width < 1000;
  const background = dark ? '#060F2E' : '#F3F6FC';
  /** Row ratios only apply side by side; stacked blocks keep their natural height. */
  const cols = (ratio: number) => (stacked ? {} : { flex: ratio });
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [positions, setPositions] = useState<Partial<Record<Section, number>>>({ home: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const openApp = () => router.navigate(session && role ? homeForRole(role) : '/login');
  const [active, setActive] = useState<Section>('home');
  /** Height of the sticky header bar; section jumps stop below it so headings are not hidden behind it. */
  const [barHeight, setBarHeight] = useState(0);
  const sectionY = (target: Section) => Math.max(0, (positions[target] ?? 0) - (target === 'home' ? 0 : barHeight));
  const jump = (target: Section) => { scrollRef.current?.scrollTo({ y: sectionY(target), animated: true }); setActive(target); setMenuOpen(false); };
  /** Opening /#contact (the sign-in page's "Contact your system administrator" link) scrolls to Contact once it is measured. */
  const hashJumped = useRef(false);
  const contactY = positions.contact;
  useEffect(() => {
    if (hashJumped.current || contactY == null || !barHeight || Platform.OS !== 'web' || typeof window === 'undefined' || window.location.hash !== '#contact') return;
    hashJumped.current = true;
    const timer = setTimeout(() => { scrollRef.current?.scrollTo({ y: Math.max(0, contactY - barHeight), animated: true }); setActive('contact'); }, 150);
    return () => clearTimeout(timer);
  }, [contactY, barHeight]);
  /** Highlights the section under the sticky header; the last section wins at the bottom of the page. */
  const track = (event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
    const current = atEnd ? 'contact' : nav.reduce<Section>((found, item) => (positions[item.target] ?? Infinity) <= contentOffset.y + 140 ? item.target : found, 'home');
    if (current !== active) setActive(current);
  };
  const mark = (target: Section) => ({ onLayout: (event: { nativeEvent: { layout: { y: number } } }) => {
    const y = event.nativeEvent.layout.y;
    setPositions(previous => previous[target] === y ? previous : { ...previous, [target]: y });
  } });
  const navLinks = nav.map(item => {
    const current = item.target === active;
    return <Pressable key={item.target} accessibilityRole="link" aria-current={current ? 'location' : undefined} onPress={() => jump(item.target)} style={{ minHeight: 44, justifyContent: 'center' }}>
      {({ hovered }: PressState) => <View>
        {/* An invisible bold copy reserves the bold width, so links never shift when one turns bold. */}
        <Text aria-hidden importantForAccessibility="no" style={{ fontSize: compactHeader ? 16 : 17, fontWeight: '800', opacity: 0 }}>{item.label}</Text>
        <Text style={{ position: 'absolute', left: 0, right: 0, textAlign: compactHeader ? 'left' : 'center', color: current || hovered ? '#FFFFFF' : 'rgba(255,255,255,0.74)', fontSize: compactHeader ? 16 : 17, fontWeight: current ? '800' : '500' }}>{item.label}</Text>
      </View>}
    </Pressable>;
  });
  const effectiveWidth = Platform.OS === 'web' && width >= 1000 ? width / pageZoom : width;
  const heroPad = phone ? 20 : stacked ? 40 : 64;
  /** The acronym panel needs room for "Konditioning" on one line, so About stacks earlier than other rows. */
  const aboutStacked = stacked || effectiveWidth < 1100;
  /** Sized so "A Smarter Approach to Road Pavement Management" fits on one line on desktop. */
  const sectionTitle = phone ? 29 : Math.min(44, Math.max(30, Math.floor((effectiveWidth - heroPad * 2) / 26.5)));
  const headline = phone ?(width < 390 ? 27 : 30) : Math.min(58, Math.max(34, Math.floor((effectiveWidth - heroPad * 2) / 18.6)));

  return <ScrollView ref={scrollRef} stickyHeaderIndices={[0]} onScroll={track} scrollEventThrottle={64}style={[{ flex: 1, backgroundColor: background }, Platform.OS === 'web' && width >= 1000 ? { zoom: pageZoom } as any : null]} contentContainerStyle={{ flexGrow: 1 }} accessibilityLabel="LAKAD landing page">
    <View {...mark('home')} style={{ backgroundColor: hero.bar }}>
      <View onLayout={event => { const h = event.nativeEvent.layout.height; setBarHeight(previous => previous === h ? previous : h); }} style={{ width: '100%', maxWidth: 1600, alignSelf: 'center', paddingLeft: phone ? 14 : 12, paddingRight: phone ? 14 : stacked ? 24 : 44, minHeight: compactHeader ? 72 : 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Brand compact={compactHeader} dark large />
        {!compactHeader && <View accessibilityRole="navigation" accessibilityLabel="Landing page navigation" style={{ flexDirection: 'row', gap: stacked ? 26 : 42 }}>{navLinks}</View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: compactHeader ? 6 : 10 }}>
          {compactHeader && <Pressable accessibilityRole="button" accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'} onPress={() => setMenuOpen(!menuOpen)} style={({ hovered }: PressState) => ({ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? 'rgba(255,255,255,0.1)' : 'transparent' })}><Feather name={menuOpen ? 'x' : 'menu'} size={22} color="#FFFFFF" /></Pressable>}
          {/* Phones have no room in the bar; the toggle moves into the menu panel there. */}
          {!phone && <ThemeToggle dark={dark} onPress={toggleColorScheme} compact={compactHeader} />}
          <View style={{ minWidth: compactHeader ? 0 : 130 }}><HeroButton label={session && role ? 'Workspace' : 'Sign In'} a11y={session && role ? 'Open my workspace' : 'Sign in'} onPress={openApp} compact={compactHeader} /></View>
        </View>
      </View>
      {compactHeader && menuOpen && <View accessibilityRole="navigation" accessibilityLabel="Landing page navigation" style={{ paddingHorizontal: phone ? 20 : 24, paddingBottom: 14, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>{navLinks}
        {phone && <Pressable accessibilityRole="button" accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'} onPress={toggleColorScheme}
          style={({ hovered }: PressState) => ({ minHeight: 48, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', gap: 12, opacity: hovered ? 1 : 0.92 })}>
          <View style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.button, borderWidth: 1, borderColor: hero.edge }}>
            <Feather name={dark ? 'sun' : 'moon'} size={16} color={dark ? '#FFD66B' : '#FFFFFF'} />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>{dark ? 'Light mode' : 'Dark mode'}</Text>
        </Pressable>}
      </View>}
    </View>

    <ImageBackground source={road} contentFit="cover" accessibilityLabel="Illustrative mountain road" style={{ minHeight: phone ? 560 : stacked ? 540 : 580 }}>
      <View style={[{ flex: 1 }, ground(phone ? 'linear-gradient(180deg, rgba(6,15,46,0.64) 0%, rgba(6,15,46,0.42) 60%, rgba(6,15,46,0.3) 100%)' : 'linear-gradient(90deg, rgba(6,15,46,0.58) 0%, rgba(6,15,46,0.32) 55%, rgba(6,15,46,0.14) 100%)', 'rgba(6,15,46,0.42)')]}>
        <View style={{ flex: 1, width: '100%', maxWidth: 1600, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: heroPad, paddingTop: phone ? 56 : 64, paddingBottom: phone ? 40 : 84 }}>
          <Text style={{ color: '#FFFFFF', fontSize: phone ? 13 : 17, fontWeight: '700', letterSpacing: 0.3, marginBottom: phone ? 18 : 26 }}>ROAD INSPECTION & PAVEMENT MANAGEMENT</Text>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: headline, lineHeight: Math.round(headline * 1.2), fontWeight: '700', letterSpacing: phone ? 0.2 : 0.8, textTransform: 'uppercase' }}>{phone ? 'Better Road Decisions Start With Better Inspections' : 'Better Road Decisions\nStart With Better Inspections'}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: phone ? 15 : 17, lineHeight: phone ? 23 : 26, marginTop: phone ? 18 : 30, maxWidth: 640 }}>Record inspections, Compute PCI, and Generate reports in one place.</Text>
          <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: phone ? 'nowrap' : 'wrap', alignItems: phone ? 'stretch' : 'flex-start', gap: phone ? 10 : 8, marginTop: phone ? 26 : 50 }}>
            <HeroButton label="Access Your Workspace" onPress={openApp} />
            <HeroButton label="PCI Automation Workflow" onPress={() => router.push('/prototype')} outline />
          </View>
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6, ...(phone ? { paddingHorizontal: heroPad, paddingBottom: 28 } : { position: 'absolute', right: stacked ? 24 : 54, bottom: 30 }) }}>
          <Feather name="map-pin" size={phone ? 13 : 15} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: phone ? 13 : 15, fontWeight: '300' }}>Barangay Mamatid, Cabuyao, Laguna.</Text>
        </View>
      </View>
    </ImageBackground>

    <View {...mark('features')} style={{ backgroundColor: dark ? background : '#F1F2F8', paddingVertical: phone ? 60 : 88 }}><View style={{ width: '100%', maxWidth: 1600, alignSelf: 'center', paddingHorizontal: heroPad }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <Text style={{ color: dark ? '#7DA8FF' : indigo.accent, fontSize: phone ? 14 : 16, fontWeight: '800', letterSpacing: 0.6 }}>WHY CHOOSE LAKAD?</Text>
        <View style={[{ width: 64, height: 3, borderRadius: 2 }, brandBar]} />
      </View>
      <Text accessibilityRole="header" style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: sectionTitle, lineHeight: Math.round(sectionTitle * 1.2), fontWeight: '800', letterSpacing: -0.6 }}>A Smarter Approach to Road Pavement Management</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: phone ? 28 : 40 }}>
        {features.map((item, index) => <Feature key={item.title} {...item} index={index} dark={dark} basis={phone ? '100%' : stacked ? '45%' : '30%'} />)}
      </View>
    </View></View>

    <View {...mark('roads')} style={{ backgroundColor: dark ? '#081232' : '#FFFFFF', paddingVertical: phone ? 60 : 88 }}><View style={{ width: '100%', maxWidth: 1600, alignSelf: 'center', paddingHorizontal: heroPad }}>
      {/* Stacked layouts show the heading first, then the video. */}
      <View style={{ flexDirection: stacked ? 'column-reverse' : 'row', gap: stacked ? 30 : 56, alignItems: stacked ? 'stretch' : 'center' }}>
        <View style={{ ...cols(1.25), gap: 12 }}>
          <HighlightVideo dark={dark} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="globe" size={15} color={dark ? '#7DA8FF' : indigo.accent} />
            <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: 14, flexShrink: 1 }}>Runs in any modern browser. All you need is an internet connection and your account.</Text>
          </View>
        </View>
        <View style={{ ...cols(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Text style={{ color: dark ? '#7DA8FF' : indigo.accent, fontSize: phone ? 14 : 16, fontWeight: '800', letterSpacing: 0.6 }}>HIGHLIGHT</Text>
            <View style={[{ width: 64, height: 3, borderRadius: 2 }, brandBar]} />
          </View>
          <Text accessibilityRole="header" style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: sectionTitle, lineHeight: Math.round(sectionTitle * 1.2), fontWeight: '800', letterSpacing: -0.6 }}>LAKAD in Action</Text>
          <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: phone ? 15 : 16.5, lineHeight: phone ? 24 : 26, marginTop: 14 }}>A quick look at what LAKAD can do, from the road to the final report.</Text>
          <View style={{ gap: 14, marginTop: 26 }}>
            {highlights.map(item => <View key={item.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(78,139,254,0.14)' : '#E9F0FE' }}>
                <Feather name={item.icon} size={18} color={dark ? '#7DA8FF' : indigo.accent} />
              </View>
              <Text style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: phone ? 15 : 16.5, fontWeight: '600', flexShrink: 1 }}>{item.title}</Text>
            </View>)}
          </View>
          <Text style={{ color: dark ? '#7DA8FF' : brand.royal, fontSize: 15, fontWeight: '700', marginTop: 26 }}>From inspection to PCI results in minutes.</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: dark ? '#1F3366' : indigo.line, marginVertical: phone ? 36 : 48 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
        {accessCards.map((card, index) => <AccessCard key={card.title} {...card} basis={phone || (stacked && index === 0) ? '100%' : stacked ? '45%' : '30%'} />)}
      </View>
    </View></View>

    <View {...mark('about')} style={{ backgroundColor: background, paddingVertical: phone ? 60 : 88 }}><View style={{ width: '100%', maxWidth: 1600, alignSelf: 'center', paddingHorizontal: heroPad }}>
      {/* Stacked layouts show the heading first, then the acronym panel. */}
      <View style={{ flexDirection: aboutStacked ? 'column' : 'row', gap: aboutStacked ? 30 : 64, alignItems: aboutStacked ? 'stretch' : 'center' }}>
        <View style={aboutStacked ? {} : { flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Text style={{ color: dark ? '#7DA8FF' : indigo.accent, fontSize: phone ? 14 : 16, fontWeight: '800', letterSpacing: 0.6 }}>ABOUT LAKAD</Text>
            <View style={[{ width: 64, height: 3, borderRadius: 2 }, brandBar]} />
          </View>
          <Text accessibilityRole="header" style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: sectionTitle, lineHeight: Math.round(sectionTitle * 1.2), fontWeight: '800', letterSpacing: -0.6 }}>What LAKAD Stands For</Text>
          <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: phone ? 15 : 16.5, lineHeight: phone ? 24 : 26, marginTop: 14, maxWidth: 520 }}>LAKAD is a web-based system for road inspection and maintenance prioritization, built for any local road network.</Text>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: phone ? 24 : 32, paddingVertical: 4, maxWidth: 520 }}>
            <View style={[{ width: 3, borderRadius: 2 }, brandBar]} />
            <Text style={{ flex: 1, color: dark ? '#FFFFFF' : indigo.ink, fontSize: phone ? 15.5 : 17, lineHeight: phone ? 24 : 27, fontWeight: '600' }}>
              <Text style={{ color: dark ? '#7DA8FF' : brand.royal, fontWeight: '800' }}>Lakad</Text> is a Filipino word for walk, because every inspection starts on foot.
            </Text>
          </View>
        </View>
        <View style={aboutStacked ? {} : { flex: 1.1 }}><AcronymPanel dark={dark} phone={phone} /></View>
      </View>

      <View style={{ flexDirection: phone ? 'column' : 'row', gap: phone ? 0 : 32, marginTop: phone ? 40 : 64 }}>
        {aboutPoints.map(point => <View key={point.title} style={{ ...(phone ? {} : { flex: 1 }), minWidth: 0, borderTopWidth: 1, borderColor: dark ? '#1F3366' : indigo.line, paddingTop: 22, paddingBottom: phone ? 26 : 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(78,139,254,0.14)' : '#E9F0FE' }}>
              <Feather name={point.icon} size={18} color={dark ? '#7DA8FF' : indigo.accent} />
            </View>
            <Text style={{ color: dark ? '#FFFFFF' : indigo.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 }}>{point.title}</Text>
          </View>
          <Text style={{ color: dark ? '#A8B5D6' : indigo.body, fontSize: 15, lineHeight: 24 }}>{point.body}</Text>
        </View>)}
      </View>
    </View></View>

    <View {...mark('contact')}><ContactSection dark={dark} phone={phone} stacked={aboutStacked} pad={heroPad} title={sectionTitle} /></View>

  </ScrollView>;
}
