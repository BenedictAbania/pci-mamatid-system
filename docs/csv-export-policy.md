# Spreadsheet CSV export policy

LAKAD's report and section-priority CSVs are for human viewing in Microsoft Excel and Google Sheets. They are not lossless machine-import files. The shared `serializeCsv` / `downloadCsv` helper applies this policy at export time; database labels and saved snapshots are never modified.

- Finite JavaScript numbers retain their numeric representation, including negatives. Null exports as an empty cell. Callers must keep numeric columns typed as numbers; a string such as `-12` is untrusted text.
- Untrusted strings whose first significant character is `=`, `+`, `-`, or `@` (including full-width variants) receive the visible literal prefix `Text: `. Detection skips leading whitespace and control characters. Leading tabs, carriage returns and line feeds also receive the prefix, even without a formula marker. Original whitespace remains after the prefix.
- This intentionally visible text prefix begins with an ordinary letter. It does not rely on Excel/Sheets treating an apostrophe or tab as a hidden escape, on CSV quoting preventing formulas, or on a particular import option. A user may see `Text: =1+1` instead of `=1+1`. Do not remove that prefix and re-open the file as a trusted export.
- Every cell is double-quoted, embedded quotes are doubled, and commas and embedded newlines stay inside the cell. Rows use CRLF. Downloads are UTF-8 with a BOM for Excel's Unicode detection.
- The download anchor is attached to the document; its Blob URL is released after a short delay rather than before the browser can consume it.

Both callers (approved sample snapshots and section rankings in `approved-reports.tsx`) use the shared helper. CSV output tests inspect actual Blob bytes, parse round trips, and verify that source rows remain unchanged. A passed serializer test does **not** certify browser delivery or spreadsheet behavior. Excel and Google Sheets import/save/reopen behavior must be recorded as pending until those applications are actually exercised. CSV has no universal safe text-format escape across all applications; the visible prefix is LAKAD's conservative export transformation.

Reference: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection). Spreadsheet validation should include formula markers, leading whitespace/tabs/CR, negative typed numbers, commas, quotes, Unicode and multiline text. Only harmless synthetic expressions belong in verification files.
