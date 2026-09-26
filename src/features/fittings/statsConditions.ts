/**
 * The conditions every number on the Fittings pages is worked out under,
 * beyond the pilot and the Damage Profile: the Abyssal weather
 * (`abyssalWeatherSelection.ts`), the "Overheat all" switch, any skill
 * overrides ("what if my skills were…" — `engine/fittings/skillOverrides.ts`)
 * and what other saved Fittings project onto it (bursts, remote reps, webs…). One set for
 * the session, read by the editor, its Variations, the applied-DPS overlay
 * and Fitting Compare alike, so no two numbers on screen are in different
 * conditions. Neither is saved or put in a Share Link: each is a question
 * asked of a fit, not part of it. The projected sources alone belong to a
 * Character (its saved Fittings), so they go when the active Character does.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import {
  NO_SKILL_OVERRIDES,
  applySkillOverrides,
  hasSkillOverrides,
  type SkillOverrides,
} from '@/engine/fittings/skillOverrides';
import { combineProjections, projectsNothing } from '@/engine/fittings/projection';
import type { PilotProfile, ProjectedEffects } from '@/engine/fittings/types';
import { loadSkills } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import type { StatsOptions } from './dogmaFittingEngine';

interface OverheatAllSelection {
  overheatAll: boolean;
  setOverheatAll: (overheatAll: boolean) => void;
}

export const useOverheatAll = create<OverheatAllSelection>((set) => ({
  overheatAll: false,
  setOverheatAll: (overheatAll) => set({ overheatAll }),
}));

interface SkillOverridesSelection {
  skills: SkillOverrides;
  setSkills: (skills: SkillOverrides) => void;
}

/**
 * The pilot's skill overrides for the session. The fit checks and the
 * Missing Skills chip stay on the Character's real skills: these change
 * only what the numbers are worked out under.
 */
export const useSkillOverrides = create<SkillOverridesSelection>((set) => ({
  skills: NO_SKILL_OVERRIDES,
  setSkills: (skills) => set({ skills }),
}));

/** One saved Fitting projecting onto the open one, and how many ships of it. */
export interface ProjectedSource {
  /** The My Fittings record it came from. */
  id: string;
  name: string;
  count: number;
  /** What one ship of it projects, worked out when it was added. */
  projection: ProjectedEffects;
}

interface ProjectedSourcesSelection {
  sources: ProjectedSource[];
  setSources: (sources: ProjectedSource[]) => void;
}

export const useProjectedSources = create<ProjectedSourcesSelection>((set) => ({
  sources: [],
  setSources: (sources) => set({ sources }),
}));

// The sources are the active Character's own saved Fittings: another
// Character's list doesn't have them, so switching lets go of them all.
// Opening a different Fitting keeps them, as it keeps the weather.
useActiveCharacter.subscribe((state, previous) => {
  if (state.activeCharacterId === previous.activeCharacterId) return;
  if (useProjectedSources.getState().sources.length > 0) {
    useProjectedSources.setState({ sources: [] });
  }
});

export interface StatsConditions {
  /** An Abyssal weather beacon's type id, or null for normal space. */
  weatherTypeId: number | null;
  overheatAll: boolean;
  /** Absent: the pilot's own skills. */
  skills?: SkillOverrides;
  /** Absent: nothing projected onto the Fitting. */
  projected?: ProjectedEffects;
}

/** The session's conditions, one stable object while none of them changes. */
export function useStatsConditions(): StatsConditions {
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  const skills = useSkillOverrides((state) => state.skills);
  const sources = useProjectedSources((state) => state.sources);
  return useMemo(() => {
    const projected = combineProjections(sources);
    return {
      weatherTypeId,
      overheatAll,
      ...(hasSkillOverrides(skills) ? { skills } : {}),
      ...(projectsNothing(projected) ? {} : { projected }),
    };
  }, [weatherTypeId, overheatAll, skills, sources]);
}

/**
 * `profile` under the conditions' skill overrides; itself when there are
 * none. Synchronous unless All V needs the skill list loaded, so a
 * calculation with no overrides starts in the same tick it always did.
 */
export function pilotUnder(
  profile: PilotProfile,
  conditions: StatsConditions
): PilotProfile | Promise<PilotProfile> {
  const skills = conditions.skills;
  if (!skills || !hasSkillOverrides(skills)) return profile;
  if (skills.base !== 'allV') return applySkillOverrides(profile, skills, []);
  return loadSkills().then((all) =>
    applySkillOverrides(
      profile,
      skills,
      all.map((skill) => skill.typeID)
    )
  );
}

/** The engine seam's options for `conditions`. */
export function statsOptions(conditions: StatsConditions): StatsOptions {
  return {
    ...(conditions.weatherTypeId === null ? {} : { weatherTypeId: conditions.weatherTypeId }),
    ...(conditions.overheatAll ? { overheatAll: true } : {}),
    ...(conditions.projected ? { incoming: conditions.projected } : {}),
  };
}
