import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';
import { Card, DISTRESS_COLUMNS, Field, formatNumber, InspectionProgress, SeverityLevel, TableRow, ValueBox } from '@/components/workflow/distress-entry';
import { PciResultCards } from '@/components/workflow/inspection-results';
import { CatalogDropdown, Notice } from '@/components/workflow/shared';
import { brand, layout } from '@/lib/ui/design-system';
import { EDITION } from '@/lib/d6433-07/catalog';
import { measureParts, type MeasurementPart, type PartDraft } from '@/lib/d6433-07/measurement-parts';
import { d07GuidanceFor } from '@/lib/d6433-07/severity-guidance';
import { computeDemoOnServer, DemoCalculationError } from '@/lib/data/demo-calculation';
import type { SampleOutput } from '@/lib/d6433-07/sample';
import { ASPHALT_DISTRESSES, computeDemoPci, CONDITION_RATINGS, generateUID, type DemoEntry, type Severity } from '@/lib/pci/pci-engine';
import { getPciConditionVisual } from '@/lib/pci/pci-classification';
import { isSampleUnitAreaAllowed, SAMPLE_UNIT_GUIDANCE, SAMPLE_UNIT_MAX_AREA, SAMPLE_UNIT_MIN_AREA } from '@/lib/pci/pci-service';
import { useAppTheme } from '@/providers/ThemeProvider';

const heroImage = require('../../assets/images/lakad_hero_bg.png');
const logoImage = require('../../assets/images/LAKAD.png');

const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high'];
const SEVERITY_LETTERS: Record<Severity, string> = { low: 'L', medium: 'M', high: 'H' };
const DISTRESS_OPTIONS = [...ASPHALT_DISTRESSES]
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  .map(item => ({ value: String(item.code), label: item.name }));

/** One measured part in the practice table, the same unit of entry as the encoder's table rows. */
type PracticeRow = { id: string; code: number; severity: Severity | null; part: MeasurementPart };
type Example = { length: string; width: string; rows: Omit<PracticeRow, 'id'>[] };

/** Ready-made sample units (25 × 10 m = 250 m²) that show the shortcut and the §9.5.4 fractional deduct. */
const EXAMPLES: Example[] = [
  {
    length: '25', width: '10', rows: [
      { code: 1, severity: 'low', part: { mode: 'rectangle', length_m: 2.5, width_m: 2 } },
      { code: 10, severity: 'medium', part: { mode: 'length', length_m: 8 } },
      { code: 13, severity: 'high', part: { mode: 'small_pothole', count: 2, diameter_mm: 500, depth_mm: 40 } },
      { code: 19, severity: 'medium', part: { mode: 'rectangle', length_m: 4, width_m: 3 } },
    ],
  },
  {
    length: '25', width: '10', rows: [
      { code: 1, severity: 'high', part: { mode: 'rectangle', length_m: 5, width_m: 3 } },
      { code: 15, severity: 'high', part: { mode: 'rectangle', length_m: 4, width_m: 2 } },
      { code: 3, severity: 'medium', part: { mode: 'rectangle', length_m: 5, width_m: 3 } },
      { code: 7, severity: 'low', part: { mode: 'length', length_m: 10 } },
      { code: 11, severity: 'medium', part: { mode: 'rectangle', length_m: 3, width_m: 2 } },
    ],
  },
];

