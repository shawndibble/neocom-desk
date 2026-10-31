import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ContractItem } from '@/esi/endpoints';

/**
 * CSV columns for one contract's whole item list; Side says which table (Included or
 * Requested) a row sits in. An unresolved type id reads `#id`, as the table does.
 */
export function contractItemsCsvColumns(
  t: CsvTranslate,
  typeNames: ReadonlyMap<number, string>
): CsvColumn<ContractItem>[] {
  return [
    {
      header: t('contracts.detailItemSide'),
      value: (item) =>
        t(item.is_included ? 'contracts.detailItemsIncluded' : 'contracts.detailItemsRequested'),
    },
    {
      header: t('contracts.detailItemName'),
      value: (item) => typeNames.get(item.type_id) ?? `#${item.type_id}`,
    },
    { header: t('contracts.detailQuantity'), value: (item) => item.quantity },
  ];
}
