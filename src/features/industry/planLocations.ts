import type { BuildPlanRecord } from '@/db';
import type { Translate } from '@/lib/translate';
import { buildLocationLabel } from './buildLocationLabel';

export function planLocations(plan: BuildPlanRecord, hubSystemName: string, t: Translate) {
  const buildSystem =
    plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
      ? { id: plan.buildSystemId, name: plan.buildSystemName }
      : null;
  const buildLocationName =
    plan.buildLocationId === undefined
      ? null
      : buildLocationLabel(
          plan.buildLocationName ?? null,
          plan.facility,
          buildSystem?.name ?? hubSystemName,
          t
        );

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
