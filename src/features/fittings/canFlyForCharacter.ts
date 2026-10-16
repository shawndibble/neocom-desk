import type { Fitting } from '@/engine/fittings/types';
import { baselineAttributes } from '@/engine/attributeBaseline';
import { characterFlyGap, type CharacterFlyGap } from '@/engine/fittings/characterFlyGap';
import { computeSkillGaps, fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterAttributes } from '@/features/skills/data';
import { DEFAULT_ATTRIBUTES } from '@/features/skills/planner/planSchedule';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { loadSkillCatalog, toAttributeBaseline } from '@/features/skills/skillMap';
import { loadImplantBonuses } from '@/features/skills/typeDetail';
import { loadRequirementsForTypes } from './skillRequirements';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { fittingCanFly } from './useCompareCanFly';

const cache = new WeakMap<Fitting, Map<number, boolean>>();

/**
 * Whether the Character can fly the Fitting, from their own trained skills;
 * `null` when its skill requirements couldn't be determined (not cached, so a
 * later call retries).
 */
export async function canFlyForCharacter(
  fitting: Fitting,
  characterId: number
): Promise<boolean | null> {
  const perFitting = cache.get(fitting) ?? new Map<number, boolean>();
  cache.set(fitting, perFitting);
  const cached = perFitting.get(characterId);
  if (cached !== undefined) return cached;
  const profile = await loadActivePilotProfile(characterId);
  const flies = await fittingCanFly(fitting, profile.skillLevels);
  if (flies !== null) perFitting.set(characterId, flies);
  return flies;
}

/** A Character's gap to a Fitting, or `null` when their skills (or the Fitting's requirements) couldn't be read. */
export type FittingGapResult = (CharacterFlyGap & { names: ReadonlyMap<number, string> }) | null;

const gapCache = new WeakMap<Fitting, Map<number, FittingGapResult>>();

async function computeGap(fitting: Fitting, characterId: number): Promise<FittingGapResult> {
  const now = Date.now();
  const [corrected, requirements, catalog, attributes, implants] = await Promise.all([
    loadCorrectedSkills(characterId, now),
    loadRequirementsForTypes(fittingRequirementTypeIds(fitting)),
    loadSkillCatalog(),
    loadCharacterAttributes(characterId).catch(() => null),
    loadImplantBonuses(characterId).catch(() => null),
    useCloneStates.getState().hydrate(),
  ]);
  // No /skills read at all: an empty map would read as "missing everything", or as "0 skills".
  if (corrected.skillsResult == null) return null;
  const { missing } = computeSkillGaps(fitting, requirements.byType, corrected.effective);
  if (missing.length === 0 && requirements.unknownTypeIds.length > 0) return null;
  const baseline =
    attributes?.data && implants ? toAttributeBaseline(attributes.data, implants) : null;
  const scheduled =
    missing.length === 0
      ? []
      : scheduleEntries(missing, {
          skills: catalog.engineSkills,
          trainedSkills: corrected.trained,
          attributes: (baseline && baselineAttributes(baseline)) ?? DEFAULT_ATTRIBUTES,
          implants: implants ?? {},
          cloneState: cloneStateFor(useCloneStates.getState().value, characterId),
        });
  const gap = characterFlyGap(missing, scheduled);
  const names = new Map(
    gap.skills.map(({ skillTypeID }) => [
      skillTypeID,
      catalog.engineSkills.get(skillTypeID)?.name ?? `#${skillTypeID}`,
    ])
  );
  return { ...gap, names };
}

/**
 * The Character's own missing skills for the Fitting and the time to train
 * them — the same gap `useFittingSkillGaps` shows for the active Character,
 * scheduled like "What to train". Cached per Fitting + Character; an unreadable
 * answer (`null`) is not cached, so a later call retries.
 */
export async function fittingGapForCharacter(
  fitting: Fitting,
  characterId: number
): Promise<FittingGapResult> {
  const perFitting = gapCache.get(fitting) ?? new Map<number, FittingGapResult>();
  gapCache.set(fitting, perFitting);
  const cached = perFitting.get(characterId);
  if (cached) return cached;
  const gap = await computeGap(fitting, characterId);
  if (gap) perFitting.set(characterId, gap);
  return gap;
}

/** The cached gap, if this Fitting + Character was already worked out; never starts a load. */
export function cachedFittingGap(fitting: Fitting, characterId: number): FittingGapResult {
  return gapCache.get(fitting)?.get(characterId) ?? null;
}
