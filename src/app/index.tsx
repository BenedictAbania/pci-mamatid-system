import { Feather } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { homeForRole } from '@/lib/auth/access';
import { layout } from '@/lib/ui/design-system';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';

const road = require('../../assets/images/lakad_landing_road.png');
const logo = require('../../assets/images/LAKAD.png');
const navy = layout.navy.sidebar;
type Section = 'home' | 'features' | 'roads' | 'about' | 'contact';
const nav: { label: string; target: Section }[] = [
  { label: 'Home', target: 'home' }, { label: 'Features', target: 'features' },
  { label: 'Road Sections', target: 'roads' }, { label: 'About', target: 'about' },
  { label: 'Contact', target: 'contact' },
];

function Brand({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 11 }}>
    <Image source={logo} contentFit="contain" accessibilityLabel="LAKAD logo" style={{ width: compact ? 39 : 51, height: compact ? 42 : 55 }} />
    <View><Text style={{ color: dark ? '#FFFFFF' : '#102849', fontWeight: '900', fontSize: compact ? 23 : 27, letterSpacing: 0.4 }}>LAKAD</Text>
      <Text style={{ color: dark ? '#D8E5F0' : '#496987', fontSize: compact ? 9 : 10 }}>Where Data Meets the Road</Text></View>
  </View>;
}
function Eyebrow({ children, inverse = false }: { children: string; inverse?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
    <Text style={{ color: inverse ? '#E6F1FA' : '#35597C', fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>{children}</Text>
    <View style={{ width: 31, height: 2, backgroundColor: inverse ? '#D6E8F6' : '#54799B' }} />
  </View>;
}
function Action({ label, icon, onPress, outline = false, inverse = false, light = false }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; outline?: boolean; inverse?: boolean; light?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 47, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: inverse || light ? '#E3EDF6' : '#244B70', backgroundColor: light ? '#FFFFFF' : outline ? 'transparent' : navy, opacity: pressed ? 0.8 : 1 })}>
    <Feather name={icon} size={17} color={light || (outline && !inverse) ? navy : '#FFFFFF'} />
    <Text style={{ color: light || (outline && !inverse) ? navy : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>{label}</Text>
  </Pressable>;
}
function Benefit({ icon, title, body, dark = false, grow = true }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; dark?: boolean; grow?: boolean }) {
  return <View style={{ ...(grow ? { flex: 1 } : {}), minWidth: 205, flexDirection: 'row', gap: 14, padding: 18, borderRadius: 15, borderWidth: 1,
    borderColor: dark ? '#35536B' : '#E2E9EF', backgroundColor: dark ? '#203A50' : '#FFFFFF', boxShadow: '0 7px 22px rgba(16,40,73,0.06)' }}>
    <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#375976' : '#E8F1F8' }}><Feather name={icon} size={23} color={dark ? '#EEF5FB' : '#244B70'} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={{ color: dark ? '#FFFFFF' : '#102849', fontSize: 15, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: dark ? '#D6E4EE' : '#4C657D', fontSize: 13, lineHeight: 20 }}>{body}</Text></View>
  </View>;
}
function Insight({ title, body, icon, photo, dark = false }: { title: string; body: string; icon: keyof typeof Feather.glyphMap; photo?: boolean; dark?: boolean }) {
  return <View style={{ flex: 1, minWidth: 205, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: dark ? '#35536B' : '#E2E9EF', backgroundColor: dark ? '#203A50' : '#FFFFFF' }}>
    {photo ? <Image source={road} contentFit="cover" accessibilityLabel="Illustrative road photograph" style={{ width: '100%', height: 125 }} />
      : <View style={{ height: 125, backgroundColor: dark ? '#2B4B67' : '#DFECF6', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 65, height: 65, borderRadius: 33, backgroundColor: dark ? '#3F6381' : '#F6FAFD', alignItems: 'center', justifyContent: 'center' }}><Feather name={icon} size={30} color={dark ? '#F1F7FC' : '#244B70'} /></View>
      </View>}
    <View style={{ padding: 16, gap: 7 }}><Text style={{ color: dark ? '#FFFFFF' : '#102849', fontWeight: '800', fontSize: 16 }}>{title}</Text>
      <Text style={{ color: dark ? '#D1DFEB' : '#4D667E', fontSize: 13, lineHeight: 20 }}>{body}</Text></View>
  </View>;
}

export default function LandingPage() {
  const router = useRouter();
  const { role, session } = useAuth();
  const { colorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const dark = colorScheme === 'dark', phone = width < 690, compactHeader = width < 860, stacked = width < 1000;
  const ink = dark ? '#F5F8FB' : '#102849', muted = dark ? '#C8D8E5' : '#4C657D';
  const surface = dark ? '#172E43' : '#FFFFFF', background = dark ? '#102334' : '#F6F9FC';
  const content = { width: '100%' as const, maxWidth: 1250, alignSelf: 'center' as const, paddingHorizontal: phone ? 22 : 42 };
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [positions, setPositions] = useState<Partial<Record<Section, number>>>({ home: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const openApp = () => router.navigate(session && role ? homeForRole(role) : '/login');
  const jump = (target: Section) => { scrollRef.current?.scrollTo({ y: positions[target] ?? 0, animated: true }); setMenuOpen(false); };
  const mark = (target: Section) => ({ onLayout: (event: { nativeEvent: { layout: { y: number } } }) => {
    const y = event.nativeEvent.layout.y;
    setPositions(previous => previous[target] === y ? previous : { ...previous, [target]: y });
  } });
  const navLinks = nav.map(item => <Pressable key={item.target} accessibilityRole="link" onPress={() => jump(item.target)} style={{ minHeight: 43, justifyContent: 'center' }}>
    <Text style={{ color: ink, fontSize: 13, fontWeight: item.target === 'home' ? '800' : '500' }}>{item.label}</Text></Pressable>);

  return <ScrollView ref={scrollRef} stickyHeaderIndices={[0]} style={[{ flex: 1, backgroundColor: background }, Platform.OS === 'web' && width >= 1000 ? { zoom: 1.25 } as any : null]} contentContainerStyle={{ flexGrow: 1 }} accessibilityLabel="LAKAD landing page">
    <View {...mark('home')} style={{ backgroundColor: surface, borderBottomWidth: 1, borderColor: dark ? '#2F4A61' : '#E6EDF3' }}>
      <View style={[content, { minHeight: phone ? 70 : 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }]}>
        <Brand compact={compactHeader} />
        {!compactHeader && <View accessibilityRole="navigation" accessibilityLabel="Landing page navigation" style={{ flexDirection: 'row', gap: stacked ? 16 : 27 }}>{navLinks}</View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {compactHeader && <Pressable accessibilityRole="button" accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'} onPress={() => setMenuOpen(!menuOpen)} style={{ width: 43, height: 43, alignItems: 'center', justifyContent: 'center' }}><Feather name={menuOpen ? 'x' : 'menu'} size={22} color={ink} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={session && role ? 'Open my workspace' : 'Sign in'} onPress={openApp} style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: compactHeader ? 11 : 17, borderRadius: 8, backgroundColor: navy, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
            <Feather name="log-in" size={16} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>{session && role ? 'Workspace' : 'Sign In'}</Text>
          </Pressable>
        </View>
      </View>
      {compactHeader && menuOpen && <View accessibilityRole="navigation" accessibilityLabel="Landing page navigation" style={{ paddingHorizontal: phone ? 22 : 42, paddingBottom: 12, borderTopWidth: 1, borderColor: dark ? '#2F4A61' : '#E6EDF3' }}>{navLinks}</View>}
    </View>

    <ImageBackground source={road} contentFit="cover" accessibilityLabel="Illustrative mountain road" style={{ minHeight: phone ? 480 : 450 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,25,50,0.18)' }}><View style={[content, { flex: 1, justifyContent: 'center', paddingVertical: phone ? 53 : 70 }]}>
        <View style={{ maxWidth: 630 }}><Eyebrow inverse>ROAD INSPECTION & PAVEMENT MANAGEMENT</Eyebrow>
          <Text style={{ color: '#FFFFFF', fontSize: phone ? width < 390 ? 35 : 40 : stacked ? 52 : 61, lineHeight: phone ? width < 390 ? 39 : 46 : stacked ? 58 : 67, fontWeight: '900', letterSpacing: -1.6 }}>Smarter Roads{'\n'}Through Better Data</Text>
          <Text style={{ color: '#E9F1F8', fontSize: phone ? 16 : 17, lineHeight: 26, marginTop: 17, maxWidth: 525 }}>Organize road sections, capture inspection evidence, and guide maintenance decisions with a clear review trail.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 25 }}><Action label={session && role ? 'Open my workspace' : 'Start inspection'} icon="arrow-right" onPress={openApp} inverse />
            <Action label="Learn more" icon="play" onPress={() => jump('features')} outline inverse /></View>
        </View>
        <View style={{ position: 'absolute', left: phone ? 22 : undefined, right: phone ? 22 : 42, bottom: 19, flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', justifyContent: phone ? 'flex-start' : 'flex-end' }}><Feather name="map-pin" size={14} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 12, flexShrink: 1 }}>Illustrative road scene · Serving Barangay Mamatid, Cabuyao</Text></View>
      </View></View>
    </ImageBackground>

    <View {...mark('features')} style={{ backgroundColor: background, paddingVertical: phone ? 54 : 72 }}><View style={[content, { flexDirection: stacked ? 'column' : 'row', gap: 31 }]}>
      <View style={{ flex: 0.85, minWidth: 245 }}><Eyebrow>WHY CHOOSE LAKAD</Eyebrow>
        <Text style={{ color: ink, fontSize: phone ? 31 : 36, lineHeight: phone ? 36 : 41, fontWeight: '900', maxWidth: 460 }}>A Smarter Approach to Road Management</Text>
        <Text style={{ color: muted, fontSize: 15, lineHeight: 23, marginTop: 19, maxWidth: 470 }}>LAKAD helps the barangay organize roads, plan inspections, record field observations, and review revisions before results can be published.</Text>
      </View>
      <View style={{ flex: 1.15, gap: 12 }}><Benefit icon="clipboard" title="Standardized inspection" body="Collect sample details, distress measurements, and private evidence in a guided field workflow." dark={dark} grow={false} />
        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}><Benefit icon="bar-chart-2" title="Provisional PCI review" body="Inspect calculation traces while reference validation remains pending." dark={dark} />
          <Benefit icon="check-circle" title="Controlled publication" body="Reviewer approval and publication are separate, permission-checked actions." dark={dark} /></View>
      </View>
    </View></View>

    <View style={{ backgroundColor: dark ? '#172E43' : '#EBF2F8', paddingVertical: 25 }}><View style={[content, { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }]}>
      {[
        { icon: 'git-branch' as const, title: 'Road inventory', body: 'Branches and sections registered by a Civil Engineer' },
        { icon: 'clipboard' as const, title: 'Sample inspections', body: 'Assigned field work with saved revisions' },
        { icon: 'check-square' as const, title: 'Independent review', body: 'Return, correction, and approval controls' },
        { icon: 'bar-chart-2' as const, title: 'Published priorities', body: 'Visible only when eligible results exist' },
      ].map(item => <View key={item.title} style={{ flex: 1, minWidth: 180, flexDirection: 'row', gap: 12, paddingVertical: 10 }}>
        <View style={{ width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#31516C' : '#DFEBF5' }}><Feather name={item.icon} size={21} color={dark ? '#EDF5FB' : '#244B70'} /></View>
        <View style={{ flex: 1 }}><Text style={{ color: ink, fontSize: 15, fontWeight: '800' }}>{item.title}</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{item.body}</Text></View>
      </View>)}
    </View></View>

    <View {...mark('roads')} style={{ backgroundColor: dark ? '#102334' : '#F4F8FB', paddingVertical: phone ? 54 : 70 }}><View style={[content, { flexDirection: stacked ? 'column' : 'row', gap: 28 }]}>
      <View style={{ flex: 0.72, minWidth: 240, justifyContent: 'center' }}><Eyebrow>ROAD INSIGHTS</Eyebrow>
        <Text style={{ color: ink, fontSize: phone ? 30 : 34, lineHeight: phone ? 35 : 39, fontWeight: '900' }}>Turn Road Data into Clear Insights</Text>
        <Text style={{ color: muted, fontSize: 15, lineHeight: 23, marginTop: 16, marginBottom: 23 }}>Civil Engineers register road sections. Authorized teams inspect them, review evidence, and use eligible published results for planning.</Text>
        <View style={{ alignSelf: 'flex-start' }}><Action label="Explore road sections" icon="arrow-right" onPress={openApp} /></View>
      </View>
      <View style={{ flex: 1.28, flexDirection: phone ? 'column' : 'row', gap: 13 }}><Insight title="Road section inventory" body="Browse registered sections after sign-in, within your role's permissions." icon="map-pin" photo dark={dark} />
        <Insight title="Inspection register" body="Track planned, draft, submitted, and returned sample work." icon="file-text" dark={dark} />
        <Insight title="Maintenance priorities" body="View section rankings when validated, approved results are eligible." icon="alert-triangle" dark={dark} /></View>
    </View></View>

    <View {...mark('about')} style={{ backgroundColor: surface, paddingVertical: phone ? 54 : 69 }}><View style={[content, { flexDirection: stacked ? 'column' : 'row', gap: 31 }]}>
      <View style={{ flex: 0.7, minWidth: 230 }}><Eyebrow>HOW IT WORKS</Eyebrow><Text style={{ color: ink, fontSize: phone ? 30 : 34, lineHeight: phone ? 35 : 39, fontWeight: '900' }}>A Clear Workflow for Better Roads</Text>
        <Text style={{ color: muted, fontSize: 15, lineHeight: 23, marginTop: 16 }}>From road setup to publication, each role has a defined task and review boundary.</Text></View>
      <View style={{ flex: 1.3, flexDirection: phone ? 'column' : 'row', gap: 17 }}>
        {[
          { icon: 'layers' as const, title: 'Plan', body: 'Civil Engineers register sections and assign sample work.' },
          { icon: 'edit-3' as const, title: 'Inspect', body: 'Field Inspectors save measurements and submit revisions.' },
          { icon: 'check-circle' as const, title: 'Review', body: 'Civil Engineers return or approve eligible results.' },
          { icon: 'bar-chart-2' as const, title: 'Share', body: 'Only published, approved results reach Viewers.' },
        ].map((step, i) => <View key={step.title} style={{ flex: 1, minWidth: 125, alignItems: phone ? 'flex-start' : 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: '#FFFFFF', backgroundColor: '#315C85', borderRadius: 15, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>
            <View style={{ width: 53, height: 53, borderRadius: 27, backgroundColor: dark ? '#2D4B65' : '#E5F0F8', alignItems: 'center', justifyContent: 'center' }}><Feather name={step.icon} size={23} color={dark ? '#EEF5FB' : '#244B70'} /></View></View>
          <Text style={{ color: ink, fontSize: 16, fontWeight: '800', textAlign: phone ? 'left' : 'center' }}>{step.title}</Text><Text style={{ color: muted, fontSize: 13, lineHeight: 19, textAlign: phone ? 'left' : 'center' }}>{step.body}</Text>
        </View>)}
      </View>
    </View></View>

    <ImageBackground {...mark('contact')} source={road} contentFit="cover" style={{ minHeight: phone ? 285 : 210 }}><View style={{ flex: 1, backgroundColor: 'rgba(7,31,57,0.75)', justifyContent: 'center', paddingVertical: 34 }}>
      <View style={[content, { flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 23 }]}>
        <View style={{ maxWidth: 620 }}><Eyebrow inverse>READY FOR BETTER ROADS?</Eyebrow><Text style={{ color: '#FFFFFF', fontSize: phone ? 28 : 33, lineHeight: phone ? 34 : 38, fontWeight: '900' }}>Manage Road Inspections More Clearly with LAKAD</Text>
          <Text style={{ color: '#E2ECF5', lineHeight: 22, marginTop: 10 }}>Access your authorized workspace to continue road management work.</Text></View>
        <Action label={session && role ? 'Open my workspace' : 'Access LAKAD'} icon="arrow-right" onPress={openApp} light />
      </View>
    </View></ImageBackground>

  </ScrollView>;
}
