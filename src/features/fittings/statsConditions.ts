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

export const useSkillOverrides = create<SkillOverridesSelection>((set) => ({
  skills: NO_SKILL_OVERRIDES,
  setSkills: (skills) => set({ skills }),
}));

export interface ProjectedSource {
  id: string;
  name: string;
  count: number;
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

useActiveCharacter.subscribe((state, previous) => {
  if (state.activeCharacterId === previous.activeCharacterId) return;
  if (useProjectedSources.getState().sources.length > 0) {
    useProjectedSources.setState({ sources: [] });
  }
});

export interface StatsConditions {
  weatherTypeId: number | null;
  overheatAll: boolean;
  skills?: SkillOverrides;
  projected?: ProjectedEffects;
}

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

export function statsOptions(conditions: StatsConditions): StatsOptions {
  return {
    ...(conditions.weatherTypeId === null ? {} : { weatherTypeId: conditions.weatherTypeId }),
    ...(conditions.overheatAll ? { overheatAll: true } : {}),
    ...(conditions.projected ? { incoming: conditions.projected } : {}),
  };
}
