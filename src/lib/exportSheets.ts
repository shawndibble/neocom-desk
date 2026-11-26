import type { CsvColumn, CsvTranslate } from './csv';
import type { ExportValue } from './exportCells';
import type { XlsxSheet } from './xlsx';

export const isoTime = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

export const joined = (values: readonly (string | number)[]): string => values.join('; ');

export const jsonOrNull = (value: Record<string, unknown> | undefined): string | null =>
  value && Object.keys(value).length > 0 ? JSON.stringify(value) : null;

export const byKey =
  <T>(...keys: ((row: T) => string | number)[]) =>
  (a: T, b: T): number => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };

export type SheetColumns<T> = [key: string, value: (row: T) => ExportValue][];

export function sheetFrom<T>(
  t: CsvTranslate,
  prefix: string,
  name: string,
  rows: readonly T[],
  columns: SheetColumns<T>
): XlsxSheet<T> {
  return {
    name: t(`${prefix}.sheets.${name}`),
    rows,
    columns: columns.map(([key, value]): CsvColumn<T> => ({
      header: t(`${prefix}.cols.${key}`),
      value,
    })),
  };
}

export type SettingRow = [label: string, value: ExportValue];

export function settingsSheet(
  t: CsvTranslate,
  prefix: string,
  rows: readonly SettingRow[]
): XlsxSheet<SettingRow> {
  return sheetFrom(t, prefix, 'settings', rows, [
    ['setting', ([label]) => label],
    ['value', ([, value]) => value],
  ]);
}
