import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** A4 at 72 points per inch, the unit expo-print uses for width and height. */
const A4 = { width: 595, height: 842 };

/**
 * Turns the report HTML into a PDF the person can keep.
 * Native: write the PDF file, then open the share sheet (Save to Files, Drive, email, …).
 * Web: `Print.printAsync` ignores custom HTML there, so the report prints from a hidden
 * frame and the browser's "Save as PDF" destination saves it.
 */
export async function exportPciReport(html: string) {
  if (Platform.OS === 'web') return printOnWeb(html);
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save or share the PCI report' });
  } else {
    await Print.printAsync({ uri });
  }
}

function printOnWeb(html: string) {
  if (typeof document === 'undefined') throw new Error('Printing is unavailable in this browser.');
  return new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) { frame.remove(); reject(new Error('The report could not be prepared for printing.')); return; }
      view.addEventListener('afterprint', cleanup, { once: true });
      view.focus();
      view.print();
      // Some browsers do not fire afterprint; print() blocks until the dialog closes in most of them.
      setTimeout(cleanup, 60_000);
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
