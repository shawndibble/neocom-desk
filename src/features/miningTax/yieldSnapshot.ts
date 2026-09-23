/**
 * Composes the Mining Yield Overview tab's data (issue #671): every tracked
 * character's unfiltered ore/ice and harvested-gas mining output (issue
 * #880), valued raw-vs-refined at each entry's own mined-date price.
 * Fetch/Dexie/SDE layer only — the pure arithmetic lives in
 * `src/engine/miningTax` (`valueMiningYield`).
 *
 * Raw ore is priced via its Compressed counterpart when one exists, the same
 * convention `pricing.ts` already uses for the Tax tab
 * (`docs/context/decisions/20260906-081307-…`) — not a new choice, reused for
 * consistency. Reprocessing output materials (minerals) have no compressed
 * form and price directly. Gas is deliberately absent from
 * `compressedOreTypeIds` and so prices as itself through `pricingTypeId`'s
 * fallback — raw Fullerites and serocins are what Reactions consume.
 */
import { loadAllCharacterYields } from './ledger';
import type { MiningYieldEntry } from '@/engine/miningTax/yieldGrouping';
import {
  valueMiningYield,
  type EntryValuation,
  type YieldReprocessingEntry,
} from '@/engine/miningTax/yieldValuation';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { loadPriceHistory, type PriceHistoryResult } from '@/features/market/priceHistory';
import { EsiError } from '@/esi/errors';
import { loadCompressedOreTypeIds, loadReprocessing, loadTypes } from '@/sde/loadSde';
import type { ReprocessingMap } from '@/sde/types';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { getUniverseType } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCached,
} from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getHubPrices } from '@/market/prices';
import {
  PRICE_BASES,
  resolveUnitPrice,
  weakestSource,
  type PriceBasis,
  type PriceSource,
  type SidePrices,
  type SnapshotDay,
} from '@/engine/miningTax/priceBasis';
import { eveToday } from '@/engine/miningTax/yieldRange';
import { loadPriceSnapshots, saveTodayPriceSnapshot } from './priceSnapshots';

export interface TrackedCharacter {
  characterId: number;
  characterName: string;
}

/** One row valued on one price basis (issue #1279). */
export interface BasisValuation {
  valuation: EntryValuation;
  /**
   * Price of each material the row's ore reprocesses into, for the detail
   * modal's refined-output list. The same prices `valuation` was built from,
   * kept rather than recomputed so the list and the total can never disagree;
   * a material with no price on this basis is simply absent.
   */
  materialUnitPrices: ReadonlyMap<number, number>;
  /** Where the row's ore prices came from — the weakest across its lines (`weakestSource`). */
  priceSource: PriceSource;
}

export interface MiningYieldRow extends BasisValuation {
  characterId: number;
  characterName: string;
  entry: MiningYieldEntry;
  /**
   * The row valued on every basis, so switching basis on the page never
   * refetches. The row's own `valuation`/`materialUnitPrices`/`priceSource`
   * are the default `buy` basis; the page swaps in the chosen one.
   */
  byBasis: Record<PriceBasis, BasisValuation>;
}

export interface MiningYieldSnapshot {
  rows: MiningYieldRow[];
  characters: TrackedCharacter[];
  reauthCharacters: TrackedCharacter[];
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  /** Ore/ice/gas types AND the materials they reprocess into — the detail modal names both. */
  typeNames: Map<number, string>;
  /**
   * m³ of one unit, from the SDE bake, falling back to a live ESI lookup for
   * a type the bake doesn't carry (issue #1283). Missing only for a type ESI
   * itself has no volume for, or one a fetch failure left unresolved.
   */
  typeVolumes: Map<number, number>;
  fetchedAt: Date | null;
  fromCache: boolean;
}

function volumeCacheKey(typeId: number): string {
  return `type-volume:${typeId}`;
}

