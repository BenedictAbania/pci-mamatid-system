import type { PciReportData } from '../data/pci-report';
import { exportPdf } from './export-pdf';
import { isoDate } from './export-pdf.shared';
import { pciReportParts, type PciReportMeta } from './pci-report-html';

/** The PCI report as a PDF: downloaded on web, shared on phones (see export-pdf). */
export async function exportPciReport(data: PciReportData, meta: PciReportMeta) {
  const { css, body } = pciReportParts(data, meta);
  await exportPdf({ css, body, title: 'LAKAD PCI Report', filename: `LAKAD-PCI-Report-${isoDate(meta.generatedAt)}.pdf` });
}
