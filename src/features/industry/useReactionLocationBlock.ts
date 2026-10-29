import type { BuildPlanRecord } from '@/db';
import type { IndustryActivity } from '@/engine/industry/types';
import { planReactionLocation } from './planReactionLocation';
import { useNearestLowsecSystem } from './useNearestLowsecSystem';
import { clearedBuildLocation, clearedReactionBuildLocation, type PlanPatch } from './planPatch';

/**
 * Reactions cannot run in highsec (issue #2908). The warning follows the
 * place reactions are planned: the Reaction Location when Include Reactions
 * is on, or the plan's own Build Location for a reaction-activity plan. An
 * unchosen location is "not set", never highsec — its stored band is only a
 * pricing default.
 *
 * `reactionLocationBlock` is what the hero shows for it, undefined when
 * nothing is blocked; `openSetup` opens the Setup form it points the pilot at.
 */
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
    // The picker mounts with the opened Setup panel, so focus on the next frame.
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
