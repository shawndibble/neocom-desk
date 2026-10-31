import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { HolderCount } from '@/engine/stockTargets/onHand';
import type { StockRow } from '@/engine/stockTargets/stockRows';

/**
 * Export columns for the Stock Manager table: every column the picker offers,
 * whatever it shows, plus what the cells' tooltips and sub-lines carry: the
 * item's Market Group, who holds the listed and hangar counts, and the unit
 * price the cost is worked from. Restock is its two halves (list from the
 * hangar, buy or build) as numbers; an item with no price leaves Cost blank
 * rather than 0, since "nothing to buy" and "no price" are different answers.
 * `characterName` is undefined while only one Character has data, as in the table.
 */
export function stockCsvColumns(
  t: CsvTranslate,
  {
    nameOf,
    groupOf,
    characterName,
  }: {
    nameOf: (typeId: number) => string;
    groupOf: (typeId: number) => string | undefined;
    characterName: ((characterId: number) => string) | undefined;
  }
): CsvColumn<StockRow>[] {
  const holders = (by: readonly HolderCount[] | undefined) =>
    characterName && by
      ? by.map((holder) => `${characterName(holder.characterId)}: ${holder.quantity}`).join('; ')
      : undefined;
  return [
    { header: t('stockTargets.table.item'), value: (row) => nameOf(row.typeId) },
    { header: t('stockTargets.table.csvGroup'), value: (row) => groupOf(row.typeId) },
    { header: t('stockTargets.table.target'), value: (row) => row.target },
    { header: t('stockTargets.table.listed'), value: (row) => row.listed },
    { header: t('stockTargets.table.csvListedBy'), value: (row) => holders(row.listedBy) },
    { header: t('stockTargets.table.inHangar'), value: (row) => row.inHangar },
    { header: t('stockTargets.table.csvInHangarBy'), value: (row) => holders(row.inHangarBy) },
    { header: t('stockTargets.table.fill'), value: (row) => row.fill },
    { header: t('stockTargets.table.csvFromHangar'), value: (row) => row.fromHangar },
    { header: t('stockTargets.table.csvToSource'), value: (row) => row.toSource },
    { header: t('stockTargets.table.csvUnitPrice'), value: (row) => row.price },
    { header: t('stockTargets.table.costToFill'), value: (row) => row.costToFill },
    {
      header: t('stockTargets.table.status'),
      value: (row) => t(`stockTargets.status.${row.status}`),
    },
  ];
}
