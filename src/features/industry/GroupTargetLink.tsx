import { useTranslation } from 'react-i18next';
import { Tooltip, textActionClassName } from '@/components/ui';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildGroupSnapshot } from './buildGroups';
import { planMatchesSnapshot } from './retargetPatch';
import { getTradeHub } from '@/market/hubs';

interface GroupTargetLinkProps {
  plan: Parameters<typeof planMatchesSnapshot>[0];
  snapshot: BuildGroupSnapshot | null;
  onApply: () => void;
}

export function GroupTargetLink({ plan, snapshot, onApply }: GroupTargetLinkProps) {
  const { t } = useTranslation();
  if (snapshot === null || planMatchesSnapshot(plan, snapshot)) return null;

  const target = [
    getTradeHub(snapshot.hubId)?.name ?? snapshot.hubId,
    FACILITY_PRESETS[snapshot.facility].name,
    t(`industry.${snapshot.security}`),
    ...(snapshot.buildSystemName ? [snapshot.buildSystemName] : []),
    ...(snapshot.buildLocationName ? [snapshot.buildLocationName] : []),
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
