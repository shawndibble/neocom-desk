import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ContractItem } from '@/esi/endpoints';

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
