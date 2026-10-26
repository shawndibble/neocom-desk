import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, Panel, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { NewPlanSplitButton } from './NewPlanSplitButton';
import { PlanListPane } from './PlanListPane';
import { usePlanStats, type PlanStatsInputs } from './usePlanStats';
import type { RemapAvailability } from './remapAvailability';

interface SkillPlanCardProps {
  activeCharacterId: number;
  remapInfo: RemapAvailability | null;
  scheduleInputs?: PlanStatsInputs;
}

/**
 * The plan the pilot is working on, one tap from its editor, plus the way to
 * every other plan. "The plan" is the one edited last: a pilot with several
 * plans picks up where they left off, and a one-plan pilot sees that plan.
 *
 * All plan management (rename, duplicate, copy, delete, the certified and
 * community starts) stays in the `PlanListPane` the "All plans" popover opens;
 * the editor's own sidebar uses that same pane, so it is not rebuilt here.
 */
export function SkillPlanCard({
  activeCharacterId,
  remapInfo,
  scheduleInputs,
}: SkillPlanCardProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const isDesktop = useIsDesktop();
  const plans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  const current = useMemo(
    () =>
      plans?.reduce<(typeof plans)[number] | undefined>(
        (best, plan) => (!best || plan.updatedAt > best.updatedAt ? plan : best),
        undefined
      ),
    [plans]
  );
  // Only the current plan is shown here; the "All plans" pane costs the rest.
  const stats = usePlanStats(plans, scheduleInputs, activeCharacterId, current ? [current.id] : []);
  const currentStats = current ? stats?.get(current.id) : undefined;
  const meta = !currentStats
    ? null
    : currentStats.finish
      ? t('plans.planCardMeta', {
          duration: formatCountdown(currentStats.totalSeconds),
          date: formatLocalDate(currentStats.finish, timeZone),
        })
      : t('plans.listRowNothingToTrain');

  const allPlans = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          {t('plans.allPlansButton')}
          <Icon.Expanded size={Icon.ICON_SIZE.sm} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('plans.allPlansTitle')}
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
      >
        <PlanListPane
          activeCharacterId={activeCharacterId}
          remapInfo={remapInfo}
          scheduleInputs={scheduleInputs}
          height="sidebar"
          bare
        />
      </PopoverContent>
    </Popover>
  );

  if (!plans) return null;

  const actions = (
    <div className="flex items-center justify-between gap-2">
      {plans.length > 0 ? allPlans : <span />}
      <NewPlanSplitButton activeCharacterId={activeCharacterId} remapInfo={remapInfo} />
    </div>
  );

  if (isDesktop) {
    // Desktop: the plan on its own line, the way to the others on the line under it.
    return (
      <Panel title={t('plans.planCardTitle')}>
        {current ? (
          <Link
            to={`/skills/plans/${current.id}`}
            className="block rounded-xs border border-accent-dim bg-panel-2 px-3 py-2 hover:border-accent"
          >
            <span className="block truncate text-sm text-accent">{current.name}</span>
            {meta && <span className="block text-xs text-text-dim">{meta}</span>}
          </Link>
        ) : (
          <p className="text-sm text-text-dim">{t('plans.planCardEmpty')}</p>
        )}
        <div className="mt-2">{actions}</div>
      </Panel>
    );
  }
  // Phone: one row that opens the plan, the way to the others under it.
  return (
    <div className="space-y-2">
      {current ? (
        <Link
          to={`/skills/plans/${current.id}`}
          className="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-xs border border-accent-dim bg-panel px-3"
        >
          <span className="truncate text-sm text-accent">{current.name}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-text-dim">
            {currentStats?.finish && formatLocalDate(currentStats.finish, timeZone)}
            <Icon.Descend size={Icon.ICON_SIZE.sm} />
          </span>
        </Link>
      ) : (
        <p className="text-sm text-text-dim">{t('plans.planCardEmpty')}</p>
      )}
      {actions}
    </div>
  );
}
