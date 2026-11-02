import { Alert, Platform } from 'react-native';

export function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatNumber(value: number | null, suffix = '') {
  return value === null ? '—' : `${Number(value).toLocaleString()}${suffix}`;
}

export function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export type CsvCell = string | number | null;

/** Spreadsheet-viewing policy: see docs/csv-export-policy.md. Never mutate source values. */
export function serializeCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map(row => row.map(value => {
    let text: string;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('CSV numbers must be finite.');
      text = String(value);
    } else {
      text = value ?? '';
      const leading = text.match(/^[\s\u0000-\u001f\u007f]*/u)?.[0] ?? '';
      // A visible literal prefix survives import without relying on spreadsheet escapes.
      if (/^[=+\-@＝＋－＠]/u.test(text.slice(leading.length)) || /[\t\r\n]/u.test(leading)) {
        text = 'Text: ' + text;
      }
    }
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: readonly (readonly CsvCell[])[]) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('CSV downloads are available in the web app.');
  }

  const blob = new Blob(['\uFEFF', serializeCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    // Give the browser time to consume the Blob before releasing it.
    setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1000);
  }
}
