import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { buildOpenOrderRows, type OpenOrderRow } from './openOrdersModel';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';

export function loadOpenOrdersSnapshotLazy(
  characterId: number,
  signal: RouteSnapshotSignal<OpenOrdersPageSnapshot>
): Promise<OpenOrdersPageSnapshot> {
  return import('./openOrdersPageSnapshot').then((m) =>
    m.loadOpenOrdersSnapshot(characterId, signal)
  );
}

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
