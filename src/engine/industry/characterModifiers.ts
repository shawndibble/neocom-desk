/**
 * Character Modifiers (issue #1284): one value, built once from a
 * Character's snapshot (trained skill levels + active-clone implants), that
 * every pricing path takes instead of loose bonus percentages.
 *
 * Owns "which bonus applies to which activity" so no caller has to:
 *   manufacturing time: Industry, Advanced Industry, the blueprint's own
 *                       science skills (issue #1228), BX-80x implant (#1229)
 *   reaction time:      Reactions only (issue #513)
 *   refining yield:     ore/ice/moon ore get Reprocessing, Reprocessing
 *                       Efficiency, their specialisation and the RX-80x
 *                       implant (#1227); scrap gets Scrapmetal Processing
 *                       only (#1226)
 *
 * Engine entry points take `CharacterModifiers` as a required input — no
 * default — so a pricing path that forgets a bonus is a type error rather
 * than a silently slower/cheaper quote. Snapshot gathering (Dexie/ESI) lives
 * in `src/features/character/characterModifiers.ts`; this file stays pure.
 */
import {
  BASE_STATION_REPROCESSING_RATE,
  reprocessingEfficiency,
  type ReprocessingSkills,
} from './reprocessing';
import type { BlueprintSkillRequirement, IndustryActivity, SkillLevels } from './types';
import { MANUFACTURING_TIME_SCIENCE_SKILL_PCT, SKILL_IDS } from './types';

/** What a Character brings to the math: trained levels and active-clone implant typeIDs. */
export interface CharacterSnapshot {
  skills: SkillLevels;
  implantTypeIds: readonly number[];
}

/** See the file header. Build with `characterModifiers`; read through the functions below. */
export interface CharacterModifiers {
  /** Raw trained levels — fee rates (Accounting, Broker Relations) and skill gates still read these. */
  readonly skills: Readonly<SkillLevels>;
  /** Best fitted BX-80x manufacturing-time bonus, percent; 0 with none. */
  readonly manufacturingTimeImplantPct: number;
  /** Best fitted RX-80x ore/ice refining bonus, percent; 0 with none. */
  readonly refiningImplantPct: number;
}

/**
 * Zainou 'Beancounter' Industry BX-80x implant type IDs -> the % bonus their
 * own ESI/SDE description gives to manufacturing job time (issue #1229).
 * One implant slot, so a flat lookup beats a general dogma-attribute read.
 */
export const MANUFACTURING_TIME_IMPLANT_TYPE_IDS: Readonly<Record<number, number>> = {
  27170: 1, // BX-801
  27167: 2, // BX-802
  27171: 4, // BX-804
};

/**
 * Zainou 'Beancounter' Reprocessing RX-80x implant type IDs -> the % bonus
 * their own ESI/SDE description gives to ore and ice reprocessing yield
 * (issue #1227). Same one-slot reasoning as the BX line above.
 */
export const REFINING_IMPLANT_TYPE_IDS: Readonly<Record<number, number>> = {
  27175: 1, // RX-801
  27169: 2, // RX-802
  27174: 4, // RX-804
};

function bestImplantPct(
  implantTypeIds: readonly number[],
  table: Readonly<Record<number, number>>
): number {
  let best = 0;
  for (const typeId of implantTypeIds) {
    const pct = table[typeId];
    if (pct !== undefined && pct > best) best = pct;
  }
  return best;
}

export function characterModifiers(snapshot: CharacterSnapshot): CharacterModifiers {
  return {
    skills: snapshot.skills,
    manufacturingTimeImplantPct: bestImplantPct(
      snapshot.implantTypeIds,
      MANUFACTURING_TIME_IMPLANT_TYPE_IDS
    ),
    refiningImplantPct: bestImplantPct(snapshot.implantTypeIds, REFINING_IMPLANT_TYPE_IDS),
  };
}

/** No Character: nothing trained, nothing fitted. An explicit choice, never a silent default. */
export const NO_CHARACTER_MODIFIERS: CharacterModifiers = characterModifiers({
  skills: {},
  implantTypeIds: [],
});

const INDUSTRY_PCT_PER_LEVEL = 4;
const ADVANCED_INDUSTRY_PCT_PER_LEVEL = 3;
const REACTIONS_PCT_PER_LEVEL = 4;

