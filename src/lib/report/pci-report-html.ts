import type { ApprovedResult } from '../data/approved-results';
import type { PciReportData, PciReportSection } from '../data/pci-report';
import { sectionBreakdown } from '../data/summary-data';
import { ASPHALT_CATALOG, PROVISIONAL_LABEL } from '../d6433-07/catalog';
import type { SampleOutput } from '../d6433-07/sample';
import { PCI_CONDITION_SCALE, getPciConditionCategory } from '../pci/pci-classification';

type Output = ApprovedResult['report_snapshot']['output'] & Partial<Pick<SampleOutput, 'groups'>>;
export type PciReportMeta = { generatedAt: Date; generatedBy: string; roleLabel: string; publishedOnly: boolean };

const NAVY = '#0A1B4D';
const ROYAL = '#1850E0';
const SEVERITY: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function num(value: unknown, digits = 2) {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n.toFixed(digits) : '—';
}
function area(value: unknown) {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
}
function date(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
const su = (n: number) => `SU-${String(n).padStart(3, '0')}`;

/** Condition pill coloured by the PCI condition scale. */
function condition(pci: unknown) {
  const n = Number(pci);
  if (!Number.isFinite(n)) return '—';
  const c = getPciConditionCategory(n);
  return `<span class="pill" style="background:${c.softColor};color:${c.color};border-color:${c.color}">${esc(c.rating)}</span>`;
}
function table(headers: string[], rows: string[][], align: ('l' | 'c' | 'r')[] = []) {
  const cls = (i: number) => (align[i] ? ` class="${align[i]}"` : '');
  return `<table><thead><tr>${headers.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r => `<tr>${r.map((cell, i) => `<td${cls(i)}>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function info(rows: [string, string][]) {
  return `<table class="info">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
}

function sectionBlock(section: PciReportSection) {
  const s = section.summary;
  const head = `<h2>${esc(section.section_name)} <span class="muted">· ${esc(section.branch_name)}</span></h2>`;
  if (!s) {
    return `<section class="section">${head}<p class="note">No section PCI is available yet. A section PCI appears after every sample unit of the current round is approved and the section result is computed.</p>${section.samples.map(sampleBlock).join('')}</section>`;
  }
  const b = sectionBreakdown(s);
  const products = (rows: typeof b.random) => rows.map(r => [su(r.unit_number), num(r.pci), area(r.area_sqm), area(Number(r.pci) * Number(r.area_sqm))]);
  const randomTable = table(['Sample Unit', 'PCI', 'Area (m²)', 'PCI × Area'], [...products(b.random), ['<b>Σ</b>', '', `<b>${area(b.randomArea)}</b>`, `<b>${area(b.randomProduct)}</b>`]], ['l', 'c', 'c', 'c']);
  const additionalTable = b.additional.length ? table(['Sample Unit', 'PCI', 'Area (m²)', 'PCI × Area'], [...products(b.additional), ['<b>Σ</b>', '', `<b>${area(b.additionalArea)}</b>`, `<b>${area(b.additionalProduct)}</b>`]], ['l', 'c', 'c', 'c']) : '';
  const formula = b.additional.length
    ? `PCIs = [PCIr × (A − ΣAa) + Σ(PCIa × Aa)] ÷ A = [${num(b.randomMean)} × (${area(s.area_sqm)} − ${area(b.additionalArea)}) + ${area(b.additionalProduct)}] ÷ ${area(s.area_sqm)} = ${num(b.sectionPci)}`
    : `PCIs = PCIr = ${num(b.randomMean)}${b.census ? ' (all sample units inspected)' : ' (no additional sample units)'}`;
  return `<section class="section">${head}
    <div class="row">
      <div class="grow">${info([
        ['Branch', esc(s.branch_name)], ['Section', esc(s.section_name)], ['Pavement type', 'Asphalt (AC)'],
        ['Section area', s.area_sqm === null ? '—' : `${area(s.area_sqm)} m²`],
        ['Total sample units', s.total_sample_units === null ? '—' : esc(s.total_sample_units)],
        ['Inspected sample units', esc(s.inspected)], ['Method', esc(s.method)], ['Published', date(s.published_at)],
      ])}</div>
      <div class="score"><div class="label">Section PCI</div><div class="big">${num(s.pci)}</div>${condition(s.pci)}</div>
    </div>
    <h3>Inspected sample units</h3>
    ${table(['#', 'Sample Unit', 'Type', 'Area (m²)', 'PCI', 'Condition'], s.samples.map((r, i) => [String(i + 1), su(r.unit_number), r.sample_type === 'additional' ? 'Additional' : 'Random', area(r.area_sqm), num(r.pci), condition(r.pci)]), ['l', 'l', 'c', 'c', 'c', 'c'])}
    <h3>Section PCI computation (ASTM D6433-07 §11.1)</h3>
    <p class="formula">PCIr = Σ(PCIri × Ari) ÷ ΣAri = ${area(b.randomProduct)} ÷ ${area(b.randomArea)} = ${num(b.randomMean)}</p>
    <h4>Random sample units</h4>${randomTable}
    ${additionalTable ? `<h4>Additional sample units</h4>${additionalTable}` : ''}
    <p class="formula">${formula}</p>
    <p class="muted small">The published section PCI (${num(s.pci)}) is the authoritative value; the working above is shown for reference.</p>
    ${section.samples.map(sampleBlock).join('')}
  </section>`;
}

function sampleBlock(row: ApprovedResult) {
  const snap = row.report_snapshot;
  const out = snap.output as Output;
  const sampleArea = Number(snap.sample.area_sqm);
  // Snapshots without `groups` keep densities and deduct values in calculation order;
  // each distress is matched to its deduct value through its density (quantity ÷ area × 100).
  const used = new Set<number>();
  const deductFor = (density: number) => {
    const i = (out.densities ?? []).findIndex((value, index) => !used.has(index) && Math.abs(value - density) < 1e-9);
    if (i < 0) return null;
    used.add(i);
    return out.deduct_values?.[i] ?? null;
  };
  const distressRows = out.groups?.length
    ? out.groups.map((g, i) => [String(i + 1), esc(ASPHALT_CATALOG.find(d => d.code === g.code)?.name ?? `Distress ${g.code}`), g.severity ? SEVERITY[g.severity] ?? esc(g.severity) : 'N/A', `${area(g.quantity)} ${esc(g.unit)}`, num(g.density), num(g.deduct_value)])
    : snap.distresses.map((d, i) => {
      const density = Number(d.quantity) / sampleArea * 100;
      return [String(i + 1), esc(d.name), d.severity ? SEVERITY[d.severity] ?? esc(d.severity) : 'N/A', `${area(d.quantity)} ${esc(d.unit_of_measure)}`, num(density), num(deductFor(density))];
    });
  const notes = ((out as { provisional_notes?: string[] }).provisional_notes ?? []).filter(Boolean);
  const iterations = out.iterations ?? [];
  const q = iterations.length ? iterations[0].q : out.q;
  return `<article class="sample">
    <h3 class="sample-title">${su(snap.sample.unit_number)} <span class="muted">· ${esc(snap.road.section_name)}</span></h3>
    <div class="row">
      <div class="grow">${info([
        ['Sample type', snap.sample.sample_type === 'additional' ? 'Additional' : 'Random'], ['Sample unit area', `${area(snap.sample.area_sqm)} m²`],
        ['Inspection date', date(snap.sample.surveyed_at)], ['Revision', esc(row.input_revision)],
        ['Algorithm', esc(snap.algorithm_version || '—')],
        ['Status', row.published_at ? `Published ${date(row.published_at)}` : `Approved ${date(row.approved_at)}; awaiting publication`],
      ])}</div>
      <div class="score"><div class="label">Sample PCI</div><div class="big">${num(out.pci)}</div>${condition(out.pci)}</div>
    </div>
    <h4>Distresses and deduct values</h4>
    ${distressRows.length ? table(['#', 'Distress type', 'Severity', 'Quantity', 'Density (%)', 'Deduct value'], distressRows, ['l', 'l', 'c', 'c', 'c', 'c']) : '<p class="muted">No distress was recorded in this sample unit.</p>'}
    ${info([
      ['Total deduct value (TDV)', num(out.total_deduct_value)], ['q (deduct values above 2)', esc(q ?? 0)],
      ['Maximum corrected deduct value (CDV)', num(out.max_corrected_deduct_value)],
    ])}
    ${iterations.length ? `<h4>CDV iterations</h4>${table(['Iteration', 'q', 'TDV', 'CDV'], iterations.map((it, i) => [String(i + 1), esc(it.q), num(it.total_deduct_value), num(it.corrected_deduct_value)]), ['l', 'c', 'c', 'c'])}` : ''}
    <p class="formula">PCI = 100 − Maximum CDV = 100 − ${num(out.max_corrected_deduct_value)} = ${num(out.pci)}</p>
    ${notes.length ? `<p class="small"><b>Calculation notes:</b> ${notes.map(esc).join(' ')}</p>` : ''}
    ${snap.sample.inspection_notes ? `<p class="small"><b>Inspection notes:</b> ${esc(snap.sample.inspection_notes)}</p>` : ''}
  </article>`;
}

/** One printable HTML document: overview, then each section with its sample units. */
export function pciReportHtml(data: PciReportData, meta: PciReportMeta) {
  const withSummary = data.sections.filter(s => s.summary);
  const overview = data.sections.length
    ? table(['Branch', 'Section', 'Inspected / Total', 'Section PCI', 'Condition'], data.sections.map(s => [
      esc(s.branch_name), esc(s.section_name),
      s.summary ? `${s.summary.inspected} / ${s.summary.total_sample_units ?? '—'}` : `${s.samples.length} / —`,
      s.summary ? `<b>${num(s.summary.pci)}</b>` : '<span class="muted">Not yet available</span>',
      s.summary ? condition(s.summary.pci) : '—',
    ]), ['l', 'l', 'c', 'c', 'c'])
    : '<p class="note">No calculated PCI results are available in your access scope yet.</p>';
  const scale = PCI_CONDITION_SCALE.map(c => `<span class="pill" style="background:${c.softColor};color:${c.color};border-color:${c.color}">${esc(c.range)} ${esc(c.rating)}</span>`).join(' ');
  const generated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(meta.generatedAt);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAKAD PCI Report</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.45; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header.cover { background: ${NAVY}; color: #fff; padding: 18px 20px; border-radius: 8px; }
  header.cover h1 { margin: 0 0 4px; font-size: 22px; }
  header.cover p { margin: 2px 0; opacity: .9; }
  h2 { color: ${NAVY}; font-size: 17px; border-bottom: 2px solid ${ROYAL}; padding-bottom: 4px; margin: 0 0 10px; }
  h3 { color: ${NAVY}; font-size: 13px; margin: 14px 0 6px; }
  h4 { font-size: 11.5px; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  th, td { border: 1px solid #D1D5DB; padding: 4px 6px; text-align: left; vertical-align: middle; }
  thead th { background: #E8EEFF; color: ${NAVY}; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .c { text-align: center; } .r { text-align: right; }
  table.info { width: auto; min-width: 60%; }
  table.info th { background: #F3F4F6; font-weight: 600; width: 46%; }
  .row { display: flex; gap: 12px; align-items: stretch; }
  .grow { flex: 1; }
  .score { min-width: 150px; border: 1px solid #D1D5DB; border-radius: 8px; padding: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .score .label { font-weight: 700; color: ${NAVY}; }
  .score .big { font-size: 28px; font-weight: 800; margin: 2px 0 6px; }
  .pill { display: inline-block; border: 1px solid; border-radius: 6px; padding: 1px 7px; font-weight: 700; font-size: 10px; margin: 1px 0; }
  .formula { background: #E8EEFF; border-radius: 6px; padding: 6px 10px; font-weight: 700; }
  .note { background: #FFF7ED; border-left: 4px solid #EA580C; padding: 6px 10px; }
  .muted { color: #6B7280; font-weight: 400; } .small { font-size: 10px; }
  section.section { break-before: page; page-break-before: always; }
  article.sample { border: 1px solid #D1D5DB; border-radius: 8px; padding: 10px 12px; margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
  .sample-title { margin-top: 0; }
  footer { margin-top: 14px; color: #6B7280; font-size: 9.5px; }
</style></head><body>
<header class="cover">
  <h1>Pavement Condition Index (PCI) Report</h1>
  <p>LAKAD · ASTM D6433-07 · Asphalt pavement</p>
  <p>Generated ${esc(generated)} by ${esc(meta.generatedBy)} (${esc(meta.roleLabel)})</p>
</header>
<h3>Scope</h3>
<p>${meta.publishedOnly ? 'Published, Reviewer-approved results only.' : 'Current Reviewer-approved results in your access scope, including approvals awaiting publication.'}
  ${withSummary.length} section PCI result${withSummary.length === 1 ? '' : 's'} · ${data.sampleCount} sample unit result${data.sampleCount === 1 ? '' : 's'}.
  Every value comes from the frozen approved snapshot. Displayed numbers are rounded; full precision is stored.</p>
${data.sections.some(s => s.samples.some(r => /provisional/i.test(r.report_snapshot.algorithm_version ?? ''))) ? `<p class="note">${esc(PROVISIONAL_LABEL)}. Results computed with the provisional algorithm are marked in each sample unit.</p>` : ''}
${data.truncated ?'<p class="note">This report reached its row limit. Some results are not included.</p>' : ''}
<h3>Section summary</h3>
${overview}
<h3>PCI rating scale</h3>
<p>${scale}</p>
${data.sections.map(sectionBlock).join('')}
<footer>Calculations follow ASTM D6433-07. Approval of a result does not by itself establish ASTM compliance.</footer>
</body></html>`;
}
