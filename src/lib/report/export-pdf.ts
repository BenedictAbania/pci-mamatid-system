import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { PdfDocument } from './export-pdf.shared';

/** A4 at 72 points per inch, the unit expo-print uses for width and height. */
const A4 = { width: 595, height: 842 };

/**
 * Native: write the PDF file, then open the share sheet (Save to Files, Drive, email, …).
 * The web build uses export-pdf.web.ts, which downloads the file directly.
 */
export async function exportPdf(doc: PdfDocument) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${doc.title}</title>
<style>@page { size: A4; margin: 14mm 12mm; } html, body { margin: 0; padding: 0; background: #FFFFFF; }${doc.css}</style></head>
<body>${doc.body}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: `Save or share the ${doc.title}` });
  } else {
    await Print.printAsync({ uri });
  }
}
