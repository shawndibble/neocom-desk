import {
  BASE_STATION_REPROCESSING_RATE,
  reprocessingEfficiency,
  type ReprocessingSkills,
} from './reprocessing';
import type { BlueprintSkillRequirement, IndustryActivity, SkillLevels } from './types';
import { MANUFACTURING_TIME_SCIENCE_SKILL_PCT, SKILL_IDS } from './types';

export interface CharacterSnapshot {
  skills: SkillLevels;
  implantTypeIds: readonly number[];
}

export interface CharacterModifiers {
  readonly skills: Readonly<SkillLevels>;
  readonly manufacturingTimeImplantPct: number;
  readonly refiningImplantPct: number;
}

export const MANUFACTURING_TIME_IMPLANT_TYPE_IDS: Readonly<Record<number, number>> = {
  27170: 1,
  27167: 2,
  27171: 4,
};

export const REFINING_IMPLANT_TYPE_IDS: Readonly<Record<number, number>> = {
  27175: 1,
  27169: 2,
  27174: 4,
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

export function jobTimeMultiplier(
  modifiers: CharacterModifiers,
  activity: IndustryActivity,
  blueprintSkills?: readonly BlueprintSkillRequirement[]
): number {
  const { skills } = modifiers;
  if (activity === 'reaction') {
    return 1 - (REACTIONS_PCT_PER_LEVEL * skillLevel(skills, SKILL_IDS.reactions)) / 100;
  }
  const terms: (readonly [number, number])[] = [
    [SKILL_IDS.industry, INDUSTRY_PCT_PER_LEVEL],
    [SKILL_IDS.advancedIndustry, ADVANCED_INDUSTRY_PCT_PER_LEVEL],
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

export function refiningEfficiency(
  modifiers: CharacterModifiers,
  specialisationSkillId: number | undefined,
  stationRate = BASE_STATION_REPROCESSING_RATE
): number {
  return reprocessingEfficiency(
    reprocessingSkillsFor(modifiers, specialisationSkillId, stationRate)
  );
}

export function referenceSkillsMultiplier(
  modifiers: CharacterModifiers,
  specialisationSkillIds: readonly number[]
): number {
  const { skills } = modifiers;
  const trained = specialisationSkillIds.map((id) => skills[id] ?? 0).filter((level) => level > 0);
  const average = trained.length === 0 ? 0 : trained.reduce((a, b) => a + b, 0) / trained.length;
  return (
    (1 + 0.03 * (skills[SKILL_IDS.reprocessing] ?? 0)) *
    (1 + 0.02 * (skills[SKILL_IDS.reprocessingEfficiency] ?? 0)) *
    (1 + 0.02 * average) *
    (1 + modifiers.refiningImplantPct / 100)
  );
}

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

export function refiningImplantApplies(specialisationSkillId: number | undefined): boolean {
  return specialisationSkillId !== undefined;
}

export function appliedRefiningImplantPct(
  modifiers: CharacterModifiers,
  specialisationSkillId: number | undefined
): number {
  return refiningImplantApplies(specialisationSkillId) ? modifiers.refiningImplantPct : 0;
}
