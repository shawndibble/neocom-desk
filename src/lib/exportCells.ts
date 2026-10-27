/**
 * The one place a table export decides what a value *is*. CSV, clipboard
 * (TSV) and xlsx all serialize from this, so a column exports as the same
 * type in every format: a number stays a number, an ESI timestamp becomes a
 * real date, everything else is text.
 */

export type ExportValue = string | number | null | undefined;

export type ExportCell =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: Date }
  | { kind: 'text'; value: string };

/**
 * ESI's timestamp shape. Only a `Z`-suffixed value is a date: without a zone
 * designator there is no telling which clock it was read off.
 */
const ISO_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function toCell(value: ExportValue): ExportCell {
  if (value === null || value === undefined) return { kind: 'empty' };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'empty' };
  }
  if (ISO_UTC_TIMESTAMP_RE.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return { kind: 'date', value: date };
  }
  return { kind: 'text', value };
}

/**
 * `YYYY-MM-DD HH:MM:SS` in UTC — EVE time, the clock every timestamp in the
 * app is read against. Excel, LibreOffice/OpenOffice and Google Sheets all
 * parse this form as a date-time, where the raw `T…Z` form lands as text.
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Excel/Sheets treat a leading =, +, -, @, TAB or CR as a formula trigger.
 * Leading whitespace is skipped rather than trusted — " =cmd" is the obvious
 * way round a first-character-only check.
 */
const FORMULA_PREFIX_RE = /^\s*[=+\-@]|^[\t\r]/;

/** Text a spreadsheet would read as a formula gets a leading `'`. */
export function guardFormula(text: string): string {
  return FORMULA_PREFIX_RE.test(text) ? `'${text}` : text;
}
