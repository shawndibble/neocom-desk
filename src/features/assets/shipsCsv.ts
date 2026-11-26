import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import type { ShipRow } from '@/engine/myShips';

export interface ShipsCsvLookups {
  shipName: (row: ShipRow) => string;
  gameName: (row: ShipRow) => string;
  shipClass: (row: ShipRow) => string;
  characterName: (row: ShipRow) => string;
  location: (row: ShipRow) => string;
  heldInside: (row: ShipRow) => string;
  security: (row: ShipRow) => number | null;
  jumps: (row: ShipRow) => number | null;
}

export function shipsCsvColumns(t: CsvTranslate, lookups: ShipsCsvLookups): CsvColumn<ShipRow>[] {
  return [
    { header: t('assets.myShips.columns.ship'), value: lookups.shipName },
    { header: t('assets.csvGameName'), value: lookups.gameName },
    { header: t('assets.myShips.csvClass'), value: lookups.shipClass },
    { header: t('assets.myShips.packaged'), value: (row) => exportFlag(t, row.packaged) },
    { header: t('assets.csvQuantity'), value: (row) => row.quantity },
    { header: t('assets.myShips.columns.character'), value: lookups.characterName },
    { header: t('assets.myShips.columns.location'), value: lookups.location },
    { header: t('assets.myShips.csvHeldInside'), value: lookups.heldInside },
    { header: t('assets.myShips.columns.security'), value: lookups.security },
    { header: t('assets.myShips.columns.jumps'), value: lookups.jumps },
    { header: t('assets.csvItemId'), value: (row) => row.itemId },
    { header: t('assets.csvTypeId'), value: (row) => row.typeId },
    { header: t('assets.csvLocationId'), value: (row) => row.locationId },
  ];
}
