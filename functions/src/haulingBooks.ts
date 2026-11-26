export const BOOK_LEVELS = 30;

export type StoredLevel = [number, number, number];
export type StoredBook = [StoredLevel[], StoredLevel[]];

export interface HaulingBooksObject {
  stationId: number;
  lastSyncedAt: number;
  asOf: number;
  types: Record<number, StoredBook>;
}

type Side = Map<number, { units: number; orders: number }>;

function levels(side: Side, ascending: boolean): StoredLevel[] {
  return [...side.entries()]
    .sort((a, b) => (ascending ? a[0] - b[0] : b[0] - a[0]))
    .slice(0, BOOK_LEVELS)
    .map(([price, { units, orders }]) => [price, units, orders]);
}

export class HaulingBookFold {
  private readonly stations = new Map<number, Map<number, { sell: Side; buy: Side }>>();

  constructor(stationIds: readonly number[]) {
    for (const id of stationIds) this.stations.set(id, new Map());
  }

  add(stationId: number, typeId: number, isBuy: boolean, price: number, units: number): void {
    const types = this.stations.get(stationId);
    if (!types || !(units > 0) || !(price > 0)) return;
    let book = types.get(typeId);
    if (!book) {
      book = { sell: new Map(), buy: new Map() };
      types.set(typeId, book);
    }
    const side = isBuy ? book.buy : book.sell;
    const level = side.get(price) ?? { units: 0, orders: 0 };
    level.units += units;
    level.orders += 1;
    side.set(price, level);
  }

  typeCount(stationId: number): number {
    return this.stations.get(stationId)?.size ?? 0;
  }

  toObject(stationId: number, meta: { lastSyncedAt: number; asOf: number }): HaulingBooksObject {
    const types: Record<number, StoredBook> = {};
    for (const [typeId, book] of this.stations.get(stationId) ?? []) {
      types[typeId] = [levels(book.sell, true), levels(book.buy, false)];
    }
    return { stationId, ...meta, types };
  }
}
