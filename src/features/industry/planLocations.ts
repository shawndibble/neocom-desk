import type { BuildPlanRecord } from '@/db';
import type { Translate } from '@/lib/translate';
import { buildLocationLabel } from './buildLocationLabel';

/**
 * The Build Location and Reaction Location pairs a plan names, as the setup
 * strip and the picker boxes show them.
 *
 * One source for both the index that is fetched and the name that labels it,
 * so the two can never disagree. A plan holding only half the pair (an id
 * with no name, or the reverse) builds at its hub — see `BuildPlanRecord`.
 * `hubSystemName` is the stand-in for a plan with no system of its own.
 */
export function planLocations(plan: BuildPlanRecord, hubSystemName: string, t: Translate) {
  const buildSystem =
    plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
      ? { id: plan.buildSystemId, name: plan.buildSystemName }
      : null;
  // What the search box says the plan is pointed at — through the same helper
  // the picker's result rows use, so the wording cannot change as a pick's
  // write lands. Null for a plan that was never pointed at a place.
  const buildLocationName =
    plan.buildLocationId === undefined
      ? null
      : buildLocationLabel(
          plan.buildLocationName ?? null,
          plan.facility,
          buildSystem?.name ?? hubSystemName,
          t
        );

  // The Reaction Location's own build system / label pair, mirroring
  // `buildSystem`/`buildLocationName` above one-for-one (issue #698).
  const reactionBuildSystem =
    plan.reactionBuildSystemId !== undefined && plan.reactionBuildSystemName !== undefined
      ? { id: plan.reactionBuildSystemId, name: plan.reactionBuildSystemName }
      : null;
  const reactionBuildLocationName =
    plan.reactionBuildLocationId === undefined
      ? null
      : buildLocationLabel(
          plan.reactionBuildLocationName ?? null,
          plan.reactionFacility ?? 'athanor',
          reactionBuildSystem?.name ?? t('industry.reactionLocationNotSet'),
          t
        );

  return { buildSystem, buildLocationName, reactionBuildSystem, reactionBuildLocationName };
}
