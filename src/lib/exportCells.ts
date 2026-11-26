export const MAX_CELL_TEXT = 32_767;

export type ExportValue = string | number | null | undefined;

export type ExportCell =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: Date }
  | { kind: 'text'; value: string };

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

export function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

const FORMULA_PREFIX_RE = /^\s*[=+\-@]|^[\t\r]/;

export function guardFormula(text: string): string {
  return FORMULA_PREFIX_RE.test(text) ? `'${text}` : text;
}
