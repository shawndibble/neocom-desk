import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type {
  CompareAttributeGroup,
  CompareAttributeRow,
} from '@/engine/market/attributeCompareMatrix';

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

function unitOf(row: CompareAttributeRow): string | null {
  for (const cell of row.cells.values()) {
    if (cell.displayValue === undefined && cell.unit) return cell.unit;
  }
  return null;
}

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