function skillLevel(skills: Readonly<SkillLevels>, typeID: number): number {
  const level = skills[typeID] ?? 0;
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`skill ${typeID} level must be an integer 0..5, got ${level}`);
  }
  return level;
}

/**
 * The Character's share of a job's time multiplier: skills plus implant,
 * scoped to `activity`. Facility, rig and TE terms are `timeModifier`'s.
 * Throws RangeError on a skill level outside 0..5.
 */
export function jobTimeMultiplier(
  modifiers: CharacterModifiers,
  activity: IndustryActivity,
  blueprintSkills?: readonly BlueprintSkillRequirement[]
): number {
  const { skills } = modifiers;
  if (activity === 'reaction') {
    // Reactions have their own skill line; Industry/Advanced Industry, the
    // science table and the BX-80x implant never touch a reaction job.
    return 1 - (REACTIONS_PCT_PER_LEVEL * skillLevel(skills, SKILL_IDS.reactions)) / 100;
  }
  const terms: (readonly [number, number])[] = [
    [SKILL_IDS.industry, INDUSTRY_PCT_PER_LEVEL],
    [SKILL_IDS.advancedIndustry, ADVANCED_INDUSTRY_PCT_PER_LEVEL],
    // Filtered to skills that carry the bonus: a blueprint's own list also
    // names Industry/Advanced Industry, already applied above.
    ...(blueprintSkills ?? [])
      .filter((req) => req.typeID in MANUFACTURING_TIME_SCIENCE_SKILL_PCT)
      .map((req) => [req.typeID, MANUFACTURING_TIME_SCIENCE_SKILL_PCT[req.typeID]] as const),
  ];
  let multiplier = 1;
  for (const [typeID, pctPerLevel] of terms) {
    multiplier *= 1 - (pctPerLevel * skillLevel(skills, typeID)) / 100;
  }
  return multiplier * (1 - modifiers.manufacturingTimeImplantPct / 100);
}

/**
 * The full `ReprocessingSkills` for one type. `specialisationSkillId` is the
 * SDE bake's attribute-790 join; its absence IS the scrap classifier (every
 * ore, ice and moon-ore type carries it, nothing else does), so scrap falls
 * back to Scrapmetal Processing (issue #1058).
 */
function reprocessingSkillsFor(
  modifiers: CharacterModifiers,
  specialisationSkillId: number | undefined,
  stationRate: number
): ReprocessingSkills {
  const { skills } = modifiers;
  return {
    reprocessingLevel: skills[SKILL_IDS.reprocessing] ?? 0,
    reprocessingEfficiencyLevel: skills[SKILL_IDS.reprocessingEfficiency] ?? 0,
    specialisationLevel: skills[specialisationSkillId ?? SKILL_IDS.scrapmetalProcessing] ?? 0,
    stationRate,
    isScrap: specialisationSkillId === undefined,
    implantBonusPct: modifiers.refiningImplantPct,
  };
}

/** Reprocessing efficiency for one type, every applicable bonus in. */
export function refiningEfficiency(
  modifiers: CharacterModifiers,
  specialisationSkillId: number | undefined,
  stationRate = BASE_STATION_REPROCESSING_RATE
): number {
  return reprocessingEfficiency(
    reprocessingSkillsFor(modifiers, specialisationSkillId, stationRate)
  );
}

/**
 * General ore/ice skills plus implant, no specialisation — the one number a
 * mixed-type summary can honestly state (issue #1058).
 */
export function baselineRefiningEfficiency(
  modifiers: CharacterModifiers,
  stationRate = BASE_STATION_REPROCESSING_RATE
): number {
  return reprocessingEfficiency({
    ...reprocessingSkillsFor(modifiers, undefined, stationRate),
    specialisationLevel: 0,
    isScrap: false,
  });
}

/**
 * Whether a refining implant touches this type at all: ore and ice (which
 * carry a specialisation skill) yes, scrap never — the RX-80x line's own
 * description covers ore and ice only.
 */
export function refiningImplantApplies(specialisationSkillId: number | undefined): boolean {
  return specialisationSkillId !== undefined;
}

/**
 * The refining implant bonus that actually applied to this type: 0 on
 * scrap, so a hint names the implant only when it moved the number (f4b5a3f5).
 */
export function appliedRefiningImplantPct(
  modifiers: CharacterModifiers,
  specialisationSkillId: number | undefined
): number {
  return refiningImplantApplies(specialisationSkillId) ? modifiers.refiningImplantPct : 0;
}
