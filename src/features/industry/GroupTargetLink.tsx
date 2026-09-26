import { useTranslation } from 'react-i18next';
import { Tooltip, textActionClassName } from '@/components/ui';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroupSnapshot } from './buildGroups';
import { planMatchesSnapshot } from './retargetPatch';
import { getTradeHub } from '@/market/hubs';

interface GroupTargetLinkProps {
  plan: Pick<
    BuildPlanRecord,
    'hubId' | 'facility' | 'security' | 'buildSystemId' | 'buildSystemName'
  >;
  /** The plan's group's last Retarget, or `null` for an ungrouped plan or one whose group has none yet. */
  snapshot: BuildGroupSnapshot | null;
  onApply: () => void;
}

/**
 * The group's last Retarget offered beside a plan's own hub/facility/
 * security/build-system controls (issue #632) — usable any time, not only
 * when the plan is created, so a plan unchecked at Retarget time (or one
 * whose pilot changed their mind) can still pick up the group's target
 * later. Mirrors `OwnedStockHint`: renders nothing once there is nothing
 * left to offer.
 */
export function GroupTargetLink({ plan, snapshot, onApply }: GroupTargetLinkProps) {
  const { t } = useTranslation();
  if (snapshot === null || planMatchesSnapshot(plan, snapshot)) return null;

  const target = [
    getTradeHub(snapshot.hubId)?.name ?? snapshot.hubId,
    FACILITY_PRESETS[snapshot.facility].name,
    t(`industry.${snapshot.security}`),
    ...(snapshot.buildSystemName ? [snapshot.buildSystemName] : []),
  ].join(', ');

  return (
    <Tooltip content={t('industry.quickFillFromGroupTooltip', { target })}>
      <button
        type="button"
        onClick={onApply}
        aria-label={t('industry.quickFillFromGroupAriaLabel', { target })}
        className={textActionClassName('gap-1')}
      >
        {t('industry.quickFillFromGroup')}
      </button>
    </Tooltip>
  );
}
