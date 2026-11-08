import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  ALTERNATE_SAMPLE,
  ASPHALT_DISTRESSES,
  computeDemoPci,
  CONDITION_RATINGS,
  DEFAULT_SAMPLE,
  DEFAULT_SAMPLE_AREA,
  generateUID,
  type DemoEntry,
  type DemoResult,
  type Severity,
} from '@/lib/pci/pci-engine';
import { getPciConditionVisual } from '@/lib/pci/pci-classification';
import { isSampleUnitAreaAllowed, SAMPLE_UNIT_GUIDANCE } from '@/lib/pci/pci-service';
import { getDistressSeverityColors } from '@/lib/pci/severity-colors';
import { useAppTheme } from '@/providers/ThemeProvider';

const heroImage = require('../../assets/images/lakad_hero_bg.png');
const logoImage = require('../../assets/images/LAKAD.png');
const initialResult = computeDemoPci(DEFAULT_SAMPLE, DEFAULT_SAMPLE_AREA);

/** Same six steps as the authenticated ASTM D6433-07 inspection workflow. */
const STEPS = ['Sample Unit', 'Distress Data', 'Deduct Values', 'Maximum CDV', 'Pavement Condition Index', 'PCI Rating'];
const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high'];

const palettes = {
  light: {
    page: '#F3F6FC',
    card: '#FFFFFF',
    cardSoft: '#EEF3FC',
    text: '#0B1D4D',
    secondary: '#1038B0',
    muted: '#4B5B7C',
    border: '#DBE3F2',
    primary: '#1850E0',
    primaryDark: '#0F36A8',
    blueSoft: '#E9F0FE',
    warning: '#8A3E00',
    warningSurface: '#FFF8E8',
    warningBorder: '#F6D991',
    track: '#E1E8F5',
    shadow: '#0A1B4D',
  },
  dark: {
    page: '#060F2E',
    card: '#0C1A42',
    cardSoft: '#11214F',
    text: '#F1F5FE',
    secondary: '#9DBBFF',
    muted: '#A8B5D6',
    border: '#1F3366',
    primary: '#2A5FF0',
    primaryDark: '#1038B0',
    blueSoft: '#13265A',
    warning: '#FBBF24',
    warningSurface: '#3B2B10',
    warningBorder: '#8B5C13',
    track: '#1F3366',
    shadow: '#000000',
  },
};

type Palette = typeof palettes.light;

const sectionIcons = {
  sample: 'map' as const,
  distress: 'clipboard' as const,
  deduct: 'list' as const,
  total: 'hash' as const,
  correction: 'bar-chart-2' as const,
  pci: 'activity' as const,
  rating: 'target' as const,
};

/** Full precision is kept in the engine; screens round for display only. */
function fixed(value: number, digits = 1) {
  return value.toFixed(digits);
}
/** Rounds to one decimal place without a trailing ".0" (62, 34.4, 100). */
function short(value: number) {
  return String(Math.round(value * 10) / 10);
}
function severityLabel(severity: Severity | null) {
  return severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : 'N/A';
}
function rowKey(code: number, severity: Severity | null) {
  return `${code}:${severity ?? 'none'}`;
}

function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <View style={styles.brand}>
      <Image contentFit="contain" source={logoImage} style={compact ? styles.brandLogoCompact : styles.brandLogo} />
      <View>
        <Text style={[compact ? styles.brandNameCompact : styles.brandName, inverse && styles.brandInverse]}>LAKAD</Text>
        <Text style={[compact ? styles.brandTagCompact : styles.brandTag, inverse && styles.brandInverse]}>Where Data Meets the Road</Text>
      </View>
    </View>
  );
}

function Card({ children, palette, style }: { children: ReactNode; palette: Palette; style?: object }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, borderColor: palette.border, boxShadow: `0 2px 8px ${palette.shadow}12` },
        style,
      ]}>
      {children}
    </View>
  );
}

function SectionHeading({
  icon,
  number,
  palette,
  subtitle,
  title,
}: {
  icon: keyof typeof sectionIcons;
  number?: number;
  palette: Palette;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={[styles.sectionIcon, { backgroundColor: palette.primaryDark }]}>
        {icon === 'total' ? <Text style={styles.sigmaIcon}>Σ</Text> : <Feather color="#FFFFFF" name={sectionIcons[icon]} size={20} />}
      </View>
      <View style={styles.sectionHeadingCopy}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{number ? `${number}. ` : ''}{title}</Text>
        <Text style={[styles.sectionSubtitle, { color: palette.secondary }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** Sun/moon button; same style as the landing and sign-in theme buttons, sized to the Sign In button. */
function ThemeToggle({ compact = false, isDark, onPress, palette }: { compact?: boolean; isDark: boolean; onPress: () => void; palette: Palette }) {
  return (
    <Pressable
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.themeButton,
        compact && styles.themeButtonCompact,
        {
          backgroundColor: hovered ? palette.blueSoft : palette.card,
          borderColor: hovered ? palette.primary : palette.border,
          boxShadow: hovered ? '0 8px 20px rgba(24,80,224,0.18)' : 'none',
          transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.94 : 1 }],
        },
      ] as any}>
      {({ hovered }: any) => (
        <Feather color={isDark ? '#FFD66B' : palette.primary} name={isDark ? 'sun' : 'moon'} size={18} style={{ transform: [{ rotate: hovered ? (isDark ? '45deg' : '-18deg') : '0deg' }] }} />
      )}
    </Pressable>
  );
}

function InputShell({ children, palette, suffix }: { children: ReactNode; palette: Palette; suffix: string }) {
  return (
    <View style={[styles.inputShell, { borderColor: palette.border, backgroundColor: palette.card }]}>
      <View style={styles.inputBody}>{children}</View>
      <View style={[styles.inputSuffix, { backgroundColor: palette.cardSoft, borderLeftColor: palette.border }]}>
        <Text style={[styles.inputSuffixText, { color: palette.text }]}>{suffix}</Text>
      </View>
    </View>
  );
}

