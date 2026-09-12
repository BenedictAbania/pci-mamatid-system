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

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('CSV downloads are available in the web app.');
  }

  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
