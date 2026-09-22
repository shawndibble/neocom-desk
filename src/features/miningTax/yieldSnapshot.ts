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
  type GeneralReprocessingSkills,
  type YieldReprocessingEntry,
} from '@/engine/miningTax/yieldValuation';
import type { TrainedSkill } from '@/engine/types';
import { loadPriceHistory, type PriceHistoryResult } from '@/features/market/priceHistory';
import { EsiError } from '@/esi/errors';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { resolveImplantBonusPct } from '@/engine/industry/reprocessing';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCompressedOreTypeIds, loadReprocessing, loadTypes } from '@/sde/loadSde';
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
  /**
   * Mined-date price of each material the row's ore reprocesses into, for the
   * detail modal's refined-output list. The same prices `valuation` was built
   * from, kept rather than recomputed so the list and the total can never
   * disagree; a material ESI had no history for on that date is simply absent.
   */
  materialUnitPrices: ReadonlyMap<number, number>;
}

export interface MiningYieldSnapshot {
  rows: MiningYieldRow[];
  characters: TrackedCharacter[];
  reauthCharacters: TrackedCharacter[];
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  /** Ore/ice/gas types AND the materials they reprocess into — the detail modal names both. */
  typeNames: Map<number, string>;
  /** m³ of one unit, from the SDE bake. Missing for a type the bake doesn't carry. */
  typeVolumes: Map<number, number>;
  fetchedAt: Date | null;
  fromCache: boolean;
}

const NO_SKILLS: GeneralReprocessingSkills = {
  reprocessingLevel: 0,
  reprocessingEfficiencyLevel: 0,
};
const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();

/**
 * A character's general reprocessing skills, plus their full trained-skill
 * map so `valueMiningYield` can resolve each ore line's own specialisation
 * skill (issue #1058) — a mixed day's entry can refine ore and ice under two
 * different specialisations, so that resolution cannot happen here, ahead of
 * time, for the whole character.
 */
async function loadReprocessingSkills(
  characterId: number
): Promise<{ skills: GeneralReprocessingSkills; trained: ReadonlyMap<number, TrainedSkill> }> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadCharacterImplants(characterId),
  ]);
  return {
    skills: {
      reprocessingLevel: corrected.trained.get(SKILL_IDS.reprocessing)?.level ?? 0,
      reprocessingEfficiencyLevel:
        corrected.trained.get(SKILL_IDS.reprocessingEfficiency)?.level ?? 0,
      implantBonusPct: resolveImplantBonusPct(implants?.data ?? []),
    },
    trained: corrected.trained,
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
    const { skills, trained } = skillsByCharacter.get(characterId) ?? {
      skills: NO_SKILLS,
      trained: NO_TRAINED,
    };
    const valuation = valueMiningYield(
      entry.oreLines,
      rawUnitPrices,
      reprocessingByTypeId,
      skills,
      trained,
      materialPrices
    );
    return {
      characterId,
      characterName,
      entry,
      valuation,
      materialUnitPrices: new Map(
        Object.entries(materialPrices).map(([typeId, price]) => [Number(typeId), price])
      ),
    };
  });

  const [systemRows, typeNames, sdeTypes] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    // Materials as well as ore: the detail modal lists what each day refines
    // into, and an unnamed "#34" there is no use to a miner.
    loadTypeNames([...rawTypeIds, ...materialTypeIds]),
    loadTypes(),
  ]);
  const typeVolumes = new Map<number, number>();
  for (const typeId of rawTypeIds) {
    const volume = sdeTypes[String(typeId)]?.volume;
    if (typeof volume === 'number') typeVolumes.set(typeId, volume);
  }
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