/**
 * Volumes for types the SDE bake has no entry for (issue #1283) — mainly the
 * hand-tagged overrides in `typeOverrides.ts`, which add ore/ice variants the
 * bake never carried a row for. Cached under `STALE_AFTER.static`, same as
 * `typeNames.ts`'s name cache: a type's volume is as immutable as its name.
 * A cached `null` means ESI itself confirmed the type has no volume — cached
 * rather than re-asked every load, the same way a real volume is. Only a
 * type with NO cache entry at all blocks the caller; a merely stale one is
 * served as-is with a background refresh fired, same tradeoff `typeNames.ts`
 * makes for exactly the reason its header explains: a page holding one of
 * these types must not block on live ESI on every render.
 */
async function resolveMissingVolumes(typeIds: readonly number[]): Promise<Map<number, number>> {
  const resolved = new Map<number, number>();
  if (typeIds.length === 0) return resolved;

  const cached = await readCachedEntries<number | null>(
    GLOBAL_CACHE_CHARACTER_ID,
    typeIds.map(volumeCacheKey)
  );
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const typeId of typeIds) {
    const row = cached.get(volumeCacheKey(typeId));
    if (row === undefined) {
      unknown.push(typeId);
      continue;
    }
    if (row.value !== null) resolved.set(typeId, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.static) lapsed.push(typeId);
  }
  if (unknown.length === 0) {
    // Never awaited: the caller already has everything it needs from cache.
    if (lapsed.length > 0) void fetchVolumesFromEsi(lapsed).catch(() => {});
    return resolved;
  }
  for (const [typeId, volume] of await fetchVolumesFromEsi([...unknown, ...lapsed])) {
    if (volume !== null) resolved.set(typeId, volume);
  }
  return resolved;
}

/** The network half: per-id GET, caching both a real volume and a confirmed "no volume" as `null`. Never rejects. */
async function fetchVolumesFromEsi(typeIds: number[]): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>();
  const now = Date.now();
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
    try {
      const { data } = await getUniverseType(typeId);
      if (!data) return; // 304 Not Modified: unreachable, no etag is ever sent here.
      const volume = typeof data.volume === 'number' ? data.volume : null;
      map.set(typeId, volume);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, volumeCacheKey(typeId), volume, now);
    } catch {
      // Genuinely unresolvable, or offline mid-fallback: leave it uncached —
      // the caller's own stale cached value (if any) already stands.
    }
  });
  return map;
}

/**
 * `showRefining` false (issue #1281's page switch, default on) skips
 * everything only refining needs — the reprocessing recipe bake, material
 * price history/snapshots, and character skills/implants — for a pilot who
 * never refines. `valueMiningYield`'s `includeRefining` flag keeps the
 * resulting rows from reading as "Partial" for refine data that was never
 * fetched on purpose.
 */
