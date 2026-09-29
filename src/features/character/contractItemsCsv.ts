import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ContractItem } from '@/esi/endpoints';

/**
 * CSV columns for one contract's item list (the detail modal's Included /
 * Requested tables): item name, then quantity as a raw number. An unresolved
 * type id reads `#id`, the table's own spelling.
 */
export function contractItemsCsvColumns(
  t: CsvTranslate,
  typeNames: ReadonlyMap<number, string>
): CsvColumn<ContractItem>[] {
  return [
    {
      header: t('contracts.detailItemName'),
      value: (item) => typeNames.get(item.type_id) ?? `#${item.type_id}`,
    },
    { header: t('contracts.detailQuantity'), value: (item) => item.quantity },
  ];
}
