/**
 * CSV serializer (RFC 4180 + Excel formula-injection guard). No library: none
 * surveyed handle the BOM or the formula-injection sanitization, so the hard
 * part is ours regardless.
 */

/**
 * What a column builder needs from i18next: a key in, a string out. Declared
 * structurally rather than as i18next's `TFunction` so a test can pass
 * `(k) => k` and pin key names without constructing a real translator.
 */
export type CsvTranslate = (key: string, options?: Record<string, unknown>) => string;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const BOM = '\uFEFF';
const DELIMITER = ',';

/**
 * Excel/Sheets treat a leading =, +, -, @, TAB or CR as a formula trigger.
 * Leading whitespace is skipped rather than trusted — " =cmd" is the obvious
 * way round a first-character-only check.
 */
const FORMULA_PREFIX_RE = /^\s*[=+\-@]|^[\t\r]/;

/** Delimiter, quote, CR, or LF anywhere in the field forces quoting. */
const NEEDS_QUOTING_RE = /["\r\n,]/;

function quoteIfNeeded(field: string): string {
  return NEEDS_QUOTING_RE.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * `number` is emitted bare: it cannot carry a formula, and quote-prefixing
 * would land every ISK column in the spreadsheet as text. The `typeof` is the
 * seam, so a value that arrives as a string despite its declared type still
 * gets sanitized.
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
  return `${BOM}${[header, ...dataLines].join('\r\n')}\r\n`;
}

/**
 * One filename convention for every export surface:
 * `neocom-<surface>-<YYYY-MM-DD>.csv`. `date` is a parameter rather than a
 * `new Date()` inside, so callers' tests pin the name without freezing the
 * clock. Local calendar parts, not `toISOString()` — the file is named for
 * the user's day.
 *
 * `options.partial` appends `-partial`: a truncated fetch (pages missing)
 * must never hand out a file that looks complete just because it opens fine.
 */
export function csvFilename(base: string, date: Date, options?: { partial?: boolean }): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const suffix = options?.partial ? '-partial' : '';
  return `neocom-${base}-${stamp}${suffix}.csv`;
}

/**
 * A free-text label (a corp's own division name) reduced to a filename-safe
 * slug, so a name like "SRP / Reimbursements!!" can't inject a path
 * separator or otherwise land as a surprising filename fragment.
 */
export function slugifyForFilename(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unnamed';
}
