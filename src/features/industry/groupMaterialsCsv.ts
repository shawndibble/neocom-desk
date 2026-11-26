import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { rowVolume } from '@/engine/industry/materialVolume';
import type { MaterialCostLine } from '@/engine/industry/types';

export type GroupMaterialCsvRow = MaterialCostLine & { buyToShow: number };

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
    {
      header: t('industry.csvUnpriced'),
      value: (row) => exportFlag(t, row.unpriced && row.buyToShow > 0),
    },
  ];
}