function StatBox({ label, palette, value }: { label: string; palette: Palette; value: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[styles.statLabel, { color: palette.secondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function Notes({ compact, palette, stacked }: { compact: boolean; palette: Palette; stacked: boolean }) {
  const notes = [
    'Follows the ASTM D6433-07 sample procedure (§§9.1–9.6) used in official inspections.',
    'Deduct and CDV curves here are illustrative, not ASTM D6433-07 readings.',
    'The ASTM curves stay on the server and are not publicly displayed.',
    'No information is saved.',
    'This demonstration does not affect official inspection records.',
    'Official inspections require authentication and authorized user access.',
  ];

  return (
    <View style={[styles.notesBox, stacked && styles.notesBoxStacked, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
      <Feather color={palette.primary} name="info" size={24} />
      <View style={styles.notesContent}>
        <Text style={[styles.notesTitle, { color: palette.text }]}>Notes</Text>
        <View style={[styles.notesGrid, compact && styles.notesGridCompact]}>
          {notes.map((note) => (
            <View key={note} style={[styles.noteItem, compact && styles.noteItemCompact]}>
              <Text style={[styles.noteBullet, { color: palette.secondary }]}>•</Text>
              <Text style={[styles.noteText, { color: palette.secondary }]}>{note}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function RatingGauge({ isDark, palette, result }: { isDark: boolean; palette: Palette; result: DemoResult | null }) {
  const pci = result?.pci ?? 0;
  const resultColor = result ? getPciConditionVisual(result.category, isDark).accentColor : palette.track;
  const progressDegrees = Math.round((Math.max(0, Math.min(100, pci)) / 100) * 270);
  const gaugeStyle = {
    backgroundImage: `conic-gradient(from 225deg, ${resultColor} 0deg ${progressDegrees}deg, ${palette.track} ${progressDegrees}deg 270deg, transparent 270deg 360deg)`,
  } as never;

  return (
    <View style={styles.gaugeArea}>
      <View style={[styles.gaugeRing, gaugeStyle]}>
        <View style={[styles.gaugeCutout, { backgroundColor: palette.card }]} />
      </View>
      <View style={styles.gaugeValueWrap}>
        <Text style={[styles.gaugeValue, { color: palette.text }]}>{result ? short(pci) : '—'}</Text>
        <Text style={[styles.gaugeOutOf, { color: palette.secondary }]}>/ 100</Text>
      </View>
    </View>
  );
}

export default function PrototypePage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? palettes.dark : palettes.light;
  const isDesktop = width >= 1180;
  const isTablet = width >= 760;
  const isPhone = width < 600;
  const isNarrowPhone = width < 390;

  const [sampleArea, setSampleArea] = useState(String(DEFAULT_SAMPLE_AREA));
  const [entries, setEntries] = useState<DemoEntry[]>([...DEFAULT_SAMPLE]);
  const [selectedCode, setSelectedCode] = useState(1);
  const [selectedSeverity, setSelectedSeverity] = useState<Severity>('low');
  const [quantity, setQuantity] = useState('5');
  const [result, setResult] = useState<DemoResult | null>(() => initialResult);
  const [showDetails, setShowDetails] = useState(true);
  const [showDistressMenu, setShowDistressMenu] = useState(false);
  const [isAlternate, setIsAlternate] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isComputed = result !== null;

  const selectedDistress = useMemo(
    () => ASPHALT_DISTRESSES.find((item) => item.code === selectedCode) ?? ASPHALT_DISTRESSES[0],
    [selectedCode]
  );
  const hasSeverity = selectedDistress.severities.length > 0;

  const invalidateResult = () => setResult(null);

  const showSample = useCallback((sample: readonly DemoEntry[]) => {
    setEntries([...sample]);
    setSampleArea(String(DEFAULT_SAMPLE_AREA));
    setResult(computeDemoPci(sample, DEFAULT_SAMPLE_AREA));
    setShowDetails(true);
    setError('');
    setNotice('');
  }, []);

  const handleAdd = useCallback(() => {
    const parsedQuantity = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a measured quantity greater than zero.');
      return;
    }
    if (selectedDistress.unit === 'No.' && !Number.isInteger(parsedQuantity)) {
      setError('Count potholes as whole numbers in this demonstration.');
      return;
    }

    const severity = hasSeverity ? selectedSeverity : null;
    const existing = entries.find((entry) => entry.code === selectedDistress.code && entry.severity === severity);
    if (existing) {
      setEntries((current) => current.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + parsedQuantity } : entry)));
      setNotice(`Added to the existing ${selectedDistress.name}${severity ? ` (${severityLabel(severity)})` : ''} row. ASTM D6433-07 §9.1 records each distress and severity once.`);
    } else {
      setEntries((current) => [...current, { uid: generateUID(), code: selectedDistress.code, severity, quantity: parsedQuantity }]);
      setNotice('');
    }
    setQuantity('');
    setError('');
    setResult(null);
  }, [entries, hasSeverity, quantity, selectedDistress, selectedSeverity]);

  const handleCompute = useCallback(() => {
    const parsedArea = Number(sampleArea);
    if (!isSampleUnitAreaAllowed(parsedArea)) {
      setError('Enter a sample-unit area from 135 to 315 m² (ASTM D6433-07 §2.1.7).');
      return;
    }
    try {
      setResult(computeDemoPci(entries, parsedArea));
      setShowDetails(true);
      setError('');
      setNotice('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PCI could not be computed.');
    }
  }, [entries, sampleArea]);

  const handleReset = useCallback(() => {
    showSample(DEFAULT_SAMPLE);
    setSelectedCode(1);
    setSelectedSeverity('low');
    setQuantity('5');
    setIsAlternate(false);
  }, [showSample]);

  const handleTryAnother = useCallback(() => {
    showSample(isAlternate ? DEFAULT_SAMPLE : ALTERNATE_SAMPLE);
    setIsAlternate((current) => !current);
  }, [isAlternate, showSample]);

  const tableRows = result
    ? result.rows.map((row) => ({ key: rowKey(row.code, row.severity), code: row.code, name: row.name, severity: row.severity, quantity: row.quantity, unit: row.unit, density: fixed(row.density, 2), deduct: fixed(row.deduct_value, 2) }))
    : entries.map((entry) => {
        const item = ASPHALT_DISTRESSES.find((d) => d.code === entry.code)!;
        return { key: rowKey(entry.code, entry.severity), code: entry.code, name: item.name, severity: entry.severity, quantity: entry.quantity, unit: item.unit, density: '—', deduct: '—' };
      });
  const removeRow = (code: number, severity: Severity | null) => {
    setEntries((current) => current.filter((entry) => !(entry.code === code && entry.severity === severity)));
    setNotice('');
    invalidateResult();
  };
  const conditionVisual = result ? getPciConditionVisual(result.category, isDark) : null;

  const stepper = STEPS.map((label, index) => {
    const complete = isComputed && index < STEPS.length - 1;
    const active = isComputed ? index === STEPS.length - 1 : index < 2;
    return { label, index, complete, active };
  });

  return (
    <View style={[styles.page, { backgroundColor: palette.page }]}>
      <View style={[styles.contoursTop, { pointerEvents: 'none' }]}>
        <View style={[styles.contour, styles.contourOne, { borderColor: palette.border }]} />
        <View style={[styles.contour, styles.contourTwo, { borderColor: palette.border }]} />
        <View style={[styles.contour, styles.contourThree, { borderColor: palette.border }]} />
      </View>

      <View style={[styles.header, isPhone && styles.headerMobile, { backgroundColor: isDark ? '#0A1638' : '#FFFFFF', borderBottomColor: palette.border }]}>
        <View style={[styles.headerLeft, isPhone && styles.headerLeftMobile]}>
          <Pressable accessibilityRole="link" accessibilityLabel="Back to Home" hitSlop={6} onPress={() => router.push('/')} style={styles.homeLink}>
            {({ hovered, pressed }: any) => (
              <>
                <Feather color={palette.text} name="arrow-left" size={20} style={{ transform: [{ translateX: hovered && !pressed ? -3 : 0 }] }} />
                <Text style={[styles.homeLinkText, { color: palette.text, textDecorationLine: hovered ? 'underline' : 'none' }]}>Back to Home</Text>
              </>
            )}
          </Pressable>
        </View>
        <View style={[styles.headerRight, isPhone && styles.headerRightMobile]}>
          <ThemeToggle compact={isPhone} isDark={isDark} onPress={toggleColorScheme} palette={palette} />
          <Pressable onPress={() => router.push('/login')} style={({ pressed, hovered }: any) => [styles.backButton, isPhone && styles.backButtonMobile, pressed && styles.buttonPressed, hovered && !pressed && { transform: [{ translateY: -1 }], backgroundColor: '#1038B0', boxShadow: '0 8px 20px rgba(24,80,224,0.32)' }] as any}>
            <Feather color="#FFFFFF" name="arrow-left" size={17} />
            <Text style={styles.backButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isPhone && styles.heroMobile]}>
          <Image contentFit="cover" contentPosition={{ left: '50%', top: '68%' }} source={heroImage} style={styles.heroBackdropTexture} />
          <View style={[styles.heroOverlay, isPhone && styles.heroOverlayMobile]}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroTitle, isPhone && styles.heroTitleMobile]}>PCI Calculation Prototype</Text>
              <Text style={[styles.heroSubtitle, isPhone && styles.heroSubtitleMobile]}>Try the ASTM D6433-07 PCI procedure step by step using sample asphalt-pavement data.</Text>
            </View>
            {isDesktop ? (
              <View style={styles.heroRight}>
                <View style={styles.quoteWrap}>
                  <Text style={styles.quote}>“Where Data Meets the Road”</Text>
                  <View style={styles.quoteUnderline} />
                </View>
                <View style={styles.heroDivider} />
                <Brand compact inverse />
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.main, !isDesktop && styles.mainCompact, isPhone && styles.mainMobile]}>
          <View style={[styles.warning, isPhone && styles.warningMobile, { backgroundColor: palette.warningSurface, borderColor: palette.warningBorder }]}>
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>!</Text>
            </View>
            <View style={styles.warningCopy}>
              <Text style={[styles.warningTitle, { color: palette.warning }]}>Prototype Demonstration — Not an Official Inspection Record</Text>
              <Text style={[styles.warningText, { color: palette.warning }]}>This page uses sample data only and does not save any information. Results are provided for demonstration and educational purposes.</Text>
            </View>
          </View>

          {isPhone ? (
            <ScrollView horizontal contentContainerStyle={styles.stepperMobile} showsHorizontalScrollIndicator={false}>
              {stepper.map(({ label, index, complete, active }) => (
                <View key={label} style={styles.stepItemMobile}>
                  <View style={[styles.stepCircle, { backgroundColor: complete || active ? palette.primary : palette.card, borderColor: palette.primary }]}>
                    {complete ? <Feather color="#FFFFFF" name="check" size={18} /> : <Text style={[styles.stepNumber, { color: active ? '#FFFFFF' : palette.primary }]}>{index + 1}</Text>}
                  </View>
                  <Text numberOfLines={2} style={[styles.stepLabel, styles.stepLabelMobile, { color: complete || active ? palette.primary : palette.muted }, active && styles.stepLabelActive]}>{index + 1}. {label}</Text>
                  {index < STEPS.length - 1 ? <View style={[styles.stepLine, styles.stepLineMobile, { backgroundColor: complete ? palette.primary : palette.border }]} /> : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.stepper}>
              {stepper.map(({ label, index, complete, active }) => (
                <View key={label} style={[styles.stepItem, !isDesktop && styles.stepItemCompact]}>
                  <View style={[styles.stepCircle, { backgroundColor: complete || active ? palette.primary : palette.card, borderColor: palette.primary }]}>
                    {complete ? <Feather color="#FFFFFF" name="check" size={18} /> : <Text style={[styles.stepNumber, { color: active ? '#FFFFFF' : palette.primary }]}>{index + 1}</Text>}
                  </View>
                  <Text numberOfLines={1} style={[styles.stepLabel, { color: complete || active ? palette.primary : palette.muted }, active && styles.stepLabelActive]}>{index + 1}. {label}</Text>
                  {index < STEPS.length - 1 ? <View style={[styles.stepLine, { backgroundColor: complete ? palette.primary : palette.border }]} /> : null}
                </View>
              ))}
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Feather color="#DC2626" name="alert-circle" size={17} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.workspace, !isDesktop && styles.workspaceCompact, !isTablet && styles.workspaceMobile]}>
            <View style={[styles.leftColumn, !isDesktop && styles.leftColumnCompact, !isTablet && styles.columnMobile]}>
              <Card palette={palette} style={[styles.sampleCard, isDesktop && { height: 227 }]}>
                <SectionHeading icon="sample" number={1} palette={palette} subtitle="Enter the measured area of the asphalt sample unit." title="Sample Unit Information" />
                <Text style={[styles.fieldLabel, { color: palette.text }]}>Sample Unit Area (Asphalt)</Text>
                <InputShell palette={palette} suffix="m²">
                  <TextInput
                    accessibilityLabel="Sample unit area in square meters"
                    keyboardType="numeric"
                    onChangeText={(value) => { setSampleArea(value); invalidateResult(); }}
                    style={[styles.textInput, { color: palette.text }]}
                    value={sampleArea}
                  />
                </InputShell>
                <View style={[styles.infoBox, { backgroundColor: palette.cardSoft }]}>
                  <Feather color={palette.primary} name="info" size={18} />
                  <Text style={[styles.infoText, { color: palette.secondary }]}>{SAMPLE_UNIT_GUIDANCE}</Text>
                </View>
              </Card>

              <Card palette={palette} style={[styles.distressCard, isDesktop && { height: 331 }]}>
                <SectionHeading icon="distress" number={2} palette={palette} subtitle="Choose an ASTM D6433-07 asphalt distress, set its severity and quantity, then add it." title="Distress Data" />
                <Text style={[styles.fieldLabel, { color: palette.text }]}>Asphalt Distress Type</Text>
                <Pressable
                  accessibilityLabel={`Distress type: ${selectedDistress.name}`}
                  onPress={() => setShowDistressMenu((current) => !current)}
                  style={[styles.selectBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <View style={[styles.roadMiniIcon, { backgroundColor: palette.primary }]}>
                    <Text style={styles.codeBadgeText}>{selectedDistress.code}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.selectText, { color: palette.text }]}>{selectedDistress.name}</Text>
                  <Feather color={palette.text} name="chevron-down" size={17} />
                </Pressable>
                {showDistressMenu ? (
                  <ScrollView style={[styles.selectMenu, { backgroundColor: palette.card, borderColor: palette.border }]}>
                    {ASPHALT_DISTRESSES.map((item) => (
                      <Pressable
                        key={item.code}
                        onPress={() => {
                          setSelectedCode(item.code);
                          setShowDistressMenu(false);
                        }}
                        style={[styles.selectOption, { borderBottomColor: palette.border }]}>
                        <Text style={[styles.selectOptionText, { color: palette.text }]}>{item.code}. {item.name} ({item.unit})</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                <View style={[styles.inlineField, isPhone && styles.inlineFieldMobile]}>
                  <Text style={[styles.inlineLabel, isPhone && styles.inlineLabelMobile, { color: palette.text }]}>Severity Level</Text>
                  {hasSeverity ? (
                    <View style={[styles.segmented, { borderColor: palette.border }]}>
                      {SEVERITIES.map((severity) => {
                        const selected = selectedSeverity === severity;
                        const severityColors = getDistressSeverityColors(severity);
                        return (
                          <Pressable
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            key={severity}
                            onPress={() => setSelectedSeverity(severity)}
                            style={[styles.segment, { borderColor: selected ? severityColors.borderColor : palette.border }, selected && { backgroundColor: severityColors.backgroundColor }]}>
                            <Text style={[styles.segmentText, { color: selected ? severityColors.textColor : palette.text }]}>{severityLabel(severity)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={[styles.segmented, styles.notApplicable, { borderColor: palette.border, backgroundColor: palette.cardSoft }]}>
                      <Text style={[styles.segmentText, { color: palette.muted }]}>Not applicable ({selectedDistress.severityRule})</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.inlineField, isPhone && styles.inlineFieldMobile]}>
                  <Text style={[styles.inlineLabel, isPhone && styles.inlineLabelMobile, { color: palette.text }]}>Measured Quantity</Text>
                  <View style={styles.quantityInput}>
                    <InputShell palette={palette} suffix={selectedDistress.unit}>
                      <TextInput accessibilityLabel={`Measured quantity in ${selectedDistress.unit}`} keyboardType="numeric" onChangeText={setQuantity} placeholder="0" placeholderTextColor={palette.muted} style={[styles.textInput, { color: palette.text }]} value={quantity} />
                    </InputShell>
                  </View>
                </View>
                <Text style={[styles.quantityHelp, isPhone && styles.quantityHelpMobile, { color: palette.secondary }]}>Measure in {selectedDistress.unit} (ASTM D6433-07 {selectedDistress.measurementRule}). The same distress and severity is combined into one row.</Text>
                <Pressable onPress={handleAdd} style={({ pressed, hovered }: any) => [styles.addButton, { backgroundColor: pressed ? palette.primaryDark : hovered ? palette.secondary : palette.primary, transform: hovered && !pressed ? [{ scale: 1.02 }] : [{ scale: 1 }] }] as any}>
                  <View style={styles.addIcon}><Feather color={palette.primary} name="plus" size={15} /></View>
                  <Text style={styles.addButtonText}>Add to List</Text>
                </Pressable>
                {notice ? <Text style={[styles.noticeText, { color: palette.secondary }]}>{notice}</Text> : null}
              </Card>
            </View>

            <View style={[styles.centerColumn, !isDesktop && styles.centerColumnCompact, !isTablet && styles.columnMobile]}>
              <Card palette={palette} style={[styles.densityCard, isDesktop && { height: 227 }]}>
                <SectionHeading icon="deduct" number={3} palette={palette} subtitle="Density = quantity ÷ sample area × 100 (§§9.1–9.2), then the deduct value for each distress and severity." title="Deduct Values" />
                <ScrollView contentContainerStyle={styles.tableScrollContent} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={!isDesktop} style={styles.tableViewport}>
                <View style={[styles.table, { borderColor: palette.border, width: isDesktop ? '100%' : 760 }]}>
                  <View style={[styles.tableHeader, { backgroundColor: palette.cardSoft, borderBottomColor: palette.border }]}>
                    <Text style={[styles.cellHeader, styles.numberCol, { color: palette.text }]}>#</Text>
                    <Text style={[styles.cellHeader, styles.distressCol, { color: palette.text }]}>Distress Type</Text>
                    <Text style={[styles.cellHeader, styles.severityCol, { color: palette.text }]}>Severity</Text>
                    <Text style={[styles.cellHeader, styles.quantityCol, { color: palette.text }]}>Quantity</Text>
                    <Text style={[styles.cellHeader, styles.unitCol, { color: palette.text }]}>Unit</Text>
                    <Text style={[styles.cellHeader, styles.densityCol, { color: palette.text }]}>Density (%)</Text>
                    <Text style={[styles.cellHeader, styles.dvCol, { color: palette.text }]}>Deduct Value</Text>
                    <Text style={[styles.cellHeader, styles.actionCol, { color: palette.text }]}>Action</Text>
                  </View>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={{ maxHeight: 240 }}>
                    {tableRows.map((row, index) => {
                      const severityColors = row.severity ? getDistressSeverityColors(row.severity) : null;
                      return (
                        <View key={row.key} style={[styles.tableRow, { borderBottomColor: palette.border }]}>
                          <Text style={[styles.cell, styles.numberCol, { color: palette.text }]}>{index + 1}</Text>
                          <Text numberOfLines={1} style={[styles.cell, styles.distressCol, { color: palette.text }]}>{row.name}</Text>
                          <View style={styles.severityCol}><View style={[styles.severityBadge, { backgroundColor: severityColors?.backgroundColor ?? palette.cardSoft, borderColor: severityColors?.borderColor ?? palette.border }]}><Text style={[styles.severityBadgeText, { color: severityColors?.textColor ?? palette.muted }]}>{severityLabel(row.severity)}</Text></View></View>
                          <Text style={[styles.cell, styles.quantityCol, { color: palette.text }]}>{short(row.quantity)}</Text>
                          <Text style={[styles.cell, styles.unitCol, { color: palette.text }]}>{row.unit}</Text>
                          <Text style={[styles.cell, styles.densityCol, { color: palette.text }]}>{row.density}</Text>
                          <Text style={[styles.cell, styles.dvCol, styles.boldCell, { color: palette.text }]}>{row.deduct}</Text>
                          <Pressable accessibilityLabel={`Remove ${row.name}`} onPress={() => removeRow(row.code, row.severity)} style={[styles.actionCol, styles.deleteButton]}>
                            <Feather color="#F01616" name="trash-2" size={16} />
                          </Pressable>
                        </View>
                      );
                    })}
                    {!tableRows.length ? <Text style={[styles.emptyTable, { color: palette.muted }]}>{isComputed ? 'No distress recorded. Every deduct value is zero.' : 'No distress added yet.'}</Text> : null}
                  </ScrollView>
                </View>
                </ScrollView>
              </Card>

              <View style={[styles.centerBottom, isDesktop && { height: 331 }, !isTablet && styles.centerBottomCompact]}>
                <Card palette={palette} style={[styles.totalCard, !isTablet && styles.cardAuto]}>
                  <SectionHeading icon="total" number={4} palette={palette} subtitle="Deduct values, q and allowable deducts m for the CDV correction (§9.5)." title="Maximum Corrected Deduct Value" />
                  <View style={[styles.formulaPanel, { backgroundColor: palette.cardSoft }]}>
                    <Text style={[styles.formulaLabel, { color: palette.text }]}>Deduct Values (highest first)</Text>
                    <View style={styles.formulaRow}>
                      {result && result.sortedDeducts.length ? result.sortedDeducts.map((value, index) => (
                        <View key={index} style={[styles.formulaBox, styles.deductChip, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={[styles.formulaValue, { color: palette.text }]}>{fixed(value)}</Text></View>
                      )) : <View style={[styles.formulaBox, styles.deductChip, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={[styles.formulaValue, { color: palette.text }]}>—</Text></View>}
                    </View>
                    <View style={styles.statGrid}>
                      <StatBox label="Highest DV" palette={palette} value={result ? fixed(result.highest_deduct_value) : '—'} />
                      <StatBox label="q (DV > 2)" palette={palette} value={result ? String(result.q) : '—'} />
                      <StatBox label="m (allowable)" palette={palette} value={result ? (result.shortcut ? 'n/a' : fixed(result.allowable_deducts, 2)) : '—'} />
                      <StatBox label="Total DV" palette={palette} value={result ? fixed(result.total_deduct_value) : '—'} />
                    </View>
                    <View style={[styles.maxCdv, styles.maxCdvTotal, { backgroundColor: palette.blueSoft }]}>
                      <Text style={[styles.maxCdvLabel, { color: palette.text }]}>Maximum CDV</Text>
                      <Text style={[styles.maxCdvValue, { color: palette.primary }]}>{result ? fixed(result.max_corrected_deduct_value) : '—'}</Text>
                    </View>
                  </View>
                </Card>

                <Card palette={palette} style={[styles.cdvCard, !isTablet && styles.cardAuto]}>
                  <SectionHeading icon="correction" palette={palette} subtitle="§9.5.5: reduce the smallest deduct value above 2 to 2 until q = 1. Illustrative curves." title="CDV Correction Details" />
                  <View style={[styles.cdvNoteBox, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
                    <Feather color={palette.primary} name="info" size={14} />
                    <Text style={[styles.cdvNoteText, styles.cdvNoteBody, { color: palette.secondary }]}>{result ? result.retention : 'Compute the PCI to see which deduct values are kept.'}</Text>
                  </View>
                  {result && !result.shortcut ? (
                    <>
                      <Pressable onPress={() => setShowDetails((current) => !current)} style={[styles.detailToggle, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
                        <Feather color={palette.primary} name={showDetails ? 'chevron-up' : 'chevron-down'} size={16} />
                        <Text style={[styles.detailToggleText, { color: palette.text }]}>{showDetails ? 'Hide' : 'View'} CDV iterations</Text>
                      </Pressable>
                      {showDetails ? (
                        <ScrollView contentContainerStyle={styles.cdvTableScrollContent} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={isPhone} style={styles.cdvTableViewport}>
                        <View style={[styles.cdvTable, { borderColor: palette.border, width: isPhone ? 500 : '100%' }]}>
                          <View style={[styles.cdvTableRow, styles.cdvTableHeader, { backgroundColor: palette.cardSoft, borderBottomColor: palette.border }]}>
                            <Text style={[styles.cdvHead, styles.iterCol, { color: palette.text }]}>Iteration</Text><Text style={[styles.cdvHead, styles.adjustedCol, { color: palette.text }]}>Adjusted Deduct Values</Text><Text style={[styles.cdvHead, styles.tdvCol, { color: palette.text }]}>TDV</Text><Text style={[styles.cdvHead, styles.qCol, { color: palette.text }]}>q</Text><Text style={[styles.cdvHead, styles.cdvCol, { color: palette.text }]}>CDV</Text>
                          </View>
                          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={{ maxHeight: 200 }}>
                            {result.iterations.map((iteration, index) => {
                              const isMax = index === result.maxIteration;
                              return (
                                <View key={index} style={[styles.cdvTableRow, { borderBottomColor: palette.border }, isMax && { backgroundColor: palette.blueSoft }]}>
                                  <Text style={[styles.cdvCell, styles.iterCol, { color: palette.text }]}>{index + 1}</Text><Text style={[styles.cdvCell, styles.adjustedCol, { color: palette.text }]}>{iteration.adjusted_deducts.map((value) => fixed(value)).join(', ')}</Text><Text style={[styles.cdvCell, styles.tdvCol, { color: palette.text }]}>{fixed(iteration.total_deduct_value)}</Text><Text style={[styles.cdvCell, styles.qCol, { color: palette.text }]}>{iteration.q}</Text><Text style={[styles.cdvCell, styles.cdvCol, styles.boldCell, { color: isMax ? palette.primary : palette.text }]}>{fixed(iteration.corrected_deduct_value)}{isMax ? ' (max)' : ''}</Text>
                                </View>
                              );
                            })}
                          </ScrollView>
                        </View>
                        </ScrollView>
                      ) : null}
                    </>
                  ) : null}
                  <Text style={[styles.cdvFootnote, { color: palette.secondary }]}>Illustrative CDV curves, not ASTM D6433-07 Fig. X3.26 readings. These values cannot be submitted as an official PCI.</Text>
                </Card>
              </View>
            </View>

            <View style={[styles.rightColumn, !isDesktop && styles.rightColumnCompact, !isTablet && styles.columnMobile]}>
              <Card palette={palette} style={styles.ratingCard}>
                <SectionHeading icon="pci" number={5} palette={palette} subtitle="PCI = 100 − maximum CDV (§9.6)." title="Pavement Condition Index" />
                <View style={[styles.pciFormula, { backgroundColor: palette.cardSoft }]}>
                  <Text style={[styles.pciFormulaText, { color: palette.text }]}>100 − {result ? fixed(result.max_corrected_deduct_value) : '—'} =</Text>
                  <Text style={[styles.pciFormulaValue, { color: palette.primary }]}>{result ? fixed(result.pci) : '—'}</Text>
                </View>
                <View style={[styles.cardDivider, { backgroundColor: palette.border }]} />
                <SectionHeading icon="rating" number={6} palette={palette} subtitle="ASTM D6433-07 Fig. 1 condition rating." title="PCI Rating" />
                <RatingGauge isDark={isDark} palette={palette} result={result} />
                <View style={styles.ratingSummary}>
                  <Text style={[styles.conditionLabel, { color: palette.text }]}>Condition Rating</Text>
                  <View style={[styles.ratingBadge, { backgroundColor: conditionVisual?.backgroundColor ?? palette.cardSoft, borderColor: conditionVisual?.borderColor ?? palette.border }]}><Text style={[styles.ratingBadgeText, { color: conditionVisual?.foregroundColor ?? palette.muted }]}>{result ? result.condition.toUpperCase() : 'PENDING'}</Text></View>
                  <Text style={[styles.ratingDescription, { color: palette.secondary }]}>{result ? result.category.description : 'Compute the sample to display its pavement condition.'}</Text>
                </View>
                <View style={[styles.legend, { borderColor: palette.border }]}>
                  <View style={styles.legendHeading}><Feather color={palette.primary} name="info" size={17} /><Text style={[styles.legendTitle, { color: palette.text }]}>PCI Condition Rating Legend</Text></View>
                  {CONDITION_RATINGS.map((rating) => {
                    const visual = getPciConditionVisual(rating, isDark);
                    return (
                      <View key={rating.rating} style={[styles.legendRow, { backgroundColor: visual.backgroundColor, borderColor: visual.borderColor }]}>
                        <View style={styles.legendName}><View style={[styles.legendDot, { backgroundColor: visual.accentColor }]} /><Text style={[styles.legendText, { color: visual.foregroundColor }]}>{rating.rating}</Text></View>
                        <Text style={[styles.legendRange, { color: visual.foregroundColor }]}>{rating.range}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          </View>

          <View style={[styles.bottomRow, !isDesktop && styles.bottomRowCompact]}>
            <Notes compact={isPhone} palette={palette} stacked={!isDesktop} />
            <View style={[styles.actions, !isDesktop && styles.actionsCompact, isPhone && styles.actionsMobile]}>
              <Pressable onPress={handleReset} style={({ pressed, hovered }: any) => [styles.secondaryButton, isPhone && styles.actionButtonMobile, { backgroundColor: pressed ? palette.cardSoft : hovered ? palette.cardSoft : palette.card, borderColor: hovered ? palette.muted : palette.border, transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }] }] as any}><Feather color={palette.text} name="rotate-ccw" size={21} /><Text style={[styles.secondaryButtonText, { color: palette.text }]}>Reset Demonstration</Text></Pressable>
              <Pressable onPress={handleTryAnother} style={({ pressed, hovered }: any) => [styles.secondaryButton, isPhone && styles.actionButtonMobile, { backgroundColor: pressed ? palette.cardSoft : hovered ? palette.blueSoft : palette.card, borderColor: hovered ? palette.primary : palette.border, transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }] }] as any}><Feather color={palette.primary} name="refresh-cw" size={21} /><Text style={[styles.secondaryButtonText, { color: palette.text }]}>Try Another Example</Text></Pressable>
              <Pressable onPress={handleCompute} style={({ pressed, hovered }: any) => [styles.computeButton, isPhone && styles.actionButtonMobile, { backgroundColor: pressed ? palette.primaryDark : hovered ? palette.secondary : palette.primary, transform: hovered && !pressed ? [{ scale: 1.02 }] : [{ scale: 1 }] }] as any}><Feather color="#FFFFFF" name="cpu" size={20} /><Text style={styles.computeButtonText}>Compute PCI</Text></Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.footer, isPhone && styles.footerMobile, { borderTopColor: palette.border, backgroundColor: isDark ? '#0A1638' : '#FFFFFF' }]}>
          <View style={[styles.footerBrand, isPhone && styles.footerBrandMobile]}><Image contentFit="contain" source={logoImage} style={styles.footerLogo} /><Text style={[styles.footerName, { color: palette.text }]}>LAKAD</Text>{!isNarrowPhone ? <View style={[styles.footerDivider, { backgroundColor: palette.border }]} /> : null}<Text style={[styles.footerDescription, isPhone && styles.footerDescriptionMobile, { color: palette.secondary }]}>Local Asphalt Konditioning Assessment and Data-Driven Prioritization</Text></View>
          <View style={[styles.footerRight, isPhone && styles.footerRightMobile]}><Text style={[styles.footerText, { color: palette.secondary }]}>Where Data Meets the Road</Text><Text style={[styles.footerText, { color: palette.secondary }]}>v1.0 (Prototype)</Text></View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  contoursTop: { height: 220, opacity: 0.35, position: 'absolute', right: -90, top: -100, width: 360 },
  contour: { borderRadius: 999, borderWidth: 1, position: 'absolute' },
  contourOne: { height: 170, right: 0, top: 0, width: 270 },
  contourTwo: { height: 205, right: 18, top: 14, width: 320 },
  contourThree: { height: 245, right: 38, top: 28, width: 370 },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 14, minHeight: 70, paddingVertical: 10, justifyContent: 'space-between', paddingHorizontal: 40, zIndex: 5 },
  headerMobile: { alignItems: 'stretch', gap: 9, paddingHorizontal: 14, paddingVertical: 9 },
  headerLeft: { alignItems: 'center', flexDirection: 'row', gap: 22 },
  headerLeftMobile: { justifyContent: 'space-between', width: '100%' },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 28 },
  headerRightMobile: { justifyContent: 'space-between', width: '100%' },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandLogo: { height: 55, width: 55 },
  brandLogoCompact: { height: 52, width: 52 },
  brandName: { color: '#0B1D4D', fontSize: 29, fontWeight: '900', letterSpacing: 0.4, lineHeight: 30 },
  brandNameCompact: { color: '#0B1D4D', fontSize: 24, fontWeight: '900', lineHeight: 25 },
  brandTag: { color: '#1850E0', fontSize: 10.5, fontWeight: '700' },
  brandTagCompact: { color: '#1850E0', fontSize: 9, fontWeight: '700' },
  brandInverse: { color: '#FFFFFF' },
  homeLink: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 44 },
  homeLinkText: { fontSize: 15, fontWeight: '600' },
  themeButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  themeButtonCompact: { height: 36, width: 36 },
  backButton: { alignItems: 'center', backgroundColor: '#1850E0', borderRadius: 10, boxShadow: '0 4px 12px rgba(24,80,224,0.25)', flexDirection: 'row', gap: 10, height: 40, justifyContent: 'center', paddingHorizontal: 18 },
  backButtonMobile: { height: 36, minWidth: 100, paddingHorizontal: 14 },
  backButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.82 },
  scrollContent: { flexGrow: 1 },
  hero: { backgroundColor: '#0A1B4D', minHeight: 160, overflow: 'hidden', position: 'relative', width: '100%', justifyContent: 'center', paddingVertical: 24 },
  heroMobile: { minHeight: 150, paddingVertical: 22 },
  heroBackdropTexture: { height: '100%', opacity: 0.35, position: 'absolute', width: '100%' },
  heroOverlay: { alignItems: 'center', backgroundColor: 'rgba(6, 15, 46, 0.58)', flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 45 },
  heroOverlayMobile: { paddingHorizontal: 18 },
  heroLeft: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.8, lineHeight: 41 },
  heroTitleMobile: { fontSize: 28, lineHeight: 34 },
  heroSubtitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', lineHeight: 24 },
  heroSubtitleMobile: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  heroRight: { alignItems: 'center', flexDirection: 'row', gap: 28 },
  quoteWrap: { alignItems: 'center', minWidth: 320 },
  quote: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  quoteUnderline: { backgroundColor: '#4E8BFE', height: 3, marginTop: 8, width: 28 },
  heroDivider: { backgroundColor: 'rgba(255,255,255,0.42)', height: 78, width: 1 },
  main: { gap: 11, paddingHorizontal: 36, paddingTop: 11, width: '100%' },
  mainCompact: { paddingHorizontal: 16 },
  mainMobile: { gap: 10, paddingHorizontal: 10, paddingTop: 10 },
  warning: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 7, minHeight: 56, paddingHorizontal: 15, paddingVertical: 8 },
  warningMobile: { alignItems: 'flex-start', marginHorizontal: 0, paddingHorizontal: 11, paddingVertical: 10 },
  warningIcon: { alignItems: 'center', backgroundColor: '#FFA300', borderRadius: 16, height: 30, justifyContent: 'center', marginRight: 14, width: 30 },
  warningIconText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  warningCopy: { flex: 1 },
  warningTitle: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  warningText: { fontSize: 12, lineHeight: 17 },
  stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', minHeight: 45, paddingHorizontal: 31 },
  stepperMobile: { alignItems: 'center', flexDirection: 'row', minHeight: 66, paddingHorizontal: 5, paddingVertical: 4 },
  stepItem: { alignItems: 'center', flexDirection: 'row', flex: 1, minWidth: 0 },
  stepItemCompact: { flexBasis: 220, marginBottom: 8 },
  stepItemMobile: { alignItems: 'center', flexDirection: 'row', minWidth: 170 },
  stepCircle: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  stepNumber: { fontSize: 17, fontWeight: '800' },
  stepLabel: { fontSize: 12, marginLeft: 10 },
  stepLabelMobile: { lineHeight: 15, maxWidth: 94 },
  stepLabelActive: { fontWeight: '800' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 15, minWidth: 12 },
  stepLineMobile: { flex: 0, marginHorizontal: 10, minWidth: 24, width: 24 },
  errorBanner: { alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 6, flexDirection: 'row', gap: 8, padding: 9 },
  errorText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },
  workspace: { alignItems: 'stretch', flexDirection: 'row', gap: 10 },
  workspaceCompact: { flexDirection: 'column', height: 'auto' },
  workspaceMobile: { flexDirection: 'column' },
  leftColumn: { flex: 1.08, gap: 11, minWidth: 0 },
  leftColumnCompact: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, width: '100%' },
  centerColumn: { flex: 2.12, gap: 11, minWidth: 0 },
  centerColumnCompact: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, width: '100%' },
  rightColumn: { flex: 0.86, minWidth: 0 },
  rightColumnCompact: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, width: '100%' },
  columnMobile: { width: '100%' },
  centerBottom: { flexDirection: 'row', gap: 10, minHeight: 331 },
  centerBottomCompact: { flexDirection: 'column', height: 'auto' },
  card: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  cardAuto: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, height: 'auto' },
  sampleCard: { minHeight: 220 },
  distressCard: { minHeight: 330, position: 'relative', zIndex: 4 },
  densityCard: { minHeight: 220 },
  totalCard: { flex: 0.77, minWidth: 0, overflow: 'hidden' },
  cdvCard: { flex: 1.02, minWidth: 0, paddingHorizontal: 12 },
  ratingCard: { flex: 1 },
  sectionHeading: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 9 },
  sectionIcon: { alignItems: 'center', borderRadius: 5, height: 31, justifyContent: 'center', marginRight: 16, width: 31 },
  sigmaIcon: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  sectionSubtitle: { fontSize: 11, lineHeight: 15 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 5 },
  inputShell: { borderRadius: 5, borderWidth: 1, flexDirection: 'row', height: 40, overflow: 'hidden' },
  inputBody: { flex: 1 },
  inputSuffix: { alignItems: 'center', borderLeftWidth: 1, justifyContent: 'center', minWidth: 57, paddingHorizontal: 12 },
  inputSuffixText: { fontSize: 13, fontWeight: '700' },
  textInput: { fontSize: 16, fontWeight: '700', height: '100%', paddingHorizontal: 13, width: '100%' },
  infoBox: { alignItems: 'flex-start', borderRadius: 6, flexDirection: 'row', gap: 12, marginTop: 14, padding: 10 },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16 },
  selectBox: { alignItems: 'center', borderRadius: 5, borderWidth: 1, flexDirection: 'row', height: 40, paddingHorizontal: 10 },
  roadMiniIcon: { alignItems: 'center', borderRadius: 4, height: 30, justifyContent: 'center', marginRight: 10, width: 34 },
  selectText: { flex: 1, fontSize: 13, fontWeight: '600' },
  selectMenu: { borderRadius: 6, borderWidth: 1, left: 12, maxHeight: 190, position: 'absolute', right: 12, top: 124, zIndex: 20 },
  selectOption: { borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  selectOptionText: { fontSize: 12 },
  inlineField: { alignItems: 'center', flexDirection: 'row', marginTop: 10 },
  inlineFieldMobile: { alignItems: 'stretch', flexDirection: 'column', gap: 7 },
  inlineLabel: { fontSize: 12, fontWeight: '700', width: 112 },
  inlineLabelMobile: { width: 'auto' },
  segmented: { borderRadius: 5, borderWidth: 1, flex: 1, flexDirection: 'row', height: 39, overflow: 'hidden' },
  segment: { alignItems: 'center', borderRightWidth: 1, flex: 1, justifyContent: 'center' },
  segmentText: { fontSize: 12 },
  quantityInput: { flex: 1 },
  quantityHelp: { fontSize: 10, lineHeight: 14, marginLeft: 112, marginTop: 6 },
  quantityHelpMobile: { marginLeft: 0 },
  addButton: { alignItems: 'center', borderRadius: 5, flexDirection: 'row', gap: 12, height: 43, justifyContent: 'center', marginTop: 12 },
  addIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 9, height: 18, justifyContent: 'center', width: 18 },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  table: { borderRadius: 6, borderWidth: 1, flex: 1, overflow: 'hidden' },
  tableViewport: { flexGrow: 0, maxWidth: '100%', width: '100%' },
  tableScrollContent: { flexGrow: 1 },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', height: 33, paddingHorizontal: 10 },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flex: 1, flexDirection: 'row', minHeight: 31, paddingHorizontal: 10 },
  cellHeader: { fontSize: 11, fontWeight: '700' },
  cell: { fontSize: 11 },
  boldCell: { fontWeight: '800' },
  numberCol: { flex: 0.35 },
  distressCol: { flex: 1.65 },
  severityCol: { flex: 0.86 },
  quantityCol: { flex: 0.75 },
  unitCol: { flex: 0.62 },
  densityCol: { flex: 0.95 },
  dvCol: { flex: 0.95 },
  actionCol: { flex: 0.58, textAlign: 'center' },
  deleteButton: { alignItems: 'center' },
  severityBadge: { alignItems: 'center', borderRadius: 4, borderWidth: 1, justifyContent: 'center', paddingVertical: 4, width: 60 },
  severityBadgeText: { fontSize: 10 },
  formulaPanel: { borderRadius: 6, marginTop: 8, padding: 10 },
  formulaLabel: { fontSize: 11, marginBottom: 12 },
  formulaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  formulaBox: { alignItems: 'center', borderRadius: 5, borderWidth: 1, height: 40, justifyContent: 'center', minWidth: 36 },
  formulaValue: { fontSize: 15, fontWeight: '600' },
  cdvNoteText: { fontSize: 9.5 },
  detailToggle: { alignItems: 'center', borderRadius: 5, borderWidth: 1, flexDirection: 'row', gap: 8, height: 29, marginTop: 5, paddingHorizontal: 8 },
  detailToggleText: { fontSize: 10, fontWeight: '700' },
  cdvTable: { borderWidth: 1, flex: 1, overflow: 'hidden' },
  cdvTableViewport: { flexGrow: 0, maxWidth: '100%', width: '100%' },
  cdvTableScrollContent: { flexGrow: 1 },
  cdvTableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 23 },
  cdvTableHeader: { minHeight: 27 },
  cdvHead: { fontSize: 10, fontWeight: '700', lineHeight: 12, paddingHorizontal: 3, textAlign: 'center' },
  cdvCell: { fontSize: 10.5, paddingHorizontal: 3, textAlign: 'center' },
  iterCol: { flex: 0.7 },
  adjustedCol: { flex: 1.8 },
  qCol: { flex: 0.55 },
  tdvCol: { flex: 0.62 },
  cdvCol: { flex: 1.25 },
  maxCdv: { alignItems: 'center', borderRadius: 4, flexDirection: 'row', height: 30, justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 10 },
  maxCdvLabel: { fontSize: 11, fontWeight: '700' },
  maxCdvValue: { fontSize: 19, fontWeight: '800' },
  cdvFootnote: { fontSize: 9, lineHeight: 11, marginTop: 3 },
  gaugeArea: { alignItems: 'center', height: 152, justifyContent: 'center', marginTop: 1, overflow: 'hidden', position: 'relative' },
  gaugeRing: { borderRadius: 95, height: 190, position: 'absolute', top: 4, width: 190 },
  gaugeCutout: { borderRadius: 73, height: 146, left: 22, position: 'absolute', top: 22, width: 146 },
  gaugeValueWrap: { alignItems: 'center', marginTop: 13 },
  gaugeValue: { fontSize: 56, fontWeight: '800', letterSpacing: -1, lineHeight: 59 },
  gaugeOutOf: { fontSize: 18, lineHeight: 23 },
  ratingSummary: { alignItems: 'center', marginTop: -3 },
  conditionLabel: { fontSize: 11, fontWeight: '700' },
  ratingBadge: { alignItems: 'center', borderRadius: 5, borderWidth: 1, minHeight: 36, justifyContent: 'center', marginTop: 4, minWidth: 116, paddingHorizontal: 12, paddingVertical: 4 },
  ratingBadgeText: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  ratingDescription: { fontSize: 11, lineHeight: 14, marginTop: 5, paddingHorizontal: 20, textAlign: 'center' },
  legend: { borderRadius: 6, borderWidth: 1, marginTop: 7, padding: 6 },
  legendHeading: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 5 },
  legendTitle: { fontSize: 11, fontWeight: '800' },
  legendRow: { alignItems: 'center', borderRadius: 4, borderWidth: 1, flexDirection: 'row', minHeight: 28, justifyContent: 'space-between', marginBottom: 2, paddingHorizontal: 14, paddingVertical: 5 },
  legendName: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  legendDot: { borderRadius: 7, height: 14, width: 14 },
  legendText: { fontSize: 11 },
  legendRange: { fontSize: 11 },
  bottomRow: { alignItems: 'center', flexDirection: 'row', gap: 22, minHeight: 74 },
  bottomRowCompact: { alignItems: 'stretch', flexDirection: 'column' },
  notesBox: { alignItems: 'flex-start', borderRadius: 7, borderWidth: 1, flex: 1.4, flexDirection: 'row', minHeight: 85, padding: 10 },
  notesBoxStacked: { flexBasis: 'auto', flexGrow: 0 },
  notesContent: { flex: 1, marginLeft: 12 },
  notesTitle: { fontSize: 11, fontWeight: '800', marginBottom: 1 },
  notesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  notesGridCompact: { flexDirection: 'column' },
  noteItem: { flexDirection: 'row', width: '50%' },
  noteItemCompact: { width: '100%' },
  noteBullet: { fontSize: 11, lineHeight: 14, marginRight: 7 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 14 },
  actions: { flex: 1, flexDirection: 'row', gap: 11, justifyContent: 'flex-end', transform: [{ translateY: -6 }] },
  actionsCompact: { flexBasis: 'auto', flexGrow: 0, flexWrap: 'wrap' },
  actionsMobile: { flexDirection: 'column', flexGrow: 0, transform: [{ translateY: 0 }], width: '100%' },
  actionButtonMobile: { flexBasis: 44, flexGrow: 0, flexShrink: 0, minWidth: 0, width: '100%' },
  secondaryButton: { alignItems: 'center', borderRadius: 5, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 11, height: 44, justifyContent: 'center', minWidth: 170, paddingHorizontal: 12 },
  secondaryButtonText: { fontSize: 11, fontWeight: '600' },
  computeButton: { alignItems: 'center', borderRadius: 5, flex: 0.95, flexDirection: 'row', gap: 12, height: 44, justifyContent: 'center', minWidth: 170, paddingHorizontal: 14 },
  computeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', minHeight: 42, justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 36, paddingVertical: 10 },
  footerMobile: { flexDirection: 'column', gap: 8, paddingHorizontal: 12, paddingVertical: 14 },
  footerBrand: { alignItems: 'center', flexDirection: 'row' },
  footerBrandMobile: { flexWrap: 'wrap', justifyContent: 'center' },
  footerLogo: { height: 20, width: 20 },
  footerName: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  footerDivider: { height: 16, marginHorizontal: 8, width: 1 },
  footerDescription: { fontSize: 10 },
  footerDescriptionMobile: { marginVertical: 3, textAlign: 'center' },
  footerRight: { flexDirection: 'row', gap: 20 },
  footerRightMobile: { justifyContent: 'center' },
  footerText: { fontSize: 10 },
  codeBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  notApplicable: { alignItems: 'center', justifyContent: 'center' },
  noticeText: { fontSize: 10.5, lineHeight: 14, marginTop: 6 },
  emptyTable: { fontSize: 11, padding: 14, textAlign: 'center' },
  deductChip: { paddingHorizontal: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statBox: { borderRadius: 5, borderWidth: 1, flexBasis: 80, flexGrow: 1, paddingHorizontal: 8, paddingVertical: 5 },
  statLabel: { fontSize: 9.5 },
  statValue: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  maxCdvTotal: { height: 38, marginTop: 10 },
  cdvNoteBox: { alignItems: 'flex-start', borderRadius: 6, borderWidth: 1, flexDirection: 'row', gap: 6, padding: 7 },
  cdvNoteBody: { flex: 1, fontSize: 10.5, lineHeight: 14 },
  pciFormula: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 8 },
  pciFormulaText: { fontSize: 15, fontWeight: '600' },
  pciFormulaValue: { fontSize: 22, fontWeight: '800' },
  cardDivider: { height: 1, marginBottom: 10, marginTop: 12 },
});
