/**
 * CSV serializer (RFC 4180 + Excel formula-injection guard). No library:
 * none of the ones surveyed do BOM handling or formula-injection
 * sanitization, so the hard two-thirds is ours regardless — see
 * docs/plans/evelens-parity/README.md §3.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const BOM = '﻿';
const DELIMITER = ',';

/** Excel/Sheets treat a leading =, +, -, @, TAB, or CR as a formula trigger. */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/** Delimiter, quote, CR, or LF anywhere in the field forces quoting. */
const NEEDS_QUOTING_RE = /["\r\n,]/;

function quoteIfNeeded(field: string): string {
  return NEEDS_QUOTING_RE.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * A `number` is emitted bare: it cannot carry a formula, and quote-prefixing
 * it would land every ISK column in the spreadsheet as text, which defeats
 * the point of exporting. Sanitizing is therefore the string branch only —
 * the column's return type is the seam, not a guess about the content.
 */
function renderField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return quoteIfNeeded(FORMULA_PREFIX_RE.test(value) ? `'${value}` : value);
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => renderField(c.header)).join(DELIMITER);
  const dataLines = rows.map((row) =>
    columns.map((c) => renderField(c.value(row))).join(DELIMITER)
  );
  return BOM + [header, ...dataLines].map((line) => `${line}\r\n`).join('');
}
