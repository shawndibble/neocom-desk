import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { rowVolume } from '@/engine/industry/materialVolume';
import type { MaterialCostLine } from '@/engine/industry/types';

/** A Build Group buy-table row: the merged line plus its netted still-to-buy count. */
export type GroupMaterialCsvRow = MaterialCostLine & { buyToShow: number };

/**
 * Export columns for a Build Group's "Everything this group needs" table, in
 * its own order and on its own header keys. Volume is m3 (the table's unit);
 * a volume the SDE can't resolve and an owned quantity nobody has entered are
 * blank rather than a placeholder, and a covered row's still-to-buy is a real
 * 0 rather than the "Covered" the table writes.
 */
export function groupMaterialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string,
  volumeFor: (typeID: number) => number | null,
  ownedFor: (typeID: number) => number | undefined
): CsvColumn<GroupMaterialCsvRow>[] {
  return [
    { header: t('industry.material'), value: (row) => nameFor(row.typeID) },
    { header: t('industry.quantity'), value: (row) => row.quantity },
    { header: t('industry.volume'), value: (row) => rowVolume(row, volumeFor) },
    { header: t('industry.ownedQuantity'), value: (row) => ownedFor(row.typeID) ?? null },
    { header: t('industry.stillToBuyColumn'), value: (row) => row.buyToShow },
  ];
}