/** Positive finite number, or null while the field is empty or incomplete. */
function positive(raw: string) {
  const value = Number(raw);
  return raw.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

function partQuantity(part: MeasurementPart) {
  switch (part.mode) {
    case 'rectangle': return part.length_m * part.width_m;
    case 'irregular': return part.area_sqm;
    case 'length': return part.length_m;
    case 'small_pothole': return part.count;
    case 'large_pothole': return part.area_sqm / 0.5;
  }
}

function distress(code: number) {
  return ASPHALT_DISTRESSES.find(item => item.code === code)!;
}

function exampleRows(example: Example): PracticeRow[] {
  return example.rows.map(row => ({ ...row, id: generateUID() }));
}

/** Sun/moon button; same style as the landing and sign-in theme buttons. */
function ThemeToggle({ compact, isDark, onPress, border, surface, hover, accent }: { compact: boolean; isDark: boolean; onPress: () => void; border: string; surface: string; hover: string; accent: string }) {
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
          backgroundColor: hovered ? hover : surface,
          borderColor: hovered ? accent : border,
          boxShadow: hovered ? '0 8px 20px rgba(24,80,224,0.18)' : 'none',
          transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.94 : 1 }],
        },
      ] as any}>
      {({ hovered }: any) => (
        <Feather color={isDark ? '#FFD66B' : accent} name={isDark ? 'sun' : 'moon'} size={18} style={{ transform: [{ rotate: hovered ? (isDark ? '45deg' : '-18deg') : '0deg' }] }} />
      )}
    </Pressable>
  );
}

/**
 * Public PCI prototype: the encoder's sample-unit workspace without a branch, section or saving.
 * Card 1 measures the sample unit, card 2 records one measured part per "Add distress", the table
 * lists the parts, and Compute PCI fills cards 3–6 with illustrative curves.
 */
