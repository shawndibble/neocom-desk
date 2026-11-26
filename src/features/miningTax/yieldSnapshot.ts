import { loadAllCharacterYields } from './ledger';
import type { MiningYieldEntry } from '@/engine/miningTax/yieldGrouping';
import {
  valueMiningYield,
  type EntryValuation,
  type YieldReprocessingEntry,
} from '@/engine/miningTax/yieldValuation';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { loadCompressedOreTypeIds, loadReprocessing, loadTypes } from '@/sde/loadSde';
import type { ReprocessingMap } from '@/sde/types';
import { loadTypeNames } from '@/features/character/typeNames';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { loadOreFormNames } from './oreForm';
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
  type PriceBasis,
  type SidePrices,
} from '@/engine/miningTax/priceBasis';
import { eveToday } from '@/engine/miningTax/yieldRange';
import type { RefiningSetup } from '@/engine/industry/refiningSetup';
import { loadHubSnapshotRange } from '@/features/market/hubSnapshot';

export interface TrackedCharacter {
  characterId: number;
  characterName: string;
}

export interface BasisValuation {
  valuation: EntryValuation;
  materialUnitPrices: ReadonlyMap<number, number>;
}

export interface MiningYieldRow extends BasisValuation {
  characterId: number;
  characterName: string;
  entry: MiningYieldEntry;
  byBasis: Record<PriceBasis, BasisValuation>;
}

export interface MiningYieldSnapshot {
  rows: MiningYieldRow[];
  characters: TrackedCharacter[];
  reauthCharacters: TrackedCharacter[];
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
  typeVolumes: Map<number, number>;
  fetchedAt: Date | null;
  fromCache: boolean;
  refiningUnavailable: boolean;
}

function volumeCacheKey(typeId: number): string {
  return `type-volume:${typeId}`;
}

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
    if (lapsed.length > 0) void fetchVolumesFromEsi(lapsed).catch(() => {});
    return resolved;
  }
  for (const [typeId, volume] of await fetchVolumesFromEsi([...unknown, ...lapsed])) {
    if (volume !== null) resolved.set(typeId, volume);
  }
  return resolved;
}

async function fetchVolumesFromEsi(typeIds: number[]): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>();
  const now = Date.now();
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
    try {
      const { data } = await getUniverseType(typeId);
      if (!data) return;
      const volume = typeof data.volume === 'number' ? data.volume : null;
      map.set(typeId, volume);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, volumeCacheKey(typeId), volume, now);
    } catch {}
  });
  return map;
}

export async function loadMiningYieldSnapshot(
  showRefining = true,
  compressed = true,
  refining?: RefiningSetup
): Promise<MiningYieldSnapshot> {
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
      refiningUnavailable: false,
    };
  }

  const rawTypeIds = [
    ...new Set(allEntries.flatMap(({ entry }) => entry.oreLines.map((l) => l.typeId))),
  ];
  const systemIds = [...new Set(allEntries.map(({ entry }) => entry.solarSystemId))];

  let refiningUnavailable = false;
  const [compressedByRaw, reprocessingMap] = await Promise.all([
    loadCompressedOreTypeIds(),
    showRefining
      ? loadReprocessing().catch(() => {
          refiningUnavailable = true;
          return {} as ReprocessingMap;
        })
      : Promise.resolve<ReprocessingMap>({}),
  ]);
  const includeRefining = showRefining && !refiningUnavailable;
  const pricingTypeId = (typeId: number): number =>
    oreFormTypeId(typeId, compressedByRaw, compressed);

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
  const priceTypeIds = [...new Set([...pricingTypeIds, ...materialTypeIds])];

  const entryDates = allEntries.map(({ entry }) => entry.date);
  const today = eveToday(new Date());
  const [hubSnapshot, hubPrices] = await Promise.all([
    loadHubSnapshotRange(
      entryDates.reduce((min, date) => (date < min ? date : min)),
      entryDates.reduce((max, date) => (date > max ? date : max)),
      priceTypeIds
    ),
    getHubPrices(DEFAULT_TRADE_HUB, priceTypeIds),
  ]);
  const livePrices = new Map<number, SidePrices>();
  for (const typeId of priceTypeIds) {
    const aggregate = hubPrices.get(typeId);
    const buy = aggregate?.buyMax ?? null;
    const sell = aggregate?.sellMin ?? null;
    livePrices.set(typeId, {
      buy: buy && buy > 0 ? buy : null,
      sell: sell && sell > 0 ? sell : null,
    });
  }

  const characterIds = [...new Set(allEntries.map(({ characterId }) => characterId))];
  const modifiersByCharacter = new Map(
    await Promise.all(
      characterIds.map(
        async (id) =>
          [
            id,
            includeRefining ? await loadCharacterModifiers(id, Date.now()) : NO_CHARACTER_MODIFIERS,
          ] as const
      )
    )
  );

  const priceOn = (typeId: number, date: string, basis: PriceBasis) =>
    resolveUnitPrice(
      {
        day: hubSnapshot.saved.get(date)?.get(typeId),
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
      for (const line of entry.oreLines) {
        const raw = priceOn(pricingTypeId(line.typeId), entry.date, basis);
        if (raw !== undefined) rawUnitPrices.set(line.typeId, raw);
        const reprocessing = reprocessingByTypeId.get(line.typeId);
        for (const material of reprocessing?.materials ?? []) {
          const materialPrice = priceOn(material.typeId, entry.date, basis);
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
          { includeRefining, refining }
        ),
        materialUnitPrices: new Map(
          Object.entries(materialPrices).map(([typeId, price]) => [Number(typeId), price])
        ),
      };
    };
    const byBasis = Object.fromEntries(
      PRICE_BASES.map((basis) => [basis, valueOn(basis)])
    ) as Record<PriceBasis, BasisValuation>;
    return { characterId, characterName, entry, ...byBasis.buy, byBasis };
  });

  const [systemRows, materialNames, oreNames, sdeTypes] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    loadTypeNames(materialTypeIds),
    loadOreFormNames(rawTypeIds, compressed),
    loadTypes(),
  ]);
  const typeNames = new Map([...materialNames, ...oreNames]);
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
    refiningUnavailable,
  };
}
