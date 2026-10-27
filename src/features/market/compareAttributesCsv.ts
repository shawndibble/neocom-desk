import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type {
  CompareAttributeGroup,
  CompareAttributeRow,
} from '@/engine/market/attributeCompareMatrix';

/**
 * The Attributes matrix is one DataTable per category; its export is one
 * sheet. Rows keep matrix order, and `categoryOf` says which heading each
 * came from — a lookup rather than a wrapper row, so the export's rows are
 * the same objects the per-category tables hold.
 */
export function flattenCompareGroups(groups: readonly CompareAttributeGroup[]): {
  rows: CompareAttributeRow[];
  categoryOf: (row: CompareAttributeRow) => string;
} {
  const categories = new Map<CompareAttributeRow, string>();
  for (const group of groups) for (const row of group.rows) categories.set(row, group.category);
  return {
    rows: [...categories.keys()],
    categoryOf: (row) => categories.get(row) ?? '',
  };
}

/**
 * The attribute's unit, once, rather than glued onto every value: a cell's
 * raw number stays a number. A row whose cells all carry a `displayValue`
 * (a required skill's name, an enum member) has no unit to state.
 */
function unitOf(row: CompareAttributeRow): string | null {
  for (const cell of row.cells.values()) {
    if (cell.displayValue === undefined && cell.unit) return cell.unit;
  }
  return null;
}

/**
 * CSV columns for the Compare drawer's Attributes view: category, attribute,
 * unit, then one column per Compare Set item. Values are the raw dogma
 * number (the price row's raw ISK), or the display text where the matrix
 * shows one instead; an item lacking the attribute exports empty.
 */
export function compareAttributesCsvColumns(
  t: CsvTranslate,
  items: readonly { typeId: number; itemName: string }[],
  categoryOf: (row: CompareAttributeRow) => string
): CsvColumn<CompareAttributeRow>[] {
  return [
    { header: t('market.compare.categoryColumn'), value: categoryOf },
    { header: t('market.compare.attributeColumn'), value: (row) => row.name },
    { header: t('market.compare.unitColumn'), value: unitOf },
    ...items.map((item): CsvColumn<CompareAttributeRow> => ({
      header: item.itemName,
      value: (row) => {
        const cell = row.cells.get(item.typeId);
        return cell ? (cell.displayValue ?? cell.value) : null;
      },
    })),
  ];
}
