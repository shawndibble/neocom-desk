/**
 * Light entry points to the shared Open Orders read, for a surface that is not
 * the Orders page (the Overview card, Wallet's Balance). Both defer the heavy
 * fetch layer and build rows the same way, so their counts and the page's agree
 * on everything the cheap read can see.
 */
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { buildOpenOrderRows, type OpenOrderRow } from './openOrdersModel';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';

/** Deferred: the fetch layer reaches type names, skills, the NPC station table and the competition loaders. */
export function loadOpenOrdersSnapshotLazy(
  characterId: number,
  signal: RouteSnapshotSignal<OpenOrdersPageSnapshot>
): Promise<OpenOrdersPageSnapshot> {
  return import('./openOrdersPageSnapshot').then((m) =>
    m.loadOpenOrdersSnapshot(characterId, signal)
  );
}

/**
 * Every Character's rows from a snapshot, judged from station prices alone: no
 * deep (system or region) check, structure books, problem history or per-order
 * standings, which the Orders page adds. Such an order can read healthier here.
 */
export function openOrderRowsFromSnapshot(snapshot: OpenOrdersPageSnapshot): OpenOrderRow[] {
  return buildOpenOrderRows({
    snapshot: snapshot.openOrders,
    typeNames: snapshot.typeNames,
    stationPrices: snapshot.stationPrices,
    costBases: snapshot.costBases,
    walletBasisGaps: snapshot.walletBasisGaps,
    stationNames: new Map([...snapshot.npcStations].map(([id, s]) => [id, s.name])),
    skillsByCharacter: snapshot.skillsByCharacter,
    standingsByOrder: snapshot.standingsByOrder,
    now: snapshot.now,
  });
}
