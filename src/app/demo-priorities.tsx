import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AdminButton, AdminField, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Choices, Notice } from '@/components/workflow/shared';
import { useAuth } from '@/providers/AuthProvider';
import { DEMO_PREVIEW_ENABLED, readScenarioNumber } from '@/lib/demo-preview';
import { rankPriorities, type PrioritySection } from '@/lib/pci-service';

type Scenario = PrioritySection & { name: string };

/** Local what-if ranking. The official reports and Supabase records are untouched. */
export default function DemoPrioritiesScreen() {
  const router = useRouter();
  const palette = useAdminPalette();
  const { role } = useAuth();
  const nextId = useRef(0);
  const [rows, setRows] = useState<Scenario[]>([]);
  const [name, setName] = useState('');
  const [pci, setPci] = useState('');
  const [area, setArea] = useState('');
  const [highSeverity, setHighSeverity] = useState('0');
  const [safety, setSafety] = useState('no');
  const [error, setError] = useState('');
  const authorized = role === 'admin' || role === 'reviewer';

  function addScenario() {
    try {
      if (rows.length >= 10) throw new Error('This preview accepts up to 10 synthetic sections.');
      const label = name.trim();
      if (!/^SYNTHETIC DEMO\b/i.test(label)) throw new Error('Start the section label with SYNTHETIC DEMO.');
      if (rows.some(row => row.name.toLowerCase() === label.toLowerCase())) throw new Error('Use a distinct synthetic section label.');
      const score = readScenarioNumber(pci, 'hypothetical PCI', 100);
      const affectedArea = readScenarioNumber(area, 'hypothetical affected area');
      const severityCount = readScenarioNumber(highSeverity, 'hypothetical high-severity count');
      if (!Number.isInteger(severityCount)) throw new Error('Enter a whole-number high-severity count.');
      setRows(current => [...current, { id: `synthetic-${++nextId.current}`, name: label, pci: score,
        affectedArea, highSeverity: severityCount, safety: safety === 'yes' }]);
      setName(''); setPci(''); setArea(''); setHighSeverity('0'); setSafety('no'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The scenario could not be added.'); }
  }

  const ranked = rankPriorities(rows);
  return <AdminShell title="Synthetic priority preview" subtitle="Temporary what-if ordering for a presentation; no inspection calculation or approval." >
    {!DEMO_PREVIEW_ENABLED || !authorized ? <Notice error>This presentation preview is unavailable for this account or configuration.</Notice> : <>
      <Notice>SYNTHETIC DEMO ONLY. Type hypothetical PCI values yourself. They are not calculated from LAKAD inspections, are not ASTM D6433-07 results, and are never saved, approved, published or shown to Viewers. Leaving this page clears the scenario.</Notice>
      <AdminPanel palette={palette} title="Add a synthetic section scenario">
        <View style={{ gap: 12 }}>
          <AdminField palette={palette} label="Synthetic section label" value={name} onChangeText={setName} placeholder="SYNTHETIC DEMO — AC-01" />
          <AdminField palette={palette} label="Hypothetical PCI (0–100; manually supplied)" value={pci} onChangeText={setPci} keyboardType="numeric" />
          <AdminField palette={palette} label="Hypothetical affected area (m²)" value={area} onChangeText={setArea} keyboardType="numeric" />
          <AdminField palette={palette} label="Hypothetical high-severity distress count" value={highSeverity} onChangeText={setHighSeverity} keyboardType="numeric" />
          <Choices label="Hypothetical safety concern" value={safety} onChange={setSafety} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
          {error ? <Notice error>{error}</Notice> : null}
          <AdminButton palette={palette} label="Add synthetic scenario" onPress={addScenario} />
        </View>
      </AdminPanel>
      <AdminPanel palette={palette} title="Provisional scenario ordering" subtitle="Lower hypothetical PCI first; ties use safety/high severity, then affected area.">
        {ranked.length ? ranked.map(row => <View key={row.id} style={{ borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: 12, gap: 5 }}>
          <Text style={{ color: palette.text, fontWeight: '700' }}>SYNTHETIC DEMO · Rank {row.rank} · {rows.find(item => item.id === row.id)?.name} · hypothetical PCI {row.pci}</Text>
          <Text style={{ color: palette.muted }}>{row.reason}</Text>
          <AdminButton palette={palette} tone="secondary" label={`Remove synthetic rank ${row.rank}`} onPress={() => setRows(current => current.filter(item => item.id !== row.id))} />
        </View>) : <Text style={{ color: palette.muted }}>No scenarios yet. Add a synthetic section and a manually supplied hypothetical PCI. One section produces only Rank 1.</Text>}
        {!!rows.length && <AdminButton palette={palette} tone="secondary" label="Clear synthetic preview" onPress={() => setRows([])} />}
      </AdminPanel>
    </>}
    <AdminButton palette={palette} tone="secondary" label="Back to results" onPress={() => router.push('/pci-results')} />
  </AdminShell>;
}
