import type { CsvColumn, CsvTranslate } from '@/lib/csv';

/** One row per matched asset: its resolved location label, item name, and quantity. */
export interface AssetCsvRow {
  location: string;
  name: string;
  quantity: number;
}

/**
 * Flattens the Assets page's location groups into export rows, preserving
 * group order (already sorted by label) and within-group order (already
 * sorted by name) — the same order the page renders. Callers should build
 * these from the full matched set, not the render-capped subset: the render
 * cap is a UI performance guard, not a data limit, and export must not
 * silently drop rows the page merely chose not to paint.
 */
export function assetCsvRows(
  groups: readonly { label: string; entries: readonly { name: string; quantity: number }[] }[]
): AssetCsvRow[] {
  return groups.flatMap((group) =>
    group.entries.map((entry) => ({
      location: group.label,
      name: entry.name,
      quantity: entry.quantity,
    }))
  );
}

export function assetsCsvColumns(t: CsvTranslate): CsvColumn<AssetCsvRow>[] {
  return [
    { header: t('assets.csvLocation'), value: (row) => row.location },
    { header: t('assets.csvItem'), value: (row) => row.name },
    { header: t('assets.csvQuantity'), value: (row) => row.quantity },
  ];
}
