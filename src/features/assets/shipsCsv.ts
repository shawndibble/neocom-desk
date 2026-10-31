import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import type { ShipRow } from '@/engine/myShips';

/** What a ship row's cells are read from: the page's own lookups, evaluated when an export runs. */
export interface ShipsCsvLookups {
  shipName: (row: ShipRow) => string;
  /** The in-game name of an assembled ship; blank when it has none. */
  gameName: (row: ShipRow) => string;
  /** The SDE group (the ship class); blank until it is read. */
  shipClass: (row: ShipRow) => string;
  characterName: (row: ShipRow) => string;
  /** The station, structure or system the ship sits in; blank until it resolves. */
  location: (row: ShipRow) => string;
  /** The assets holding the ship, outermost first; blank for a free-standing ship. */
  heldInside: (row: ShipRow) => string;
  security: (row: ShipRow) => number | null;
  /** Null while the route is unread or unknown; 0 is "here". */
  jumps: (row: ShipRow) => number | null;
}

/** Every column the Ships tab shows, plus the ids; the Character column stays even when one Character is listed. */
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
