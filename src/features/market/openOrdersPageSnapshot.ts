/**
 * The one read behind every Open Orders view: every authenticated Character's
 * open market orders, joined to the prices, cost bases, station names and
 * skills that `buildOpenOrderRows` needs to decide whether each one is in
 * trouble.
 *
 * Lifted out of `OpenOrdersPanel.tsx` when the Overview board grew an Open
 * Orders card. The card shows three counts — undercut, outbid, needs relisting
 * — and there is no cheaper way to compute them: "undercut" is a claim about
 * what a rival is charging, so it needs the station book whatever surface asks
 * the question. Two loaders would be two subtly different answers to the same
 * question on two pages of the same app.
 *
 * Its own module rather than an export off the panel: the panel exports a
 * component, and a value export beside one defeats fast refresh — the same
 * reason `orderBadgeKind.ts` sits apart from `OrderProblemBadge.tsx`.
 */
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { HubAggregate } from '@/market/fuzzwork';
import { loadAllCharactersOpenOrders, type OpenOrdersSnapshot } from './openOrdersData';
import { loadOrderCostBases, type OrderCostBasis } from './orderCostBasis';
import { loadStationBestPrices } from './orderCompetition';
import type { CharacterSkills } from './openOrdersModel';

export interface OpenOrdersPageSnapshot {
  openOrders: OpenOrdersSnapshot;
  typeNames: Map<number, string>;
  /**
   * NPC station lookup — a location absent here is a player structure, but
   * ONLY when `stationsLoaded` is true. `public/data/market/stations.json`
   * is deliberately excluded from the install precache (loadMarketSde.ts),
   * so a first offline visit to this tab can legitimately fail to load it —
   * that must read as "not checked" (`scopeNotChecked`), never as the false
   * claim "this is a player structure" (`structureMarketUnavailable`).
   */
  npcStations: Map<number, { name: string; systemId: number }>;
  stationsLoaded: boolean;
  /** Keyed `${locationId}:${typeId}`. */
  stationPrices: Map<string, HubAggregate>;
  costBases: Map<number, OrderCostBasis>;
  skillsByCharacter: Map<number, CharacterSkills>;
  now: number;
}

export async function loadOpenOrdersSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<OpenOrdersPageSnapshot> {
  const now = Date.now();
  const openOrders = await loadAllCharactersOpenOrders();

  const typeIds = new Set<number>();
  const requestsByStation = new Map<number, Set<number>>();
  const orderIdsByCharacter = new Map<number, number[]>();
  for (const entry of openOrders.entries) {
    const ids: number[] = [];
    for (const order of entry.orders) {
      typeIds.add(order.type_id);
      ids.push(order.order_id);
      const set = requestsByStation.get(order.location_id) ?? new Set<number>();
      set.add(order.type_id);
      requestsByStation.set(order.location_id, set);
    }
    orderIdsByCharacter.set(entry.characterId, ids);
  }

  // Already superseded: skip every follow-up fetch, their results would be discarded.
  if (signal.cancelled) {
    return {
      openOrders,
      typeNames: new Map(),
      npcStations: new Map(),
      stationsLoaded: false,
      stationPrices: new Map(),
      costBases: new Map(),
      skillsByCharacter: new Map(),
      now,
    };
  }

  const [typeNames, npcStationsSettled, stationPrices] = await Promise.all([
    loadTypeNames([...typeIds]),
    // Caught here, not left to reject the whole `Promise.all`: this file is
    // deliberately excluded from the install precache (loadMarketSde.ts), so
    // a first offline visit can legitimately fail to fetch it. `ok: false`
    // is threaded through as `stationsLoaded` so the panel/modal render "not
    // checked" rather than quietly treating every order as an unresolved
    // player structure.
    loadNpcStations().then(
      (entries): { ok: true; entries: NpcStationEntry[] } => ({ ok: true, entries }),
      (): { ok: false; entries: NpcStationEntry[] } => ({ ok: false, entries: [] })
    ),
    loadStationBestPrices(
      [...requestsByStation.entries()].map(([stationId, ids]) => ({
        stationId,
        typeIds: [...ids],
      }))
    ),
  ]);

  const npcStations = new Map(
    npcStationsSettled.entries.map((s) => [s.id, { name: s.name, systemId: s.systemId }] as const)
  );
  const stationsLoaded = npcStationsSettled.ok;

  const costBases = new Map<number, OrderCostBasis>();
  await Promise.all(
    openOrders.entries.map(async (entry) => {
      const ids = orderIdsByCharacter.get(entry.characterId) ?? [];
      const map = await loadOrderCostBases(entry.characterId, ids);
      for (const [orderId, basis] of map) costBases.set(orderId, basis);
    })
  );

  const skillsByCharacter = new Map<number, CharacterSkills>();
  await mapWithConcurrencyLimit(openOrders.entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const corrected = await loadCorrectedSkills(entry.characterId, now);
    skillsByCharacter.set(entry.characterId, {
      accountingLevel: corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0,
      brokerRelationsLevel: corrected.trained.get(SKILL_IDS.brokerRelations)?.level ?? 0,
      reprocessingLevel: corrected.trained.get(SKILL_IDS.reprocessing)?.level ?? 0,
      reprocessingEfficiencyLevel:
        corrected.trained.get(SKILL_IDS.reprocessingEfficiency)?.level ?? 0,
      scrapmetalProcessingLevel: corrected.trained.get(SKILL_IDS.scrapmetalProcessing)?.level ?? 0,
    });
  });

  return {
    openOrders,
    typeNames,
    npcStations,
    stationsLoaded,
    stationPrices,
    costBases,
    skillsByCharacter,
    now,
  };
}
