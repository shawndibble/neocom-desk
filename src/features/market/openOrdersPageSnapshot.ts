import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { loadCharacterStandings } from '@/features/character/standings';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { HubAggregate } from '@/market/fuzzwork';
import { loadAllCharactersOpenOrders, type OpenOrdersSnapshot } from './openOrdersData';
import {
  loadOrderCostBases,
  loadWalletOrderCostBases,
  type OrderCostBasis,
  type WalletBasisGap,
} from './orderCostBasis';
import { loadStationBestPrices } from './orderCompetition';
import { loadOrderProblemSamples } from './orderProblemSamples';
import type { OrderProblemSample } from '@/engine/market/orderProblemHistory';
import type { ResolvedStandings } from '@/engine/market/standings';
import { resolveLocationStandings } from './locationStandings';
import type { CharacterSkills } from './openOrdersModel';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { hubFeeDiscountFactor, TRADE_HUBS } from '@/market/hubs';
import { orderSlotBreakdown, type OrderSlotBreakdown } from '@/engine/market/orderSlots';

export interface OpenOrdersPageSnapshot {
  openOrders: OpenOrdersSnapshot;
  typeNames: Map<number, string>;
  npcStations: Map<number, { name: string; systemId: number }>;
  stationsLoaded: boolean;
  stationPrices: Map<string, HubAggregate>;
  costBases: Map<number, OrderCostBasis>;
  walletBasisGaps: Map<number, WalletBasisGap>;
  problemSamples: Map<number, readonly OrderProblemSample[]>;
  skillsByCharacter: Map<number, CharacterSkills>;
  orderSlotsByCharacter?: Map<number, OrderSlotBreakdown | null>;
  standingsByOrder: Map<number, ResolvedStandings>;
  now: number;
  corporation?: { needsReauth: boolean };
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

  if (signal.cancelled) {
    return {
      openOrders,
      typeNames: new Map(),
      npcStations: new Map(),
      stationsLoaded: false,
      stationPrices: new Map(),
      costBases: new Map(),
      walletBasisGaps: new Map(),
      problemSamples: new Map(),
      skillsByCharacter: new Map(),
      standingsByOrder: new Map(),
      now,
    };
  }

  const problemSamplesPromise = loadOrderProblemSamples(
    openOrders.entries.map((entry) => entry.characterId)
  );

  const [typeNames, npcStationsSettled, stationPrices] = await Promise.all([
    loadTypeNames([...typeIds]),
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
  const walletBasisGaps = new Map<number, WalletBasisGap>();
  await Promise.all(
    openOrders.entries.map(async (entry) => {
      const ids = orderIdsByCharacter.get(entry.characterId) ?? [];
      const map = await loadOrderCostBases(entry.characterId, ids);
      for (const [orderId, basis] of map) costBases.set(orderId, basis);
      const wallet = await loadWalletOrderCostBases(
        entry.characterId,
        entry.orders,
        new Set(map.keys())
      );
      for (const [orderId, basis] of wallet.bases) costBases.set(orderId, basis);
      for (const [orderId, gap] of wallet.gaps) walletBasisGaps.set(orderId, gap);
    })
  );

  const problemSamples = await problemSamplesPromise;

  const skillsByCharacter = new Map<number, CharacterSkills>();
  const orderSlotsByCharacter = new Map<number, OrderSlotBreakdown | null>();
  const standingsByCharacter = new Map<
    number,
    Awaited<ReturnType<typeof loadCharacterStandings>>
  >();
  await mapWithConcurrencyLimit(openOrders.entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const [modifiers, corrected, standings] = await Promise.all([
      loadCharacterModifiers(entry.characterId, now),
      loadCorrectedSkills(entry.characterId, now, { skipQueueWithoutScope: true }),
      loadCharacterStandings(entry.characterId),
    ]);
    skillsByCharacter.set(entry.characterId, {
      accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
      brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
      advancedBrokerRelationsLevel: modifiers.skills[SKILL_IDS.advancedBrokerRelations] ?? 0,
      modifiers,
    });
    orderSlotsByCharacter.set(
      entry.characterId,
      corrected.skillsResult ? orderSlotBreakdown(corrected.trained) : null
    );
    standingsByCharacter.set(entry.characterId, standings);
  });

  const standingsByOrder = new Map<number, ResolvedStandings>();
  const allOrders = openOrders.entries.flatMap((entry) =>
    entry.orders.map((order) => ({ characterId: entry.characterId, order }))
  );
  await mapWithConcurrencyLimit(
    allOrders,
    ESI_FANOUT_CONCURRENCY,
    async ({ characterId, order }) => {
      const standings = standingsByCharacter.get(characterId) ?? [];
      const resolved = await resolveLocationStandings(order.location_id, standings);
      const feeDiscountFactor = hubFeeDiscountFactor(
        TRADE_HUBS.find((hub) => hub.stationId === order.location_id),
        Date.now()
      );
      standingsByOrder.set(
        order.order_id,
        feeDiscountFactor === 1 ? resolved : { ...resolved, feeDiscountFactor }
      );
    }
  );

  return {
    openOrders,
    typeNames,
    npcStations,
    stationsLoaded,
    stationPrices,
    costBases,
    walletBasisGaps,
    problemSamples,
    skillsByCharacter,
    orderSlotsByCharacter,
    standingsByOrder,
    now,
  };
}