export async function loadMiningYieldSnapshot(showRefining = true): Promise<MiningYieldSnapshot> {
  const yields = await loadAllCharacterYields();

  const characters: TrackedCharacter[] = yields.map((y) => ({
    characterId: y.characterId,
    characterName: y.characterName,
  }));
  const reauthCharacters: TrackedCharacter[] = yields
    .filter((y) => y.needsReauth)
    .map((y) => ({ characterId: y.characterId, characterName: y.characterName }));
  let fetchedAt: Date | null = null;
  let fromCache = yields.length > 0;
  for (const y of yields) {
    if (y.fetchedAt && (!fetchedAt || y.fetchedAt < fetchedAt)) fetchedAt = y.fetchedAt;
    if (!y.fromCache) fromCache = false;
  }

  const allEntries = yields.flatMap((y) =>
    y.entries.map((entry) => ({
      characterId: y.characterId,
      characterName: y.characterName,
      entry,
    }))
  );

  if (allEntries.length === 0) {
    return {
      rows: [],
      characters,
      reauthCharacters,
      systemNames: new Map(),
      systemSecurity: new Map(),
      typeNames: new Map(),
      typeVolumes: new Map(),
      fetchedAt,
      fromCache,
    };
  }

  const rawTypeIds = [
    ...new Set(allEntries.flatMap(({ entry }) => entry.oreLines.map((l) => l.typeId))),
  ];
  const systemIds = [...new Set(allEntries.map(({ entry }) => entry.solarSystemId))];

  const [compressedByRaw, reprocessingMap] = await Promise.all([
    loadCompressedOreTypeIds(),
    showRefining ? loadReprocessing() : Promise.resolve<ReprocessingMap>({}),
  ]);
  const pricingTypeId = (typeId: number): number => compressedByRaw[String(typeId)] ?? typeId;

  const reprocessingByTypeId = new Map<number, YieldReprocessingEntry | undefined>();
  for (const typeId of rawTypeIds) {
    const entry = reprocessingMap[String(typeId)];
    reprocessingByTypeId.set(
      typeId,
      entry
        ? {
            portionSize: entry.portionSize,
            materials: entry.materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
            specialisationSkillId: entry.specialisationSkillID,
          }
        : undefined
    );
  }

  const materialTypeIds = [
    ...new Set(
      [...reprocessingByTypeId.values()].flatMap((r) => r?.materials.map((m) => m.typeId) ?? [])
    ),
  ];
  const pricingTypeIds = [...new Set(rawTypeIds.map(pricingTypeId))];
  const historyTypeIds = [...new Set([...pricingTypeIds, ...materialTypeIds])];

  // Some type_ids in this union (e.g. non-tradable ore/ice variants like
  // Banidine/Augumene) 400 from ESI's /markets/{region}/history — a real,
  // honest "not tradable" answer (esiFetch has already retried anything
  // transient before this catch ever sees it, same reasoning as
  // typeNames.ts's 404-only narrowing). Only that specific, expected
  // rejection is tolerated per id — the same "missing = 0 contribution, not
  // thrown" convention `valueMiningYield` already uses. Anything else (a
  // budget refusal, a 5xx, a timeout) still fails the whole snapshot rather
  // than being silently priced as "not tradable".
  const historyAttempts = await Promise.allSettled(
    historyTypeIds.map(
      async (typeId) =>
        [typeId, await loadPriceHistory(DEFAULT_TRADE_HUB.regionId, typeId)] as const
    )
  );
  const histories: (readonly [number, PriceHistoryResult])[] = [];
  for (const attempt of historyAttempts) {
    if (attempt.status === 'fulfilled') {
      histories.push(attempt.value);
      continue;
    }
    if (attempt.reason instanceof EsiError && attempt.reason.status === 400) continue;
    throw attempt.reason;
  }
  // Today's live Jita book for every priced type, saved as today's snapshot
  // before anything reads the snapshots back — so today prices as "saved".
  // `getHubPrices` never throws (a null price per type when Fuzzwork is down);
  // a failed save only costs today's snapshot, never the page.
  const today = eveToday();
  const hubPrices = await getHubPrices(DEFAULT_TRADE_HUB, historyTypeIds);
  const livePrices = new Map<number, SidePrices>();
  const todaySnapshot: SnapshotDay = {};
  for (const typeId of historyTypeIds) {
    const aggregate = hubPrices.get(typeId);
    const buy = aggregate?.buyMax ?? null;
    const sell = aggregate?.sellMin ?? null;
    const prices: SidePrices = {
      buy: buy && buy > 0 ? buy : null,
      sell: sell && sell > 0 ? sell : null,
    };
    livePrices.set(typeId, prices);
    if (prices.buy !== null || prices.sell !== null) todaySnapshot[typeId] = prices;
  }
  try {
    await saveTodayPriceSnapshot(today, todaySnapshot);
  } catch {
    // Storage full or blocked: the page still prices from what it has.
  }
  const savedByDate = await loadPriceSnapshots().catch(() => new Map<string, SnapshotDay>());

  const priceByTypeAndDate = new Map<number, Map<string, number>>();
  for (const [typeId, result] of histories) {
    const byDate = new Map<string, number>();
    for (const point of result.points) byDate.set(point.date, point.average);
    priceByTypeAndDate.set(typeId, byDate);
  }

  const characterIds = [...new Set(allEntries.map(({ characterId }) => characterId))];
  const modifiersByCharacter = new Map(
    await Promise.all(
      characterIds.map(
        async (id) =>
          [
            id,
            showRefining ? await loadCharacterModifiers(id, Date.now()) : NO_CHARACTER_MODIFIERS,
          ] as const
      )
    )
  );

  const priceOn = (typeId: number, date: string, basis: PriceBasis) =>
    resolveUnitPrice(
      {
        saved: savedByDate.get(date)?.[typeId],
        average: priceByTypeAndDate.get(typeId)?.get(date),
        live: livePrices.get(typeId),
      },
      basis,
      date,
      today
    );

  const rows: MiningYieldRow[] = allEntries.map(({ characterId, characterName, entry }) => {
    const modifiers = modifiersByCharacter.get(characterId) ?? NO_CHARACTER_MODIFIERS;
    const valueOn = (basis: PriceBasis): BasisValuation => {
      const rawUnitPrices = new Map<number, number>();
      const materialPrices: Record<number, number> = {};
      const sources: PriceSource[] = [];
      for (const line of entry.oreLines) {
        const raw = priceOn(pricingTypeId(line.typeId), entry.date, basis);
        sources.push(raw.source);
        if (raw.price !== undefined) rawUnitPrices.set(line.typeId, raw.price);
        const reprocessing = reprocessingByTypeId.get(line.typeId);
        for (const material of reprocessing?.materials ?? []) {
          const materialPrice = priceOn(material.typeId, entry.date, basis).price;
          if (materialPrice !== undefined) materialPrices[material.typeId] = materialPrice;
        }
      }
      return {
        valuation: valueMiningYield(
          entry.oreLines,
          rawUnitPrices,
          reprocessingByTypeId,
          modifiers,
          materialPrices,
          { includeRefining: showRefining }
        ),
        materialUnitPrices: new Map(
          Object.entries(materialPrices).map(([typeId, price]) => [Number(typeId), price])
        ),
        priceSource: weakestSource(sources),
      };
    };
    const byBasis = Object.fromEntries(
      PRICE_BASES.map((basis) => [basis, valueOn(basis)])
    ) as Record<PriceBasis, BasisValuation>;
    return { characterId, characterName, entry, ...byBasis.buy, byBasis };
  });

  const [systemRows, typeNames, sdeTypes] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    // Materials as well as ore: the detail modal lists what each day refines
    // into, and an unnamed "#34" there is no use to a miner.
    loadTypeNames([...rawTypeIds, ...materialTypeIds]),
    loadTypes(),
  ]);
  const typeVolumes = new Map<number, number>();
  const typeIdsMissingVolume: number[] = [];
  for (const typeId of rawTypeIds) {
    const volume = sdeTypes[String(typeId)]?.volume;
    if (typeof volume === 'number') typeVolumes.set(typeId, volume);
    else typeIdsMissingVolume.push(typeId);
  }
  const esiVolumes = await resolveMissingVolumes(typeIdsMissingVolume);
  for (const [typeId, volume] of esiVolumes) typeVolumes.set(typeId, volume);
  const systemNames = new Map<number, string>();
  const systemSecurity = new Map<number, number>();
  for (const { id, name, security } of systemRows) {
    if (name) systemNames.set(id, name);
    if (security !== null) systemSecurity.set(id, security);
  }

  return {
    rows,
    characters,
    reauthCharacters,
    systemNames,
    systemSecurity,
    typeNames,
    typeVolumes,
    fetchedAt,
    fromCache,
  };
}
