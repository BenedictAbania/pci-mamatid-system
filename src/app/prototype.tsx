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
    computePCI,
    CONDITION_RATINGS,
    DEFAULT_SAMPLE,
    DEFAULT_SAMPLE_AREA,
    generateUID,
    type DistressEntry,
    type PCIResult,
    type Severity,
} from '@/lib/pci-engine';

const heroImage = require('../../assets/images/lakad_hero_bg.jpg');
const logoImage = require('../../assets/images/LAKAD.png');
const initialResult = computePCI(DEFAULT_SAMPLE, DEFAULT_SAMPLE_AREA);

const palettes = {
  light: {
    page: '#F7FAFF',
    card: '#FFFFFF',
    cardSoft: '#F3F7FD',
    text: '#071957',
    secondary: '#2852A0',
    muted: '#5071B0',
    border: '#D6E3F5',
    primary: '#0D6EFD',
    primaryDark: '#062D78',
    blueSoft: '#EAF3FF',
    warning: '#8A3E00',
    warningSurface: '#FFF8E8',
    warningBorder: '#F6D991',
    track: '#DFE8F3',
    shadow: '#173D7A',
  },
  dark: {
    page: '#071127',
    card: '#0E1B35',
    cardSoft: '#112441',
    text: '#F4F7FF',
    secondary: '#A9C4F5',
    muted: '#8FA9D5',
    border: '#263C61',
    primary: '#3B82F6',
    primaryDark: '#102F65',
    blueSoft: '#122D59',
    warning: '#FBBF24',
    warningSurface: '#3B2B10',
    warningBorder: '#8B5C13',
    track: '#243857',
    shadow: '#000000',
  },
};

type Palette = typeof palettes.light;