export default function PrototypePage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const isDark = colorScheme === 'dark';
  const p = useAdminPalette();
  const isPhone = width < 600;
  const isNarrowPhone = width < 390;
  const isDesktop = width >= layout.columns;
  const wide = width >= layout.compact;

  const [sampleLength, setSampleLength] = useState(EXAMPLES[0].length);
  const [sampleWidth, setSampleWidth] = useState(EXAMPLES[0].width);
  const [rows, setRows] = useState<PracticeRow[]>(() => exampleRows(EXAMPLES[0]));
  const [exampleIndex, setExampleIndex] = useState(0);
  const [code, setCode] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [length, setLength] = useState('');
  const [breadth, setBreadth] = useState('');
  const [count, setCount] = useState('');
  const [diameter, setDiameter] = useState('');
  const [depth, setDepth] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [result, setResult] = useState<SampleOutput | null>(null);
  /** Where the shown PCI came from, and why the server was not used. */
  const [source, setSource] = useState<{ kind: 'server' } | { kind: 'illustrative'; reason: string } | null>(null);
  const [computing, setComputing] = useState(false);
  /** Bumped on every input change, so a slow server reply for old inputs is ignored. */
  const request = useRef(0);
  const [entryError, setEntryError] = useState('');
  const [computeError, setComputeError] = useState('');
  const [formHeight, setFormHeight] = useState(0);
  const resultsRef = useRef<ComponentRef<typeof View>>(null);

  const item = code ? distress(Number(code)) : undefined;
  const unit = item?.unit ?? 'm²';
  const guidance = item ? d07GuidanceFor(EDITION, item.code) : undefined;
  const needsSeverity = !!item && item.severities.length > 0;

  const sampleLengthValue = positive(sampleLength), sampleWidthValue = positive(sampleWidth);
  const typedArea = sampleLengthValue && sampleWidthValue ? Math.round(sampleLengthValue * sampleWidthValue * 100) / 100 : null;
  const areaOutOfRange = typedArea !== null && !isSampleUnitAreaAllowed(typedArea);

  const draft: PartDraft = unit === 'No.'
    ? { mode: 'small_pothole', length: '', width: '', area: '', count, diameter, depth }
    : unit === 'm' ? { mode: 'length', length, width: '', area: '', count: '', diameter: '', depth: '' }
      : { mode: 'rectangle', length, width: breadth, area: '', count: '', diameter: '', depth: '' };
  const lengthValue = positive(length), breadthValue = positive(breadth), countValue = positive(count);
  const preview = unit === 'No.' ? countValue : unit === 'm' ? lengthValue : lengthValue && breadthValue ? lengthValue * breadthValue : null;
  const editingIndex = editing ? rows.findIndex(row => row.id === editing) : -1;

  /** Any change to the inputs clears the computed PCI, as in the inspection workflow. */
  function clearResult() {
    request.current += 1;
    setResult(null);
    setSource(null);
    setComputing(false);
    setComputeError('');
  }
  function changeRows(next: PracticeRow[]) {
    setRows(next);
    clearResult();
  }
  function clearMeasurement() {
    setLength(''); setBreadth(''); setCount(''); setDiameter(''); setDepth(''); setSeverity(''); setEditing(null); setEntryError('');
  }

  function saveDistress() {
    try {
      if (!item) throw new Error('Choose a distress type.');
      if (needsSeverity && !severity) throw new Error('Choose the description that matches what you observed.');
      const level = needsSeverity ? severity as Severity : null;
      const part = measureParts([draft], item.unit, level).parts[0];
      changeRows(editing
        ? rows.map(row => (row.id === editing ? { ...row, code: item.code, severity: level, part } : row))
        : [...rows, { id: generateUID(), code: item.code, severity: level, part }]);
      clearMeasurement();
    } catch (reason) {
      setEntryError(reason instanceof Error ? reason.message : 'This measurement could not be added.');
    }
  }

  function startEdit(row: PracticeRow) {
    setCode(String(row.code));
    setSeverity(row.severity ?? '');
    setLength(''); setBreadth(''); setCount(''); setDiameter(''); setDepth('');
    if (row.part.mode === 'rectangle') { setLength(String(row.part.length_m)); setBreadth(String(row.part.width_m)); }
    else if (row.part.mode === 'length') setLength(String(row.part.length_m));
    else if (row.part.mode === 'small_pothole') { setCount(String(row.part.count)); setDiameter(String(row.part.diameter_mm)); setDepth(String(row.part.depth_mm)); }
    setEditing(row.id);
    setEntryError('');
  }

  function deleteRow(id: string) {
    changeRows(rows.filter(row => row.id !== id));
    if (editing === id) clearMeasurement();
  }

  function showResults() {
    // Web: bring steps 3–6 into view. Native keeps the user's scroll position.
    if (Platform.OS === 'web') (resultsRef.current as unknown as HTMLElement | null)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /** Server first (provisional curves, nothing saved); illustrative curves only when the server is unavailable. */
  async function computePci() {
    clearResult();
    const current = request.current;
    const message = (reason: unknown) => (reason instanceof Error ? reason.message : 'The PCI could not be computed.');
    if (typedArea === null) { setComputeError('Enter the sample unit length and width.'); return; }
    if (!isSampleUnitAreaAllowed(typedArea)) { setComputeError(`The sample unit area must be ${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m². ${formatNumber(typedArea)} m² is outside that range.`); return; }
    // §9.1: parts of the same distress and severity form one record.
    const grouped = new Map<string, DemoEntry>();
    for (const row of rows) {
      const key = `${row.code}:${row.severity}`;
      const previous = grouped.get(key);
      grouped.set(key, { uid: key, code: row.code, severity: row.severity, quantity: (previous?.quantity ?? 0) + partQuantity(row.part) });
    }
    const entries = [...grouped.values()];
    setComputing(true);
    try {
      const output = await computeDemoOnServer(typedArea, entries.map(({ code, severity, quantity }) => ({ code, severity, quantity })));
      if (current !== request.current) return;
      setResult(output);
      setSource({ kind: 'server' });
      showResults();
    } catch (reason) {
      if (current !== request.current) return;
      if (reason instanceof DemoCalculationError && reason.reason === 'input') { setComputeError(reason.message); return; }
      try {
        setResult(computeDemoPci(entries, typedArea));
        setSource({ kind: 'illustrative', reason: message(reason) });
        showResults();
      } catch (fallback) {
        setComputeError(message(fallback));
      }
    } finally {
      if (current === request.current) setComputing(false);
    }
  }

  function loadExample() {
    // An empty table loads the current example; otherwise switch to the other one.
    const index = rows.length ? (exampleIndex + 1) % EXAMPLES.length : exampleIndex;
    const example = EXAMPLES[index];
    setExampleIndex(index);
    setSampleLength(example.length);
    setSampleWidth(example.width);
    changeRows(exampleRows(example));
    clearMeasurement();
  }

  function clearAll() {
    setSampleLength('');
    setSampleWidth('');
    changeRows([]);
    clearMeasurement();
    setCode('');
  }

  const done = [typedArea !== null && !areaOutOfRange, rows.length > 0, !!result, !!result, !!result, !!result];
  const pending = [...new Map(rows.map(row => [`${row.code}:${row.severity}`, row])).values()]
    .map(row => ({ key: `${row.code}:${row.severity}`, name: distress(row.code).name, severity: row.severity }));

  const form = <View onLayout={event => { const h = Math.round(event.nativeEvent.layout.height); setFormHeight(current => (Math.abs(current - h) < 2 ? current : h)); }} style={{ gap: 16, width: wide ? 360 : '100%' }}>
    <Card palette={p} title="1. Sample Unit Information">
      <Text accessibilityRole="header" style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Sample Unit Area</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field palette={p} label="Length (m)" accessibilityLabel="Sample unit length (m)" value={sampleLength} onChangeText={value => { setSampleLength(value); clearResult(); }} editable />
        <Field palette={p} label="Width (m)" accessibilityLabel="Sample unit width (m)" value={sampleWidth} onChangeText={value => { setSampleWidth(value); clearResult(); }} editable />
      </View>
      <ValueBox palette={p} label={`Sample unit area: ${typedArea === null ? 'not yet measured' : `${formatNumber(typedArea)} m²`}`} value={typedArea === null ? '' : formatNumber(typedArea)} unit="m²" />
      <Text style={{ color: areaOutOfRange ? p.amber : p.muted, fontSize: 13, lineHeight: 19 }}>
        {areaOutOfRange ? `${formatNumber(typedArea!)} m² is outside ${SAMPLE_UNIT_MIN_AREA}–${SAMPLE_UNIT_MAX_AREA} m². ` : ''}{SAMPLE_UNIT_GUIDANCE}
      </Text>
    </Card>

    <Card palette={p} title="2. Distress Data">
      {editingIndex >= 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderLeftWidth: 4, borderColor: p.blue, backgroundColor: p.blueSoft }}>
        <Text style={{ color: p.text, flex: 1, fontWeight: '600' }}>Editing row {editingIndex + 1}. Change the values, then update.</Text>
      </View>}
      <CatalogDropdown label="Distress type" value={code} options={DISTRESS_OPTIONS} onChange={value => { setCode(value); setSeverity(''); setEntryError(''); }} />
      {!!guidance?.context && <Text selectable style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>{guidance.context}</Text>}
      {/* Long severity descriptions scroll inside a fixed-height box instead of stretching the card. */}
      {item && needsSeverity && guidance && <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 240 }} contentContainerStyle={{ paddingRight: 4 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Observed condition" style={{ gap: 8 }}>
          {SEVERITIES.filter(level => guidance[level]).map(level => {
            const selected = severity === level;
            return <Pressable key={level} accessibilityRole="radio" accessibilityLabel={guidance[level]} aria-checked={selected} onPress={() => setSeverity(level)}
              style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderColor: selected ? p.text : p.border, backgroundColor: selected ? p.tabActive : p.panel }}>
              <Text style={{ color: p.text, fontSize: 15, lineHeight: 21 }}>{guidance[level]}</Text>
            </Pressable>;
          })}
        </View>
      </ScrollView>}
      {item && needsSeverity && guidance && <SeverityLevel palette={p} severity={severity} />}
      {item && !needsSeverity && <Text style={{ color: p.muted, lineHeight: 20 }}>{guidance?.none ?? 'No severity level for this distress. Record the measured quantity.'}</Text>}

      <Text accessibilityRole="header" style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Distress Measurement</Text>
      {unit === 'No.' ? <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field palette={p} label="Count" value={count} onChangeText={setCount} editable />
          <Field palette={p} label="Diameter (mm)" value={diameter} onChangeText={setDiameter} editable />
          <Field palette={p} label="Depth (mm)" value={depth} onChangeText={setDepth} editable />
        </View>
        <Text style={{ color: p.muted, fontSize: 13 }}>Small holes only (100 to under 750 mm). The diameter and depth must match the chosen severity.</Text>
      </> : <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field palette={p} label="Length (m)" accessibilityLabel="Distress length (m)" value={length} onChangeText={setLength} editable />
        {unit === 'm²' && <Field palette={p} label="Width (m)" accessibilityLabel="Distress width (m)" value={breadth} onChangeText={setBreadth} editable />}
      </View>}
      <ValueBox palette={p} label={`Computed ${unit === 'm²' ? 'area' : 'quantity'}: ${preview === null ? 'not yet available' : `${formatNumber(preview)} ${unit}`}`} value={preview === null ? '' : formatNumber(preview)} unit={unit} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ flexGrow: 1 }}>
          <AdminButton palette={p} label={editingIndex >= 0 ? 'Update distress' : 'Add distress'} disabled={!item} onPress={saveDistress} />
        </View>
        {editingIndex >= 0 && <AdminButton palette={p} tone="secondary" label="Cancel edit" onPress={clearMeasurement} />}
      </View>
      {!!entryError && <Notice error>{entryError}</Notice>}
    </Card>
  </View>;

  // Wide screens: the table is exactly as tall as cards 1 and 2 together; its rows scroll inside.
  const tableHeight = wide && formHeight > 0 ? formHeight : undefined;
  const table = <View style={{ flex: wide ? 1 : undefined, minWidth: 0, height: tableHeight, borderWidth: 1, borderColor: p.border, borderRadius: 10, backgroundColor: p.panel, padding: 16, gap: 14 }}>
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }} style={{ flex: tableHeight ? 1 : undefined }}>
      <View accessibilityLabel="Recorded distresses" style={{ minWidth: 720, flex: 1, borderWidth: 1, borderColor: p.border, borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: brand.navy, paddingVertical: 10, paddingHorizontal: 8 }}>
          {DISTRESS_COLUMNS.map(column => <Text key={column.label} style={{ flex: column.flex, color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: column.align }}>{column.label}</Text>)}
        </View>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={tableHeight ? { flex: 1 } : { maxHeight: 420 }}>
          {rows.map((row, index) => {
            const name = distress(row.code).name;
            return <TableRow key={row.id} palette={p} index={index + 1} part={row.part} name={name} fallback=""
              selected={editing === row.id}
              severity={row.severity ? SEVERITY_LETTERS[row.severity] : '—'}
              onEdit={() => startEdit(row)}
              onDelete={() => deleteRow(row.id)} />;
          })}
          {!rows.length && <Text style={{ color: p.muted, padding: 16, textAlign: 'center' }}>No distress added yet. Computing with no distress gives PCI 100.</Text>}
        </ScrollView>
      </View>
    </ScrollView>
    {!!computeError && <Notice error>{computeError}</Notice>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <AdminButton palette={p} icon="activity" label={computing ? 'Computing…' : 'Compute PCI'} disabled={computing} onPress={() => void computePci()} />
      <AdminButton palette={p} tone="secondary" icon="refresh-cw" label={rows.length ? 'Try another example' : 'Load an example'} onPress={loadExample} />
      <AdminButton palette={p} tone="secondary" icon="rotate-ccw" label="Clear all" onPress={clearAll} />
    </View>
  </View>;

  const legend = <View>
    <Card palette={p} title="PCI Condition Rating Legend">
      <View style={{ gap: 4 }}>
        {CONDITION_RATINGS.map(rating => {
          const visual = getPciConditionVisual(rating, isDark);
          return <View key={rating.rating} style={[styles.legendRow, { backgroundColor: visual.backgroundColor, borderColor: visual.borderColor }]}>
            <View style={styles.legendName}><View style={[styles.legendDot, { backgroundColor: visual.accentColor }]} /><Text style={{ color: visual.foregroundColor, fontSize: 14 }}>{rating.rating}</Text></View>
            <Text style={{ color: visual.foregroundColor, fontSize: 14 }}>{rating.range}</Text>
          </View>;
        })}
      </View>
    </Card>
  </View>;

  const chromeSurface = isDark ? '#0A1638' : '#FFFFFF';

  return (
    <View style={[styles.page, { backgroundColor: p.background }]}>
      <View style={[styles.header, isPhone && styles.headerMobile, { backgroundColor: chromeSurface, borderBottomColor: p.border }]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Back to Home" hitSlop={6} onPress={() => router.push('/')} style={styles.homeLink}>
          {({ hovered, pressed }: any) => (
            <>
              <Feather color={p.text} name="arrow-left" size={20} style={{ transform: [{ translateX: hovered && !pressed ? -3 : 0 }] }} />
              <Text style={[styles.homeLinkText, { color: p.text, textDecorationLine: hovered ? 'underline' : 'none' }]}>Back to Home</Text>
            </>
          )}
        </Pressable>
        <View style={styles.headerRight}>
          <ThemeToggle compact={isPhone} isDark={isDark} onPress={toggleColorScheme} border={p.border} surface={p.panel} hover={p.blueSoft} accent={p.action} />
          <Pressable onPress={() => router.push('/login')} style={({ pressed, hovered }: any) => [styles.signIn, isPhone && styles.signInMobile, pressed && styles.buttonPressed, hovered && !pressed && { transform: [{ translateY: -1 }], backgroundColor: brand.deep, boxShadow: '0 8px 20px rgba(24,80,224,0.32)' }] as any}>
            <Feather color="#FFFFFF" name="log-in" size={17} />
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, isPhone && styles.heroMobile]}>
          <Image contentFit="cover" contentPosition={{ left: '50%', top: '68%' }} source={heroImage} style={styles.heroBackdrop} />
          <View style={[styles.heroOverlay, isPhone && styles.heroOverlayMobile]}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroTitle, isPhone && styles.heroTitleMobile]}>PCI Calculation Prototype</Text>
              <Text style={[styles.heroSubtitle, isPhone && styles.heroSubtitleMobile]}>Measure one sample unit, record its distresses and compute its PCI, the same way an inspector does.</Text>
            </View>
            {isDesktop ? (
              <View style={styles.heroRight}>
                <Text style={styles.quote}>“Where Data Meets the Road”</Text>
                <View style={styles.heroDivider} />
                <View style={styles.brand}>
                  <Image contentFit="contain" source={logoImage} style={styles.brandLogo} />
                  <View>
                    <Text style={styles.brandName}>LAKAD</Text>
                    <Text style={styles.brandTag}>Where Data Meets the Road</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.main, { paddingHorizontal: isPhone ? 12 : isDesktop ? 36 : 18 }]}>
          <InspectionProgress palette={p} done={done} />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'flex-start' : 'stretch' }}>
            {form}
            {table}
          </View>

          <View ref={resultsRef} style={{ gap: 16 }}>
            {source?.kind === 'illustrative' && <Notice error>The LAKAD server is unavailable ({source.reason}), so this PCI uses illustrative curves. It will not match an official result for the same data.</Notice>}
            <PciResultCards palette={p} output={result} pending={pending} />
          </View>

          {legend}
        </View>

        <View style={[styles.footer, isPhone && styles.footerMobile, { borderTopColor: p.border, backgroundColor: chromeSurface }]}>
          <View style={[styles.footerBrand, isPhone && styles.footerBrandMobile]}>
            <Image contentFit="contain" source={logoImage} style={styles.footerLogo} />
            <Text style={[styles.footerName, { color: p.text }]}>LAKAD</Text>
            {!isNarrowPhone ? <View style={[styles.footerDivider, { backgroundColor: p.border }]} /> : null}
            <Text style={[styles.footerText, isPhone && styles.footerDescriptionMobile, { color: p.muted }]}>Local Asphalt Konditioning Assessment and Data-Driven Prioritization</Text>
          </View>
          <View style={[styles.footerRight, isPhone && styles.footerRightMobile]}>
            <Text style={[styles.footerText, { color: p.muted }]}>Where Data Meets the Road</Text>
            <Text style={[styles.footerText, { color: p.muted }]}>v1.0 (Prototype)</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 14, justifyContent: 'space-between', minHeight: 70, paddingHorizontal: 40, paddingVertical: 10, zIndex: 5 },
  headerMobile: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 9 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  homeLink: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 44 },
  homeLinkText: { fontSize: 15, fontWeight: '600' },
  themeButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  themeButtonCompact: { height: 36, width: 36 },
  signIn: { alignItems: 'center', backgroundColor: brand.royal, borderRadius: 10, boxShadow: '0 4px 12px rgba(24,80,224,0.25)', flexDirection: 'row', gap: 10, height: 40, justifyContent: 'center', paddingHorizontal: 18 },
  signInMobile: { height: 36, paddingHorizontal: 14 },
  signInText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.82 },
  scrollContent: { flexGrow: 1 },
  hero: { backgroundColor: brand.navy, justifyContent: 'center', minHeight: 150, overflow: 'hidden', paddingVertical: 22, position: 'relative', width: '100%' },
  heroMobile: { minHeight: 140, paddingVertical: 20 },
  heroBackdrop: { height: '100%', opacity: 0.35, position: 'absolute', width: '100%' },
  heroOverlay: { alignItems: 'center', backgroundColor: layout.scrim, flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 45 },
  heroOverlayMobile: { paddingHorizontal: 16 },
  heroLeft: { flex: 1, gap: 4 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.8, lineHeight: 41 },
  heroTitleMobile: { fontSize: 26, lineHeight: 32 },
  heroSubtitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', lineHeight: 24, maxWidth: 760 },
  heroSubtitleMobile: { fontSize: 14, lineHeight: 20 },
  heroRight: { alignItems: 'center', flexDirection: 'row', gap: 28 },
  quote: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  heroDivider: { backgroundColor: 'rgba(255,255,255,0.42)', height: 78, width: 1 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandLogo: { height: 52, width: 52 },
  brandName: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', lineHeight: 25 },
  brandTag: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  main: { alignSelf: 'center', gap: 16, maxWidth: 1600, paddingBottom: 24, paddingTop: 16, width: '100%' },
  legendRow: { alignItems: 'center', borderRadius: 6, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, paddingHorizontal: 14, paddingVertical: 6 },
  legendName: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  legendDot: { borderRadius: 7, height: 14, width: 14 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', minHeight: 42, paddingHorizontal: 36, paddingVertical: 10 },
  footerMobile: { flexDirection: 'column', gap: 8, paddingHorizontal: 12, paddingVertical: 14 },
  footerBrand: { alignItems: 'center', flexDirection: 'row' },
  footerBrandMobile: { flexWrap: 'wrap', justifyContent: 'center' },
  footerLogo: { height: 20, width: 20 },
  footerName: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  footerDivider: { height: 16, marginHorizontal: 8, width: 1 },
  footerDescriptionMobile: { marginVertical: 3, textAlign: 'center' },
  footerRight: { flexDirection: 'row', gap: 20 },
  footerRightMobile: { justifyContent: 'center' },
  footerText: { fontSize: 10 },
});
