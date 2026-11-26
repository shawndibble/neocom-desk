import { sum } from './math';
import { hubLadders, type HubOrder, type LadderLevel } from './market/haulingMarket';
import type { DoctrineFitSnapshot } from './srpDoctrine';

export const PRICE_CEILING = 2;

export interface HubCoverage {
  ships: number;
  shortOn: number;
  unlisted: number[];
  nextShipListedCost: number;
}

export function doctrineParts(fit: DoctrineFitSnapshot): Map<number, number> {
  const parts = new Map<number, number>([[fit.hullTypeId, 1]]);
  for (const id of [...fit.modules, ...fit.rigs]) parts.set(id, (parts.get(id) ?? 0) + 1);
  return new Map([...parts].sort(([a], [b]) => a - b));
}

function inRange(sell: readonly LadderLevel[]): LadderLevel[] {
  const best = sell[0]?.price;
  return best === undefined ? [] : sell.filter((level) => level.price <= best * PRICE_CEILING);
}

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