const sectionIcons = {
  sample: 'map' as const,
  distress: 'clipboard' as const,
  density: 'list' as const,
  total: 'hash' as const,
  correction: 'bar-chart-2' as const,
  rating: 'target' as const,
};

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
  number: number;
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
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{number}. {title}</Text>
        <Text style={[styles.sectionSubtitle, { color: palette.secondary }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ThemeSwitch({ isDark, onPress }: { isDark: boolean; onPress: () => void }) {
  return (
    <View style={styles.themeControls}>
      <Feather color="#071957" name="sun" size={17} />
      <Pressable accessibilityLabel="Toggle color theme" onPress={onPress} style={styles.toggleTrack}>
        <View style={[styles.toggleThumb, isDark && styles.toggleThumbDark]} />
      </Pressable>
      <Feather color="#071957" name="moon" size={17} />
    </View>
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

function Notes({ palette }: { palette: Palette }) {
  const notes = [
    'This prototype uses sample data only.',
    'Deduct Values are illustrative unless supplied by the verified PCI engine.',
    'The complete ASTM lookup tables are not publicly displayed.',
    'No information is saved.',
    'This demonstration does not affect official inspection records.',
    'Official inspections require authentication and authorized user access.',
  ];

  return (
    <View style={[styles.notesBox, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
      <Feather color={palette.primary} name="info" size={24} />
      <View style={styles.notesContent}>
        <Text style={[styles.notesTitle, { color: palette.text }]}>Notes</Text>
        <View style={styles.notesGrid}>
          {notes.map((note) => (
            <View key={note} style={styles.noteItem}>
              <Text style={[styles.noteBullet, { color: palette.secondary }]}>•</Text>
              <Text style={[styles.noteText, { color: palette.secondary }]}>{note}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function RatingGauge({ palette, result }: { palette: Palette; result: PCIResult }) {
  const resultColor = result.rating === 'Fair' ? '#FFB400' : result.ratingColor;
  const progressDegrees = Math.round((Math.max(0, Math.min(100, result.pci)) / 100) * 270);
  const gaugeStyle = {
    backgroundImage: `conic-gradient(from 225deg, ${resultColor} 0deg ${progressDegrees}deg, ${palette.track} ${progressDegrees}deg 270deg, transparent 270deg 360deg)`,
  } as never;

  return (
    <View style={styles.gaugeArea}>
      <View style={[styles.gaugeRing, gaugeStyle]}>
        <View style={[styles.gaugeCutout, { backgroundColor: palette.card }]} />
      </View>
      <View style={styles.gaugeValueWrap}>
        <Text style={[styles.gaugeValue, { color: palette.text }]}>{result.pci}</Text>
        <Text style={[styles.gaugeOutOf, { color: palette.secondary }]}>/ 100</Text>
      </View>
    </View>
  );
}

export default function PrototypePage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [isDark, setIsDark] = useState(false);
  const palette = isDark ? palettes.dark : palettes.light;
  const isDesktop = width >= 1180;
  const isTablet = width >= 760;

  const [sampleArea, setSampleArea] = useState(String(DEFAULT_SAMPLE_AREA));
  const [entries, setEntries] = useState<DistressEntry[]>([...DEFAULT_SAMPLE]);
  const [selectedDistressId, setSelectedDistressId] = useState(1);
  const [selectedSeverity, setSelectedSeverity] = useState<Severity>('Low');
  const [quantity, setQuantity] = useState('5');
  const [result, setResult] = useState<PCIResult | null>(() => initialResult);
  const [isComputed, setIsComputed] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showDistressMenu, setShowDistressMenu] = useState(false);
  const [isAlternate, setIsAlternate] = useState(false);
  const [error, setError] = useState('');

  const selectedDistress = useMemo(
    () => ASPHALT_DISTRESSES.find((item) => item.id === selectedDistressId) ?? ASPHALT_DISTRESSES[0],
    [selectedDistressId]
  );

  const invalidateResult = () => {
    setIsComputed(false);
    setResult(null);
  };

  const handleAdd = useCallback(() => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a measured quantity greater than zero.');
      return;
    }

    const entry: DistressEntry = {
      uid: generateUID(),
      distressId: selectedDistress.id,
      distressName: selectedDistress.name,
      quantity: parsedQuantity,
      severity: selectedSeverity,
      unit: selectedDistress.unit,
    };

    setEntries((current) => [...current, entry]);
    setQuantity('');
    setError('');
    setIsComputed(false);
    setResult(null);
  }, [quantity, selectedDistress, selectedSeverity]);

  const handleCompute = useCallback(() => {
    const parsedArea = Number(sampleArea);
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      setError('Enter a valid asphalt sample-unit area.');
      return;
    }
    if (!entries.length) {
      setError('Add at least one pavement distress before computing PCI.');
      return;
    }
    setResult(computePCI(entries, parsedArea));
    setIsComputed(true);
    setShowDetails(true);
    setError('');
  }, [entries, sampleArea]);

  const handleReset = useCallback(() => {
    setSampleArea(String(DEFAULT_SAMPLE_AREA));
    setEntries([...DEFAULT_SAMPLE]);
    setSelectedDistressId(1);
    setSelectedSeverity('Low');
    setQuantity('5');
    setResult(computePCI(DEFAULT_SAMPLE, DEFAULT_SAMPLE_AREA));
    setIsComputed(true);
    setShowDetails(true);
    setIsAlternate(false);
    setError('');
  }, []);

  const handleTryAnother = useCallback(() => {
    const nextEntries = isAlternate ? [...DEFAULT_SAMPLE] : [...ALTERNATE_SAMPLE];
    setEntries(nextEntries);
    setSampleArea(String(DEFAULT_SAMPLE_AREA));
    setResult(computePCI(nextEntries, DEFAULT_SAMPLE_AREA));
    setIsComputed(true);
    setShowDetails(true);
    setIsAlternate((current) => !current);
    setError('');
  }, [isAlternate]);

  const computedRows = result?.distresses ?? entries.map((entry) => ({ ...entry, density: 0, deductValue: 0 }));
  const displayedResult = result ?? initialResult;

  return (
    <View style={[styles.page, { backgroundColor: palette.page }]}>
      <View style={[styles.contoursTop, { pointerEvents: 'none' }]}>
        <View style={[styles.contour, styles.contourOne, { borderColor: palette.border }]} />
        <View style={[styles.contour, styles.contourTwo, { borderColor: palette.border }]} />
        <View style={[styles.contour, styles.contourThree, { borderColor: palette.border }]} />
      </View>

      <View style={[styles.header, { backgroundColor: isDark ? '#0E1B35' : '#FFFFFF', borderBottomColor: palette.border }]}>
        <View style={styles.headerLeft}>
          <Brand />
          <View style={[styles.prototypeBadge, { backgroundColor: palette.blueSoft }]}>
            <Text style={[styles.prototypeBadgeText, { color: palette.text }]}>Prototype</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <ThemeSwitch isDark={isDark} onPress={() => setIsDark((current) => !current)} />
          <Pressable onPress={() => router.push('/login')} style={({ pressed, hovered }) => [styles.backButton, pressed && styles.buttonPressed, hovered && !pressed && { transform: [{ scale: 1.02 }], backgroundColor: '#3B82F6' }] as any}>
            <Feather color="#FFFFFF" name="arrow-left" size={17} />
            <Text style={styles.backButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image contentFit="cover" contentPosition={{ left: '50%', top: '68%' }} source={heroImage} style={styles.heroBackdropTexture} />
          <View style={styles.heroOverlay}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroTitle}>PCI Calculation Prototype</Text>
              <Text style={styles.heroSubtitle}>Try the PCI computation process step by step using sample asphalt-pavement data.</Text>
            </View>
            {isTablet ? (
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

        <View style={[styles.main, !isDesktop && styles.mainCompact]}>
          <View style={[styles.warning, { backgroundColor: palette.warningSurface, borderColor: palette.warningBorder }]}>
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>!</Text>
            </View>
            <View style={styles.warningCopy}>
              <Text style={[styles.warningTitle, { color: palette.warning }]}>Prototype Demonstration — Not an Official Inspection Record</Text>
              <Text style={[styles.warningText, { color: palette.warning }]}>This page uses sample data only and does not save any information. Results are provided for demonstration and educational purposes.</Text>
            </View>
          </View>

          <View style={styles.stepper}>
            {['Sample Unit', 'Distress Data', 'Density and Deduct Values', 'Total Deduct Value', 'CDV Correction', 'PCI and Rating'].map((label, index) => {
              const complete = isComputed && index < 5;
              const active = isComputed ? index === 5 : index < 2;
              return (
                <View key={label} style={[styles.stepItem, !isDesktop && styles.stepItemCompact]}>
                  <View style={[styles.stepCircle, { backgroundColor: complete || active ? palette.primary : palette.card, borderColor: palette.primary }]}>
                    {complete ? <Feather color="#FFFFFF" name="check" size={18} /> : <Text style={[styles.stepNumber, { color: active ? '#FFFFFF' : palette.primary }]}>{index + 1}</Text>}
                  </View>
                  <Text numberOfLines={1} style={[styles.stepLabel, { color: complete || active ? palette.primary : palette.muted }, active && styles.stepLabelActive]}>{index + 1}. {label}</Text>
                  {index < 5 ? <View style={[styles.stepLine, { backgroundColor: complete ? palette.primary : palette.border }]} /> : null}
                </View>
              );
            })}
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Feather color="#DC2626" name="alert-circle" size={17} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.workspace, !isDesktop && styles.workspaceCompact]}>
            <View style={[styles.leftColumn, !isDesktop && styles.columnCompact]}>
              <Card palette={palette} style={styles.sampleCard}>
                <SectionHeading icon="sample" number={1} palette={palette} subtitle="Enter the sample unit details for the PCI computation." title="Sample Unit Information" />
                <Text style={[styles.fieldLabel, { color: palette.text }]}>Sample Unit Area (Asphalt)</Text>
                <InputShell palette={palette} suffix="m²">
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => { setSampleArea(value); invalidateResult(); }}
                    style={[styles.textInput, { color: palette.text }]}
                    value={sampleArea}
                  />
                </InputShell>
                <View style={[styles.infoBox, { backgroundColor: palette.cardSoft }]}>
                  <Feather color={palette.primary} name="info" size={18} />
                  <Text style={[styles.infoText, { color: palette.secondary }]}>Recommended asphalt sample-unit area: approximately{`\n`}225 ± 90 m² or 2,500 ± 1,000 ft² under ASTM D6433-07.</Text>
                </View>
              </Card>

              <Card palette={palette} style={styles.distressCard}>
                <SectionHeading icon="distress" number={2} palette={palette} subtitle="Select an asphalt distress, set its details, and add it to the list." title="Distress Data" />
                <Text style={[styles.fieldLabel, { color: palette.text }]}>Asphalt Distress Type</Text>
                <Pressable
                  onPress={() => setShowDistressMenu((current) => !current)}
                  style={[styles.selectBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <View style={[styles.roadMiniIcon, { backgroundColor: '#8FA1BF' }]}>
                    <Feather color="#FFFFFF" name="activity" size={17} />
                  </View>
                  <Text numberOfLines={1} style={[styles.selectText, { color: palette.text }]}>{selectedDistress.name}</Text>
                  <Feather color={palette.text} name="chevron-down" size={17} />
                </Pressable>
                {showDistressMenu ? (
                  <ScrollView style={[styles.selectMenu, { backgroundColor: palette.card, borderColor: palette.border }]}>
                    {ASPHALT_DISTRESSES.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setSelectedDistressId(item.id);
                          setSelectedSeverity(item.severities[0] ?? 'Low');
                          setShowDistressMenu(false);
                        }}
                        style={[styles.selectOption, { borderBottomColor: palette.border }]}>
                        <Text style={[styles.selectOptionText, { color: palette.text }]}>{item.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: palette.text }]}>Severity Level</Text>
                  <View style={[styles.segmented, { borderColor: palette.border }]}>
                    {(['Low', 'Medium', 'High'] as const).map((severity) => {
                      const selected = selectedSeverity === severity;
                      return (
                        <Pressable
                          key={severity}
                          onPress={() => setSelectedSeverity(severity)}
                          style={[styles.segment, { borderColor: palette.border }, selected && { backgroundColor: palette.primary }]}>
                          <Text style={[styles.segmentText, { color: selected ? '#FFFFFF' : palette.text }]}>{severity}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: palette.text }]}>Measured Quantity</Text>
                  <View style={styles.quantityInput}>
                    <InputShell palette={palette} suffix={selectedDistress.unit}>
                      <TextInput keyboardType="numeric" onChangeText={setQuantity} placeholder="0" placeholderTextColor={palette.muted} style={[styles.textInput, { color: palette.text }]} value={quantity} />
                    </InputShell>
                  </View>
                </View>
                <Text style={[styles.quantityHelp, { color: palette.secondary }]}>Enter the measured area, length, or number of the distress.</Text>
                <Pressable onPress={handleAdd} style={({ pressed }) => [styles.addButton, { backgroundColor: palette.primary }, pressed && styles.buttonPressed]}>
                  <View style={styles.addIcon}><Feather color={palette.primary} name="plus" size={15} /></View>
                  <Text style={styles.addButtonText}>Add to List</Text>
                </Pressable>
              </Card>
            </View>

            <View style={[styles.centerColumn, !isDesktop && styles.columnCompact]}>
              <Card palette={palette} style={styles.densityCard}>
                <SectionHeading icon="density" number={3} palette={palette} subtitle="List of distresses and their computed density and deduct values." title="Density and Deduct Values" />
                <View style={[styles.table, { borderColor: palette.border }]}>
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
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                    {computedRows.map((entry, index) => {
                      const severityBackground = entry.severity === 'Low' ? '#D9F5E5' : entry.severity === 'Medium' ? '#FFF0C9' : '#FFD9D5';
                      const severityColor = entry.severity === 'Low' ? '#075E2E' : entry.severity === 'Medium' ? '#975300' : '#B20A0A';
                      return (
                        <View key={entry.uid} style={[styles.tableRow, { borderBottomColor: palette.border }]}>
                          <Text style={[styles.cell, styles.numberCol, { color: palette.text }]}>{index + 1}</Text>
                          <Text numberOfLines={1} style={[styles.cell, styles.distressCol, { color: palette.text }]}>{entry.distressName}</Text>
                          <View style={styles.severityCol}><View style={[styles.severityBadge, { backgroundColor: severityBackground }]}><Text style={[styles.severityBadgeText, { color: severityColor }]}>{entry.severity}</Text></View></View>
                          <Text style={[styles.cell, styles.quantityCol, { color: palette.text }]}>{entry.quantity}</Text>
                          <Text style={[styles.cell, styles.unitCol, { color: palette.text }]}>{entry.unit}</Text>
                          <Text style={[styles.cell, styles.densityCol, { color: palette.text }]}>{isComputed ? `${entry.density.toFixed(2)}%` : '—'}</Text>
                          <Text style={[styles.cell, styles.dvCol, styles.boldCell, { color: palette.text }]}>{isComputed ? entry.deductValue : '—'}</Text>
                          <Pressable onPress={() => { setEntries((current) => current.filter((item) => item.uid !== entry.uid)); invalidateResult(); }} style={[styles.actionCol, styles.deleteButton]}>
                            <Feather color="#F01616" name="trash-2" size={16} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </Card>

              <View style={[styles.centerBottom, !isDesktop && styles.centerBottomCompact]}>
                <Card palette={palette} style={styles.totalCard}>
                  <SectionHeading icon="total" number={4} palette={palette} subtitle="Sum of the individual deduct values for the sample unit." title="Total Deduct Value" />
                  <View style={[styles.formulaPanel, { backgroundColor: palette.cardSoft }]}>
                    <Text style={[styles.formulaLabel, { color: palette.text }]}>Individual Deduct Values</Text>
                    <View style={styles.formulaRow}>
                      {displayedResult.distresses.map((entry, index) => (
                        <View key={entry.uid} style={styles.formulaPart}>
                          <View style={[styles.formulaBox, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={[styles.formulaValue, { color: palette.text }]}>{isComputed ? entry.deductValue : '—'}</Text></View>
                          {index < displayedResult.distresses.length - 1 ? <Text style={[styles.formulaOperator, { color: palette.text }]}>+</Text> : null}
                        </View>
                      ))}
                      <Text style={[styles.formulaOperator, { color: palette.text }]}>=</Text>
                      <View style={[styles.formulaTotal, { backgroundColor: palette.blueSoft }]}><Text style={[styles.formulaTotalText, { color: palette.primary }]}>{isComputed ? displayedResult.totalDeductValue : '—'}</Text></View>
                    </View>
                    <Text style={[styles.formulaHelp, { color: palette.secondary }]}>TDV is the sum of the individual Deduct Values{`\n`}recorded for the sample unit.</Text>
                  </View>
                </Card>

                <Card palette={palette} style={styles.cdvCard}>
                  <SectionHeading icon="correction" number={5} palette={palette} subtitle="Apply ASTM D6433-07 correction procedure (illustrative)." title="CDV Correction" />
                  <View style={[styles.cdvStats, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
                    <View style={styles.cdvStat}><Text style={[styles.cdvLabel, { color: palette.secondary }]}>Highest DV:</Text><Text style={[styles.cdvValue, { color: palette.text }]}>{displayedResult.highestDV}</Text></View>
                    <View style={[styles.cdvStatWide, { borderLeftColor: palette.border }]}>
                      <View style={styles.cdvStat}><Text style={[styles.cdvLabel, { color: palette.secondary }]}>Calculated allowable deducts (m):</Text><Text style={[styles.cdvValue, { color: palette.text }]}>{displayedResult.allowableDeducts.toFixed(2)}</Text></View>
                      <View style={styles.cdvStat}><Text style={[styles.cdvLabel, { color: palette.secondary }]}>Actual available deducts:</Text><Text style={[styles.cdvValue, { color: palette.text }]}>{displayedResult.actualDeducts}</Text></View>
                      <View style={styles.cdvNote}><Feather color={palette.primary} name="info" size={14} /><Text style={[styles.cdvNoteText, { color: palette.secondary }]}>Therefore, all four DVs are retained.</Text></View>
                    </View>
                  </View>
                  <Pressable onPress={() => setShowDetails((current) => !current)} style={[styles.detailToggle, { backgroundColor: palette.cardSoft, borderColor: palette.border }]}>
                    <Feather color={palette.primary} name={showDetails ? 'chevron-up' : 'chevron-down'} size={16} />
                    <Text style={[styles.detailToggleText, { color: palette.text }]}>View CDV Correction Details</Text>
                  </Pressable>
                  {showDetails ? (
                    <View style={[styles.cdvTable, { borderColor: palette.border }]}>
                      <View style={[styles.cdvTableRow, styles.cdvTableHeader, { backgroundColor: palette.cardSoft, borderBottomColor: palette.border }]}>
                        <Text style={[styles.cdvHead, styles.iterCol, { color: palette.text }]}>Iteration</Text><Text style={[styles.cdvHead, styles.adjustedCol, { color: palette.text }]}>Adjusted Deduct Values</Text><Text style={[styles.cdvHead, styles.qCol, { color: palette.text }]}>q</Text><Text style={[styles.cdvHead, styles.tdvCol, { color: palette.text }]}>TDV</Text><Text style={[styles.cdvHead, styles.cdvCol, { color: palette.text }]}>CDV (Illustrative)</Text>
                      </View>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {displayedResult.cdvIterations.map((iteration) => (
                          <View key={iteration.iteration} style={[styles.cdvTableRow, { borderBottomColor: palette.border }]}>
                            <Text style={[styles.cdvCell, styles.iterCol, { color: palette.text }]}>{iteration.iteration}</Text><Text style={[styles.cdvCell, styles.adjustedCol, { color: palette.text }]}>{iteration.adjustedDVs.join(', ')}</Text><Text style={[styles.cdvCell, styles.qCol, { color: palette.text }]}>{iteration.q}</Text><Text style={[styles.cdvCell, styles.tdvCol, { color: palette.text }]}>{iteration.tdv}</Text><Text style={[styles.cdvCell, styles.cdvCol, styles.boldCell, { color: palette.text }]}>{iteration.cdv}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                  <View style={[styles.maxCdv, { backgroundColor: palette.cardSoft }]}><Text style={[styles.maxCdvLabel, { color: palette.text }]}>Maximum CDV (Illustrative)</Text><Text style={[styles.maxCdvValue, { color: palette.text }]}>{displayedResult.maxCDV}</Text></View>
                  <Text style={[styles.cdvFootnote, { color: palette.secondary }]}>CDV is obtained through the ASTM D6433-07 correction procedure using the applicable q and TDV values. The CDV values shown are illustrative and should be generated by the verified ASTM PCI engine.</Text>
                </Card>
              </View>
            </View>

            <View style={[styles.rightColumn, !isDesktop && styles.columnCompact]}>
              <Card palette={palette} style={styles.ratingCard}>
                <SectionHeading icon="rating" number={6} palette={palette} subtitle="Final PCI value and corresponding condition rating." title="PCI and Condition Rating" />
                <RatingGauge palette={palette} result={displayedResult} />
                <View style={styles.ratingSummary}>
                  <Text style={[styles.conditionLabel, { color: palette.text }]}>Condition Rating</Text>
                  <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>{isComputed ? displayedResult.rating.toUpperCase() : 'PENDING'}</Text></View>
                  <Text style={[styles.ratingDescription, { color: palette.secondary }]}>{isComputed ? displayedResult.ratingDescription : 'Compute the sample to display its pavement condition.'}</Text>
                </View>
                <View style={[styles.legend, { borderColor: palette.border }]}>
                  <View style={styles.legendHeading}><Feather color={palette.primary} name="info" size={17} /><Text style={[styles.legendTitle, { color: palette.text }]}>PCI Condition Rating Legend</Text></View>
                  {CONDITION_RATINGS.map((rating) => (
                    <View key={rating.rating} style={[styles.legendRow, { backgroundColor: `${rating.color}22` }]}>
                      <View style={styles.legendName}><View style={[styles.legendDot, { backgroundColor: rating.color }]} /><Text style={[styles.legendText, { color: palette.text }]}>{rating.rating}</Text></View>
                      <Text style={[styles.legendRange, { color: palette.text }]}>{rating.minPCI} – {rating.maxPCI}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          </View>

          <View style={[styles.bottomRow, !isDesktop && styles.bottomRowCompact]}>
            <Notes palette={palette} />
            <View style={[styles.actions, !isDesktop && styles.actionsCompact]}>
              <Pressable onPress={handleReset} style={({ pressed, hovered }) => [styles.secondaryButton, { backgroundColor: pressed ? palette.cardSoft : hovered ? palette.cardSoft : palette.card, borderColor: hovered ? palette.muted : palette.border, transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }] }] as any}><Feather color={palette.text} name="rotate-ccw" size={21} /><Text style={[styles.secondaryButtonText, { color: palette.text }]}>Reset Demonstration</Text></Pressable>
              <Pressable onPress={handleTryAnother} style={({ pressed, hovered }) => [styles.secondaryButton, { backgroundColor: pressed ? palette.cardSoft : hovered ? palette.blueSoft : palette.card, borderColor: hovered ? palette.primary : palette.border, transform: hovered && !pressed ? [{ scale: 1.01 }] : [{ scale: 1 }] }] as any}><Feather color={palette.primary} name="refresh-cw" size={21} /><Text style={[styles.secondaryButtonText, { color: palette.text }]}>Try Another Example</Text></Pressable>
              <Pressable onPress={handleCompute} style={({ pressed, hovered }) => [styles.computeButton, { backgroundColor: pressed ? palette.primaryDark : hovered ? palette.secondary : palette.primary, transform: hovered && !pressed ? [{ scale: 1.02 }] : [{ scale: 1 }] }] as any}><Feather color="#FFFFFF" name="cpu" size={20} /><Text style={styles.computeButtonText}>Compute PCI</Text></Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.footer, { borderTopColor: palette.border, backgroundColor: isDark ? '#0A1730' : '#FFFFFF' }]}>
          <View style={styles.footerBrand}><Image contentFit="contain" source={logoImage} style={styles.footerLogo} /><Text style={[styles.footerName, { color: palette.text }]}>LAKAD</Text><View style={[styles.footerDivider, { backgroundColor: palette.border }]} /><Text style={[styles.footerDescription, { color: palette.secondary }]}>Local Asphalt Konditioning Assessment and Data-Driven Prioritization</Text></View>
          <View style={styles.footerRight}><Text style={[styles.footerText, { color: palette.secondary }]}>Where Data Meets the Road</Text><Text style={[styles.footerText, { color: palette.secondary }]}>v1.0 (Prototype)</Text></View>
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
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 70, paddingVertical: 10, justifyContent: 'space-between', paddingHorizontal: 40, zIndex: 5 },
  headerLeft: { alignItems: 'center', flexDirection: 'row', gap: 22 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 28 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandLogo: { height: 55, width: 55 },
  brandLogoCompact: { height: 52, width: 52 },
  brandName: { color: '#071957', fontSize: 29, fontWeight: '900', letterSpacing: 0.4, lineHeight: 30 },
  brandNameCompact: { color: '#071957', fontSize: 24, fontWeight: '900', lineHeight: 25 },
  brandTag: { color: '#071957', fontSize: 10.5, fontWeight: '700' },
  brandTagCompact: { color: '#071957', fontSize: 9, fontWeight: '700' },
  brandInverse: { color: '#FFFFFF' },
  prototypeBadge: { borderRadius: 10, paddingHorizontal: 17, paddingVertical: 9 },
  prototypeBadgeText: { fontSize: 16, fontWeight: '800' },
  themeControls: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  toggleTrack: { backgroundColor: '#0C3D83', borderRadius: 12, height: 20, justifyContent: 'center', paddingHorizontal: 2, width: 37 },
  toggleThumb: { backgroundColor: '#FFFFFF', borderRadius: 8, height: 16, width: 16 },
  toggleThumbDark: { alignSelf: 'flex-end' },
  backButton: { alignItems: 'center', backgroundColor: '#082B64', borderRadius: 6, boxShadow: '0 3px 8px rgba(11,46,100,0.18)', flexDirection: 'row', gap: 10, height: 40, justifyContent: 'center', paddingHorizontal: 18 },
  backButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.82 },
  scrollContent: { flexGrow: 1 },
  hero: { backgroundColor: '#062A58', minHeight: 160, overflow: 'hidden', position: 'relative', width: '100%', justifyContent: 'center', paddingVertical: 24 },
  heroBackdropTexture: { height: '100%', opacity: 0.35, position: 'absolute', width: '100%' },
  heroOverlay: { alignItems: 'center', backgroundColor: 'rgba(2, 38, 82, 0.48)', flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 45 },
  heroLeft: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.5, lineHeight: 41 },
  heroSubtitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', lineHeight: 24 },
  heroRight: { alignItems: 'center', flexDirection: 'row', gap: 28 },
  quoteWrap: { alignItems: 'center', minWidth: 320 },
  quote: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  quoteUnderline: { backgroundColor: '#FFFFFF', height: 3, marginTop: 8, width: 28 },
  heroDivider: { backgroundColor: 'rgba(255,255,255,0.42)', height: 78, width: 1 },
  main: { gap: 11, paddingHorizontal: 36, paddingTop: 11, width: '100%' },
  mainCompact: { paddingHorizontal: 16 },
  warning: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 7, minHeight: 56, paddingHorizontal: 15, paddingVertical: 8 },
  warningIcon: { alignItems: 'center', backgroundColor: '#FFA300', borderRadius: 16, height: 30, justifyContent: 'center', marginRight: 14, width: 30 },
  warningIconText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  warningCopy: { flex: 1 },
  warningTitle: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  warningText: { fontSize: 12, lineHeight: 17 },
  stepper: { alignItems: 'center', flexDirection: 'row', minHeight: 45, paddingHorizontal: 31 },
  stepItem: { alignItems: 'center', flexDirection: 'row', flex: 1, minWidth: 0 },
  stepItemCompact: { flexBasis: 220, marginBottom: 8 },
  stepCircle: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  stepNumber: { fontSize: 17, fontWeight: '800' },
  stepLabel: { fontSize: 12, marginLeft: 10 },
  stepLabelActive: { fontWeight: '800' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 15, minWidth: 12 },
  errorBanner: { alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 6, flexDirection: 'row', gap: 8, padding: 9 },
  errorText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },
  workspace: { alignItems: 'stretch', flexDirection: 'row', gap: 10 },
  workspaceCompact: { flexDirection: 'column', height: 'auto' },
  leftColumn: { flex: 1.08, gap: 11, minWidth: 0 },
  centerColumn: { flex: 2.12, gap: 11, minWidth: 0 },
  rightColumn: { flex: 0.86, minWidth: 0 },
  columnCompact: { flex: 0, width: '100%' },
  centerBottom: { flexDirection: 'row', gap: 10, height: 331 },
  centerBottomCompact: { flexDirection: 'column', height: 'auto' },
  card: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  sampleCard: { height: 227 },
  distressCard: { height: 331, position: 'relative', zIndex: 4 },
  densityCard: { height: 227 },
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
  inlineLabel: { fontSize: 12, fontWeight: '700', width: 112 },
  segmented: { borderRadius: 5, borderWidth: 1, flex: 1, flexDirection: 'row', height: 39, overflow: 'hidden' },
  segment: { alignItems: 'center', borderRightWidth: 1, flex: 1, justifyContent: 'center' },
  segmentText: { fontSize: 12 },
  quantityInput: { flex: 1 },
  quantityHelp: { fontSize: 10, lineHeight: 14, marginLeft: 112, marginTop: 6 },
  addButton: { alignItems: 'center', borderRadius: 5, flexDirection: 'row', gap: 12, height: 43, justifyContent: 'center', marginTop: 12 },
  addIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 9, height: 18, justifyContent: 'center', width: 18 },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  table: { borderRadius: 6, borderWidth: 1, flex: 1, overflow: 'hidden' },
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
  severityBadge: { alignItems: 'center', borderRadius: 4, justifyContent: 'center', paddingVertical: 4, width: 60 },
  severityBadgeText: { fontSize: 10 },
  formulaPanel: { borderRadius: 6, marginTop: 8, padding: 10 },
  formulaLabel: { fontSize: 11, marginBottom: 12 },
  formulaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  formulaPart: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  formulaBox: { alignItems: 'center', borderRadius: 5, borderWidth: 1, height: 40, justifyContent: 'center', minWidth: 36 },
  formulaValue: { fontSize: 15, fontWeight: '600' },
  formulaOperator: { fontSize: 16, fontWeight: '700' },
  formulaTotal: { alignItems: 'center', borderRadius: 5, height: 42, justifyContent: 'center', minWidth: 45 },
  formulaTotalText: { fontSize: 20, fontWeight: '800' },
  formulaHelp: { fontSize: 11, lineHeight: 17, marginTop: 13 },
  cdvStats: { borderRadius: 6, borderWidth: 1, flexDirection: 'row', minHeight: 56, padding: 6 },
  cdvStat: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  cdvStatWide: { borderLeftWidth: 1, flex: 1, marginLeft: 10, paddingLeft: 11 },
  cdvLabel: { fontSize: 10 },
  cdvValue: { fontSize: 14, fontWeight: '800' },
  cdvNote: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 3 },
  cdvNoteText: { fontSize: 9.5 },
  detailToggle: { alignItems: 'center', borderRadius: 5, borderWidth: 1, flexDirection: 'row', gap: 8, height: 29, marginTop: 5, paddingHorizontal: 8 },
  detailToggleText: { fontSize: 10, fontWeight: '700' },
  cdvTable: { borderWidth: 1, flex: 1, overflow: 'hidden' },
  cdvTableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 18 },
  cdvTableHeader: { minHeight: 23 },
  cdvHead: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  cdvCell: { fontSize: 9.5, textAlign: 'center' },
  iterCol: { flex: 0.7 },
  adjustedCol: { flex: 1.8 },
  qCol: { flex: 0.55 },
  tdvCol: { flex: 0.62 },
  cdvCol: { flex: 1.25 },
  maxCdv: { alignItems: 'center', borderRadius: 4, flexDirection: 'row', height: 30, justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 10 },
  maxCdvLabel: { fontSize: 11, fontWeight: '700' },
  maxCdvValue: { fontSize: 19, fontWeight: '900' },
  cdvFootnote: { fontSize: 9, lineHeight: 11, marginTop: 3 },
  gaugeArea: { alignItems: 'center', height: 152, justifyContent: 'center', marginTop: 1, overflow: 'hidden', position: 'relative' },
  gaugeRing: { borderRadius: 95, height: 190, position: 'absolute', top: 4, width: 190 },
  gaugeCutout: { borderRadius: 73, height: 146, left: 22, position: 'absolute', top: 22, width: 146 },
  gaugeValueWrap: { alignItems: 'center', marginTop: 13 },
  gaugeValue: { fontSize: 56, fontWeight: '900', letterSpacing: -1, lineHeight: 59 },
  gaugeOutOf: { fontSize: 18, lineHeight: 23 },
  ratingSummary: { alignItems: 'center', marginTop: -3 },
  conditionLabel: { fontSize: 11, fontWeight: '700' },
  ratingBadge: { alignItems: 'center', backgroundColor: '#FFF0C9', borderColor: '#FFE09A', borderRadius: 5, borderWidth: 1, minHeight: 36, justifyContent: 'center', marginTop: 4, minWidth: 116, paddingHorizontal: 12, paddingVertical: 4 },
  ratingBadgeText: { color: '#975300', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  ratingDescription: { fontSize: 11, lineHeight: 14, marginTop: 5, paddingHorizontal: 20, textAlign: 'center' },
  legend: { borderRadius: 6, borderWidth: 1, marginTop: 7, padding: 6 },
  legendHeading: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 5 },
  legendTitle: { fontSize: 11, fontWeight: '800' },
  legendRow: { alignItems: 'center', borderRadius: 4, flexDirection: 'row', height: 28, justifyContent: 'space-between', marginBottom: 1, paddingHorizontal: 14 },
  legendName: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  legendDot: { borderRadius: 7, height: 14, width: 14 },
  legendText: { fontSize: 11 },
  legendRange: { fontSize: 11 },
  bottomRow: { alignItems: 'center', flexDirection: 'row', gap: 22, minHeight: 74 },
  bottomRowCompact: { alignItems: 'stretch', flexDirection: 'column' },
  notesBox: { alignItems: 'flex-start', borderRadius: 7, borderWidth: 1, flex: 1.4, flexDirection: 'row', minHeight: 85, padding: 10 },
  notesContent: { flex: 1, marginLeft: 12 },
  notesTitle: { fontSize: 11, fontWeight: '800', marginBottom: 1 },
  notesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  noteItem: { flexDirection: 'row', width: '50%' },
  noteBullet: { fontSize: 11, lineHeight: 14, marginRight: 7 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 14 },
  actions: { flex: 1, flexDirection: 'row', gap: 11, justifyContent: 'flex-end', transform: [{ translateY: -6 }] },
  actionsCompact: { flexWrap: 'wrap' },
  secondaryButton: { alignItems: 'center', borderRadius: 5, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 11, height: 44, justifyContent: 'center', minWidth: 170, paddingHorizontal: 12 },
  secondaryButtonText: { fontSize: 11, fontWeight: '600' },
  computeButton: { alignItems: 'center', borderRadius: 5, flex: 0.95, flexDirection: 'row', gap: 12, height: 44, justifyContent: 'center', minWidth: 170, paddingHorizontal: 14 },
  computeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', height: 42, justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 36 },
  footerBrand: { alignItems: 'center', flexDirection: 'row' },
  footerLogo: { height: 20, width: 20 },
  footerName: { fontSize: 12, fontWeight: '900', marginLeft: 4 },
  footerDivider: { height: 16, marginHorizontal: 8, width: 1 },
  footerDescription: { fontSize: 10 },
  footerRight: { flexDirection: 'row', gap: 20 },
  footerText: { fontSize: 10 },
});
