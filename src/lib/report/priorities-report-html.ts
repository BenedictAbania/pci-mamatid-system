import type { RankedSection } from '../data/approved-data';
import { PCI_CONDITION_SCALE, getPciConditionCategory } from '../pci/pci-classification';
import { REPORT_CSS, area, condition, date, esc, num } from './pci-report-html';

export type PrioritiesMeta = { generatedAt: Date; generatedBy: string; roleLabel: string; truncated: boolean };

const EXTRA_CSS = `
  .lakad-report .rank { display: inline-block; min-width: 24px; padding: 2px 6px; border-radius: 12px; text-align: center; font-weight: 800; }
  .lakad-report .bar { height: 5px; border-radius: 3px; background: #E5E7EB; margin-top: 3px; }
  .lakad-report .bar span { display: block; height: 5px; border-radius: 3px; }
  .lakad-report .flag { display: inline-block; border-radius: 5px; padding: 1px 7px; font-weight: 700; font-size: 10px; background: #FEE2E2; color: #B91C1C; border: 1px solid #B91C1C; }
  .lakad-report .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
  .lakad-report .chip { border: 1px solid; border-radius: 6px; padding: 3px 8px; font-weight: 700; font-size: 10px; }
`;

/** Maintenance priorities: sections in database rank order, colour-coded by condition. */
export function prioritiesReportParts(rows: RankedSection[], meta: PrioritiesMeta) {
  const counts = PCI_CONDITION_SCALE.map(c => ({ c, n: rows.filter(r => getPciConditionCategory(Number(r.pci)).rating === c.rating).length }));
  const generated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(meta.generatedAt);
  const tableRows = rows.map(r => {
    const c = getPciConditionCategory(Number(r.pci));
    const flagged = r.safety || r.high_severity > 0;
    return `<tr>
      <td class="c" style="border-left:5px solid ${c.color}"><span class="rank" style="background:${c.color};color:${c.foregroundColor}">${esc(r.rank)}</span></td>
      <td><b>${esc(r.road_snapshot?.section_name ?? 'Label not captured')}</b></td>
      <td>${esc(r.road_snapshot?.branch_name ?? '—')}</td>
      <td class="c"><b>${num(r.pci)}</b><div class="bar"><span style="width:${Math.max(0, Math.min(100, Number(r.pci)))}%;background:${c.color}"></span></div></td>
      <td class="c">${condition(r.pci)}</td>
      <td class="c">${flagged ? `<span class="flag">${r.high_severity > 0 ? `${esc(r.high_severity)} high severity` : 'Safety'}</span>` : '<span class="muted">None</span>'}</td>
      <td class="c">${area(r.affected_area)} m²</td>
      <td class="c">${date(r.published_at)}</td>
    </tr>`;
  }).join('');

  const body = `<div class="lakad-report">
<header class="cover">
  <h1>Maintenance Priorities</h1>
  <p>LAKAD · ASTM D6433-07 · Asphalt pavement</p>
  <p>Generated ${esc(generated)} by ${esc(meta.generatedBy)} (${esc(meta.roleLabel)})</p>
</header>
<h3>How sections are ranked</h3>
<p>Lowest section PCI first. When PCI is tied, sections with safety-related or high-severity distress come first, then the larger affected area.</p>
<h3>Sections by condition</h3>
<div class="chips">${counts.map(({ c, n }) => `<span class="chip" style="background:${c.softColor};color:${c.color};border-color:${c.color}">${esc(c.rating)} · ${n}</span>`).join('')}</div>
${meta.truncated ? '<p class="note">This report reached its row limit. Some sections are not included.</p>' : ''}
<h3>Ranked sections</h3>
${rows.length ? `<table>
  <thead><tr><th class="c">Rank</th><th>Section</th><th>Branch</th><th class="c">Section PCI</th><th class="c">Condition</th><th class="c">Safety / high severity</th><th class="c">Affected area</th><th class="c">Published</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>` : '<p class="note">No section PCI results are available yet.</p>'}
</div>`;
  return { css: REPORT_CSS + EXTRA_CSS, body };
}
