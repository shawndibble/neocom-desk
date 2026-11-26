import type { BuildPlanRecord } from '@/db';
import type { IndustryActivity } from '@/engine/industry/types';
import { planReactionLocation } from './planReactionLocation';
import { useNearestLowsecSystem } from './useNearestLowsecSystem';
import { clearedBuildLocation, clearedReactionBuildLocation, type PlanPatch } from './planPatch';

export function useReactionLocationBlock(
  plan: BuildPlanRecord,
  activity: IndustryActivity,
  update: (patch: PlanPatch) => void,
  openSetup: () => void
) {
  const reactionPlace = planReactionLocation(plan, activity);
  const reactionsInHighsec = reactionPlace?.state === 'highsec';
  const nearestLowsec = useNearestLowsecSystem(
    plan.characterId,
    reactionPlace?.system?.id ?? null,
    reactionsInHighsec
  );
  const moveReactionsTo = (system: { id: number; name: string }) =>
    update(
      activity === 'reaction'
        ? {
            buildSystemId: system.id,
            buildSystemName: system.name,
            ...clearedBuildLocation,
            security: 'lowsec',
          }
        : {
            reactionBuildSystemId: system.id,
            reactionBuildSystemName: system.name,
            ...clearedReactionBuildLocation,
            reactionSecurity: 'lowsec',
          }
    );
  const chooseReactionLocation = () => {
    openSetup();
    const inputId =
      activity === 'reaction' ? 'build-location-input' : 'build-plan-reaction-location-input';
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  };
  const reactionLocationBlock =
    reactionPlace && reactionsInHighsec && reactionPlace.system
      ? {
          facilityName: reactionPlace.facilityName,
          systemName: reactionPlace.system.name,
          fix: nearestLowsec
            ? { systemName: nearestLowsec.name, onApply: () => moveReactionsTo(nearestLowsec) }
            : null,
          onChoose: chooseReactionLocation,
        }
      : undefined;
  return { reactionsInHighsec, reactionLocationBlock };
}
