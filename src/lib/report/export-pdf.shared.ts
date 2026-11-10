/** A report ready to export: scoped styles, its `.lakad-report` body, and names for the file. */
export type PdfDocument = { css: string; body: string; title: string; filename: string };

/** YYYY-MM-DD in local time, for file names. */
export function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
