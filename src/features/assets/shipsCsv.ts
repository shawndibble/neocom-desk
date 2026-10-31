import type { CsvColumn, CsvTranslate } from '@/lib/csv';

/** One ship on the Ships tab, with everything its row shows (the place, the Sec and Jumps cells, the class and Packaged tags, the holder trail). */
export interface ShipCsvRow {
  /** The hull's type name. */
  ship: string;
  /** The in-game name the player gave an assembled ship; blank when it has none. */
  gameName: string;
  /** The SDE group (the ship class); blank until it is read. */
  shipClass: string;
  /** A stack of unassembled hulls. */
  packaged: boolean;
  quantity: number;
  character: string;
  /** The station, structure or system the ship sits in; blank until it resolves. */
  location: string;
  /** The assets holding the ship, outermost first ("Orca › Cargo Container"); blank for a free-standing ship. */
  heldInside: string;
  security: number | null;
  /** Null while the route is unread or unknown; 0 is "here". */
  jumps: number | null;
  itemId: number;
  typeId: number;
  locationId: number;
}

/** Every column the Ships tab shows, plus the ids; the Character column stays even when one Character is listed. */
export function shipsCsvColumns(t: CsvTranslate): CsvColumn<ShipCsvRow>[] {
  return [
    { header: t('assets.myShips.columns.ship'), value: (row) => row.ship },
    { header: t('assets.myShips.csvGameName'), value: (row) => row.gameName },
    { header: t('assets.myShips.csvClass'), value: (row) => row.shipClass },
    {
      header: t('assets.myShips.packaged'),
      value: (row) => t(row.packaged ? 'assets.myShips.csvYes' : 'assets.myShips.csvNo'),
    },
    { header: t('assets.myShips.csvQuantity'), value: (row) => row.quantity },
    { header: t('assets.myShips.columns.character'), value: (row) => row.character },
    { header: t('assets.myShips.columns.location'), value: (row) => row.location },
    { header: t('assets.myShips.csvHeldInside'), value: (row) => row.heldInside },
    { header: t('assets.myShips.columns.security'), value: (row) => row.security },
    { header: t('assets.myShips.columns.jumps'), value: (row) => row.jumps },
    { header: t('assets.csvItemId'), value: (row) => row.itemId },
    { header: t('assets.csvTypeId'), value: (row) => row.typeId },
    { header: t('assets.csvLocationId'), value: (row) => row.locationId },
  ];
}
