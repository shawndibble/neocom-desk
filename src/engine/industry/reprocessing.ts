import { SKILL_IDS } from './types';

/**
 * Reprocessing (refining): what an item breaks down into, and what that is
 * worth (issue #537).
 *
 * Pure, like the rest of `src/engine/industry` — the baked yields, the
 * character's skill levels and the material prices all arrive as inputs.
 *
 * Two things this module refuses to guess, recorded in
 * `docs/context/decisions/…-reprocessing-v1-models-the-skills…`:
 * - **The facility.** A player structure's own reprocessing rate and its rigs
 *   are not readable from ESI for an arbitrary location, so `stationRate` is
 *   an input defaulting to the NPC station's 50%, and callers must SAY that
 *   is what they assumed rather than presenting the result as fact.
 * - **The tax.** The standings-based station tax is equally unknowable, so
 *   nothing here deducts one. A caller that learns a real rate can apply it
 *   to `total` itself.
 *
 * The portion trap is the whole reason `batches` exists: SDE material
 * quantities are per `portionSize`, not per unit, so refining 3 units of a
 * 100-portion item returns NOTHING. Callers must show the remainder rather
 * than quietly rounding a part batch up into value that does not exist.
 */

/** The NPC station's own reprocessing rate, before any skill. Exported so the UI can name the assumption it is showing. */
export const BASE_STATION_REPROCESSING_RATE = 0.5;

/** One material an item reprocesses into, per `portionSize` units of it. */
export interface ReprocessingMaterial {
  typeId: number;
  /** Units returned per whole portion at 100% efficiency. */
  quantity: number;
}

export interface ReprocessingSkills {
  /** Reprocessing (3385): +3% a level. */
  reprocessingLevel: number;
  /** Reprocessing Efficiency (3389): +2% a level. */
  reprocessingEfficiencyLevel: number;
  /** Scrapmetal Processing (12196) for items, or the matching ore specialisation: +2% a level. */
  specialisationLevel: number;
  /** The facility's own rate; defaults to an NPC station's 50%. */
  stationRate?: number;
  /**
   * True when `specialisationLevel` came from Scrapmetal Processing rather
   * than an ore/ice/moon-ore specialisation (issue #1226) — Scrapmetal
   * Processing is EVE's only bonus to scrap yield; Reprocessing and
   * Reprocessing Efficiency do not apply to it.
   */
  isScrap?: boolean;
}

/** The two general reprocessing skills, ahead of resolving any type's specialisation. */
export type GeneralReprocessingSkills = Omit<ReprocessingSkills, 'specialisationLevel'>;

/**
 * Which specialisation skill applies to a type, and what level the
 * character has in it (issue #1058) — the one shared resolver every
 * refining surface uses instead of each guessing or hardcoding its own.
 *
 * `specialisationSkillId` comes from the SDE bake's attribute-790 join
 * (`ReprocessingType.specialisationSkillID`); its absence IS the classifier
 * for "this type refines under Scrapmetal Processing", not a gap to guess
 * at — every ore, ice and moon-ore type carries the attribute, nothing else
 * does.
 */
export function resolveSpecialisationLevel(
  specialisationSkillId: number | undefined,
  trained: ReadonlyMap<number, { level: number }>
): number {
  return trained.get(specialisationSkillId ?? SKILL_IDS.scrapmetalProcessing)?.level ?? 0;
}

/** `resolveSpecialisationLevel`, folded into the full `ReprocessingSkills` shape `reprocessingEfficiency` takes — the assembly every per-row call site otherwise repeats by hand. */
export function resolveReprocessingSkills(
  general: GeneralReprocessingSkills,
  specialisationSkillId: number | undefined,
  trained: ReadonlyMap<number, { level: number }>
): ReprocessingSkills {
  return {
    ...general,
    specialisationLevel: resolveSpecialisationLevel(specialisationSkillId, trained),
    isScrap: specialisationSkillId === undefined,
  };
}

/**
 * Station rate times the skill multipliers. Never clamped to 1: a rigged
 * structure with maxed skills genuinely exceeds it.
 *
 * Scrap (`isScrap`) only ever gets Scrapmetal Processing's bonus (issue
 * #1226) — Reprocessing and Reprocessing Efficiency are ore/ice/moon-ore
 * skills and do not apply to it in EVE.
 */
export function reprocessingEfficiency({
  reprocessingLevel,
  reprocessingEfficiencyLevel,
  specialisationLevel,
  stationRate = BASE_STATION_REPROCESSING_RATE,
  isScrap = false,
}: ReprocessingSkills): number {
  if (isScrap) {
    return stationRate * (1 + 0.02 * specialisationLevel);
  }
  return (
    stationRate *
    (1 + 0.03 * reprocessingLevel) *
    (1 + 0.02 * reprocessingEfficiencyLevel) *
    (1 + 0.02 * specialisationLevel)
  );
}

export interface ReprocessingYieldInput {
  /** Units that must be refined together; a part batch yields nothing. */
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  /** Units of the item on hand. */
  units: number;
  /** From `reprocessingEfficiency`. */
  efficiency: number;
}

export interface ReprocessingYield {
  /** Whole portions the units cover. */
  batches: number;
  unitsRefined: number;
  /** Units that cannot make up a whole portion, and so return nothing. */
  unitsLeftOver: number;
  /** Materials actually returned. A material flooring to zero is absent, never a zero line. */
  outputs: ReprocessingMaterial[];
}

export function reprocessingYield({
  portionSize,
  materials,
  units,
  efficiency,
}: ReprocessingYieldInput): ReprocessingYield {
  if (!(portionSize > 0) || !(units > 0)) {
    return { batches: 0, unitsRefined: 0, unitsLeftOver: Math.max(0, units), outputs: [] };
  }
  const batches = Math.floor(units / portionSize);
  const unitsRefined = batches * portionSize;
  const outputs: ReprocessingMaterial[] = [];
  for (const material of materials) {
    // Floored per material, the way the game returns whole units — summing
    // first and rounding once would invent fractions of a mineral.
    const quantity = Math.floor(material.quantity * batches * efficiency);
    if (quantity > 0) outputs.push({ typeId: material.typeId, quantity });
  }
  return { batches, unitsRefined, unitsLeftOver: units - unitsRefined, outputs };
}

export interface ReprocessingValue {
  total: number;
  /** False when at least one material had no price, so `total` is a floor, not the answer. */
  pricedAll: boolean;
  unpricedTypeIds: number[];
}

/**
 * What the materials fetch at the prices given.
 *
 * A material with no price is NOT counted as free: it is listed in
 * `unpricedTypeIds` and `pricedAll` goes false, so the caller can say the
 * total is partial instead of quietly under-reporting the exit's worth.
 */
export function reprocessingValue(
  outputs: readonly ReprocessingMaterial[],
  prices: Readonly<Record<number, number>>
): ReprocessingValue {
  let total = 0;
  const unpricedTypeIds: number[] = [];
  for (const output of outputs) {
    const price = prices[output.typeId];
    if (price === undefined || !(price > 0)) {
      unpricedTypeIds.push(output.typeId);
      continue;
    }
    total += price * output.quantity;
  }
  return { total, pricedAll: unpricedTypeIds.length === 0, unpricedTypeIds };
}
