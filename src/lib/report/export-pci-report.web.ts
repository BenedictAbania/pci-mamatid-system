import type Html2Pdf from 'html2pdf.js';
import type { PciReportData } from '../data/pci-report';
import { pciReportParts, type PciReportMeta } from './pci-report-html';

/** Page margins in millimetres: top, left, bottom, right. The bottom leaves room for the page number. */
const MARGIN: [number, number, number, number] = [14, 12, 16, 12];

/**
 * Web: build the PDF in the browser and download it, with no print dialog.
 * The report's styles are scoped to `.lakad-report`, so rendering it here leaves the app page untouched.
 */
export async function exportPciReport(data: PciReportData, meta: PciReportMeta) {
  // Loaded here, not at the top of the file: html2pdf.js reads the browser global `self`
  // as soon as it loads, which breaks Expo's static rendering of web pages in Node.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred load, see above
  const loaded = require('html2pdf.js') as typeof Html2Pdf | { default: typeof Html2Pdf };
  const html2pdf = 'default' in loaded ? loaded.default : loaded;
  const { css, body } = pciReportParts(data, meta);
  const host = document.createElement('div');
  host.innerHTML = `<style>${css}</style>${body}`;
  const options = {
    margin: MARGIN,
    filename: `LAKAD-PCI-Report-${isoDate(meta.generatedAt)}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.96 },
    html2canvas: { scale: 2, backgroundColor: '#FFFFFF', useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    // Not in the bundled types: honour the report's CSS page breaks and keep blocks whole.
    pagebreak: { mode: ['css', 'legacy'], avoid: ['article.sample', 'tr', '.row'] },
  };
  const worker = html2pdf().set(options).from(host).toPdf();
  const pdf = await worker.get('pdf');
  const pages: number = pdf.internal.getNumberOfPages();
  const width: number = pdf.internal.pageSize.getWidth();
  const height: number = pdf.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`LAKAD PCI Report · Page ${page} of ${pages}`, width - MARGIN[3], height - 7, { align: 'right' });
  }
  await worker.save();
}

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
