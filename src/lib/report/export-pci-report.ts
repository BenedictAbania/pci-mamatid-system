import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { PciReportData } from '../data/pci-report';
import { pciReportHtml, type PciReportMeta } from './pci-report-html';

/** A4 at 72 points per inch, the unit expo-print uses for width and height. */
const A4 = { width: 595, height: 842 };

/**
 * Native: write the PDF file, then open the share sheet (Save to Files, Drive, email, …).
 * The web build uses export-pci-report.web.ts, which downloads the file directly.
 */
export async function exportPciReport(data: PciReportData, meta: PciReportMeta) {
  const { uri } = await Print.printToFileAsync({ html: pciReportHtml(data, meta), ...A4 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save or share the PCI report' });
  } else {
    await Print.printAsync({ uri });
  }
}
