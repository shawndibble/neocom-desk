/**
 * Hub coverage of a Doctrine Fit (#6387): how many complete ships a hub's sell orders could
 * supply, which part runs out first, and what the next ship's listed parts cost. Pure: the
 * caller fetches each part's region Order Book.
 *
 * Parts are the SRP match's: hull, modules (subsystems included) and rigs; charges, drones,
 * cargo and implants never count. Only orders placed at the hub station count, and only those
 * within `PRICE_CEILING` of the lowest sell, so a joke-priced order does not pass for stock.
 */
import { sum } from './math';
import { hubLadders, type HubOrder, type LadderLevel } from './market/haulingMarket';
import type { DoctrineFitSnapshot } from './srpDoctrine';

/** Orders priced above this multiple of a part's lowest sell are not counted as supply. */
export const PRICE_CEILING = 2;

export interface HubCoverage {
  /** Complete ships the book could supply; the least over parts of floor(units / per ship). */
  ships: number;
  /** The part that limits `ships` (fewest ships' worth listed; lowest type id on a tie). */
  shortOn: number;
  /** Parts with no sell order in range at the station, so zero ships' worth. */
  unlisted: number[];
  /** ISK for the next ship's parts the book can still supply, walked past the units the
   *  complete ships use. Parts the book cannot supply (`shortOn` always is one) are not in it. */
  nextShipListedCost: number;
}

/** Type id to units per ship. */
export function doctrineParts(fit: DoctrineFitSnapshot): Map<number, number> {
  const parts = new Map<number, number>([[fit.hullTypeId, 1]]);
  for (const id of [...fit.modules, ...fit.rigs]) parts.set(id, (parts.get(id) ?? 0) + 1);
  return new Map([...parts].sort(([a], [b]) => a - b));
}

function inRange(sell: readonly LadderLevel[]): LadderLevel[] {
  const best = sell[0]?.price;
  return best === undefined ? [] : sell.filter((level) => level.price <= best * PRICE_CEILING);
}

/** ISK to buy units `from` up to `to` (exclusive) of the ladder; units past its end cost nothing here. */
function costOfRange(ladder: readonly LadderLevel[], from: number, to: number): number {
  let cost = 0;
  let seen = 0;
  for (const level of ladder) {
    const lo = Math.max(from, seen);
    const hi = Math.min(to, seen + level.units);
    if (hi > lo) cost += (hi - lo) * level.price;
    seen += level.units;
    if (seen >= to) break;
  }
  return cost;
}

/**
 * Null when a part has no book (it failed to load, or none was asked for): a part that is
 * simply not listed is zero and named, but an unread book is unknown and shows nothing.
 */
export function doctrineCoverage(
  fit: DoctrineFitSnapshot,
  books: ReadonlyMap<number, readonly HubOrder[]>,
  stationId: number
): HubCoverage | null {
  let ships = Infinity;
  let shortOn = 0;
  const unlisted: number[] = [];
  const ladders = new Map<number, LadderLevel[]>();
  const parts = doctrineParts(fit);
  for (const [typeId, perShip] of parts) {
    const orders = books.get(typeId);
    if (!orders) return null;
    const ladder = inRange(hubLadders(orders, stationId).sell);
    ladders.set(typeId, ladder);
    if (ladder.length === 0) unlisted.push(typeId);
    const units = sum(ladder.map((level) => level.units));
    const fits = Math.floor(units / perShip);
    if (fits < ships) {
      ships = fits;
      shortOn = typeId;
    }
  }
  let nextShipListedCost = 0;
  for (const [typeId, perShip] of parts) {
    nextShipListedCost += costOfRange(ladders.get(typeId)!, ships * perShip, (ships + 1) * perShip);
  }
  return { ships, shortOn, unlisted, nextShipListedCost };
}
