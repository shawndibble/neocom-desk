/**
 * Composes the Mining Yield Overview tab's data (issue #671): every tracked
 * character's unfiltered ore/ice mining output, valued raw-vs-refined at
 * each entry's own mined-date price. Fetch/Dexie/SDE layer only — the pure
 * arithmetic lives in `src/engine/miningTax` (`valueMiningYield`).
 *
 * Raw ore is priced via its Compressed counterpart when one exists, the same
 * convention `pricing.ts` already uses for the Tax tab
 * (`docs/context/decisions/20260906-081307-…`) — not a new choice, reused for
 * consistency. Reprocessing output materials (minerals) have no compressed
 * form and price directly.
 */
import { loadAllCharacterYields } from './ledger';
import type { MiningYieldEntry } from '@/engine/miningTax/yieldGrouping';
import {
  valueMiningYield,
  type EntryValuation,
  type YieldReprocessingEntry,
} from '@/engine/miningTax/yieldValuation';
import type { ReprocessingSkills } from '@/engine/industry/reprocessing';
import { loadPriceHistory, type PriceHistoryResult } from '@/features/market/priceHistory';
import { EsiError } from '@/esi/errors';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCompressedOreTypeIds, loadReprocessing } from '@/sde/loadSde';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

export interface TrackedCharacter {
  characterId: number;
  characterName: string;
}

export interface MiningYieldRow {
  characterId: number;
  characterName: string;
  entry: MiningYieldEntry;
  valuation: EntryValuation;
}

export interface MiningYieldSnapshot {
  rows: MiningYieldRow[];
  characters: TrackedCharacter[];
  reauthCharacters: TrackedCharacter[];
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
  fetchedAt: Date | null;
  fromCache: boolean;
}

const NO_SKILLS: ReprocessingSkills = {
  reprocessingLevel: 0,
  reprocessingEfficiencyLevel: 0,
  specialisationLevel: 0,
};

/** A character's own reprocessing skills — the same resolution `appraisalData.ts` uses for the refine comparison. */
async function loadReprocessingSkills(characterId: number): Promise<ReprocessingSkills> {
  const corrected = await loadCorrectedSkills(characterId, Date.now());
  return {
    reprocessingLevel: corrected.trained.get(SKILL_IDS.reprocessing)?.level ?? 0,
    reprocessingEfficiencyLevel:
      corrected.trained.get(SKILL_IDS.reprocessingEfficiency)?.level ?? 0,
    specialisationLevel: 0,
  };
}

export async function loadMiningYieldSnapshot(): Promise<MiningYieldSnapshot> {
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
    loadReprocessing(),
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
  const priceByTypeAndDate = new Map<number, Map<string, number>>();
  for (const [typeId, result] of histories) {
    const byDate = new Map<string, number>();
    for (const point of result.points) byDate.set(point.date, point.average);
    priceByTypeAndDate.set(typeId, byDate);
  }

  const characterIds = [...new Set(allEntries.map(({ characterId }) => characterId))];
  const skillsByCharacter = new Map(
    await Promise.all(
      characterIds.map(async (id) => [id, await loadReprocessingSkills(id)] as const)
    )
  );

  const rows: MiningYieldRow[] = allEntries.map(({ characterId, characterName, entry }) => {
    const rawUnitPrices = new Map<number, number>();
    const materialPrices: Record<number, number> = {};
    for (const line of entry.oreLines) {
      const price = priceByTypeAndDate.get(pricingTypeId(line.typeId))?.get(entry.date);
      if (price !== undefined) rawUnitPrices.set(line.typeId, price);
      const reprocessing = reprocessingByTypeId.get(line.typeId);
      for (const material of reprocessing?.materials ?? []) {
        const materialPrice = priceByTypeAndDate.get(material.typeId)?.get(entry.date);
        if (materialPrice !== undefined) materialPrices[material.typeId] = materialPrice;
      }
    }
    const skills = skillsByCharacter.get(characterId) ?? NO_SKILLS;
    const valuation = valueMiningYield(
      entry.oreLines,
      rawUnitPrices,
      reprocessingByTypeId,
      skills,
      materialPrices
    );
    return { characterId, characterName, entry, valuation };
  });

  const [systemRows, typeNames] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    loadTypeNames(rawTypeIds),
  ]);
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
    fetchedAt,
    fromCache,
  };
}
