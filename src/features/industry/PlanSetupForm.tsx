import { useTranslation } from 'react-i18next';
import { Collapse } from '@/components/ui/Collapse';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { FacilityKind, IndustryActivity } from '@/engine/industry/types';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
import type { MarketSnapshot } from './marketData';
import { cx } from '@/lib/cx';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroupSnapshot } from './buildGroups';
import { GroupTargetLink } from './GroupTargetLink';
import { retargetPatch } from './retargetPatch';
import { BpcCoverageWarning } from './PlanVerdictHero';
import { PlanBuildLocationFields } from './PlanBuildLocationFields';
import { PlanReactionFields } from './PlanReactionFields';
import type { PlanPatch } from './planPatch';

interface PlanSetupFormProps {
  open: boolean;
  id: string;
  className: string;
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  activity: IndustryActivity;
  hub: TradeHub;
  facilityPreset: (typeof FACILITY_PRESETS)[FacilityKind];
  buildSystem: { id: number; name: string } | null;
  buildLocationName: string | null;
  costIndexMissing: boolean;
  snapshot: MarketSnapshot | null;
  includeReactions: boolean;
  reactionBuildSystem: { id: number; name: string } | null;
  reactionBuildLocationName: string | null;
  reactionsInHighsec: boolean;
  bpcCoverage: { coveredRuns: number; neededRuns: number } | null;
  groupSnapshot: BuildGroupSnapshot | null;
  update: (patch: PlanPatch) => void;
  movePlan: (patch: PlanPatch) => void;
  toggleIncludeReactions: (include: boolean) => void;
}

/**
 * The Setup form: slides open under the setup strip, attached to the card it
 * edits, rather than a second card that pushes the page down.
 */
export function PlanSetupForm({
  open,
  id,
  className,
  plan,
  catalog,
  activity,
  hub,
  facilityPreset,
  buildSystem,
  buildLocationName,
  costIndexMissing,
  snapshot,
  includeReactions,
  reactionBuildSystem,
  reactionBuildLocationName,
  reactionsInHighsec,
  bpcCoverage,
  groupSnapshot,
  update,
  movePlan,
  toggleIncludeReactions,
}: PlanSetupFormProps) {
  const { t } = useTranslation();
  return (
    <Collapse open={open} id={id} className={className}>
      <div className="space-y-4">
        {bpcCoverage && (
          <div>
            <h3 className={cx(eyebrowClassName, 'border-b border-line pb-1')}>
              {t('industry.groupBlueprint')}
            </h3>
            <div className="mt-2">
              <BpcCoverageWarning
                coverage={bpcCoverage}
                blueprintName={nameForType(catalog, plan.blueprintTypeID)}
                onSetRuns={(runs) => update({ runs })}
              />
            </div>
          </div>
        )}

        <div>
          <h3
            className={cx(
              eyebrowClassName,
              'flex items-center justify-between gap-2 border-b border-line pb-1'
            )}
          >
            {t('industry.groupLocationMarket')}
            <GroupTargetLink
              plan={plan}
              snapshot={groupSnapshot}
              onApply={() => groupSnapshot && update(retargetPatch(groupSnapshot))}
            />
          </h3>
          <div className="mt-2 flex flex-col gap-3">
            <PlanBuildLocationFields
              plan={plan}
              activity={activity}
              hub={hub}
              facilityPreset={facilityPreset}
              buildSystem={buildSystem}
              buildLocationName={buildLocationName}
              costIndexMissing={costIndexMissing}
              snapshot={snapshot}
              update={update}
              movePlan={movePlan}
            />

            {/* A reaction-activity plan never shows this: it reuses its own
                  top-level facility/rig/security for a nested reaction
                  sub-build instead (issue #698). */}
            {activity === 'manufacturing' && (
              <PlanReactionFields
                plan={plan}
                includeReactions={includeReactions}
                reactionBuildSystem={reactionBuildSystem}
                reactionBuildLocationName={reactionBuildLocationName}
                reactionsInHighsec={reactionsInHighsec}
                update={update}
                toggleIncludeReactions={toggleIncludeReactions}
              />
            )}
          </div>
        </div>
      </div>
    </Collapse>
  );
}
