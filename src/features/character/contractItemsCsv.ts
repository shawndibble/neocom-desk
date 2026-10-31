import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ContractItem } from '@/esi/endpoints';

/**
 * CSV columns for one contract's item list. The detail modal splits the items
 * into Included and Requested tables, but each export holds every item of the
 * contract, so the Side column (Included: the issuer hands it over; Requested:
 * the acceptor supplies it) says which table a row came from. Item name, then
 * quantity as a raw number. An unresolved type id reads `#id`, the table's own
 * spelling.
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
