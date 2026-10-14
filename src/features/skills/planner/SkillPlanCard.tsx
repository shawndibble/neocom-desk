import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Modal,
  Panel,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { newPlan } from './newPlan';
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
 * community starts) stays in the `PlanListPane` the "All plans…" dialog opens;
 * the editor's own sidebar uses that same pane, so it is not rebuilt here.
 */
export function SkillPlanCard({
  activeCharacterId,
  remapInfo,
  scheduleInputs,
}: SkillPlanCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const plans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  const stats = usePlanStats(plans, scheduleInputs, activeCharacterId);
  // `?browse=community` (the Community page's link) opens the list, where its dialog lives.
  const browseLink = new URLSearchParams(location.search).get('browse') === 'community';
  const [listOpen, setListOpen] = useState(browseLink);
  // The list opened only to host the community browse: once the browse closes
  // (its pane drops the param) the pilot goes back to the page, not to a list
  // they never asked for.
  const openedByBrowse = useRef(browseLink);
  useEffect(() => {
    if (openedByBrowse.current && !browseLink) {
      openedByBrowse.current = false;
      setListOpen(false);
    }
  }, [browseLink]);
  const menu = useOpenAfterMenu();

  const current = plans?.reduce<(typeof plans)[number] | undefined>(
    (best, plan) => (!best || plan.updatedAt > best.updatedAt ? plan : best),
    undefined
  );
  const currentStats = current ? stats?.get(current.id) : undefined;
  const meta = !currentStats
    ? null
    : currentStats.finish
      ? t('plans.planCardMeta', {
          duration: formatCountdown(currentStats.totalSeconds),
          date: formatLocalDate(currentStats.finish),
        })
      : t('plans.listRowNothingToTrain');

  async function handleCreate() {
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
    navigate(`/skills/plans/${plan.id}`, { state: { focusName: true } });
  }

  const dialog = (
    <Modal
      open={listOpen}
      onClose={() => setListOpen(false)}
      title={t('plans.allPlansTitle')}
      placement={isDesktop ? 'center' : 'sheet-full'}
    >
      <PlanListPane
        activeCharacterId={activeCharacterId}
        remapInfo={remapInfo}
        scheduleInputs={scheduleInputs}
        height="sidebar"
      />
    </Modal>
  );

  if (!plans) return null;

  return (
    <>
      {isDesktop ? (
        <>
          {/* Desktop: the plan on its own line, the way to the others on the line under it. */}
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
            <div className="mt-2 flex gap-2">
              {plans.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setListOpen(true)}
                >
                  {t('plans.allPlansButton')}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => void handleCreate()}
              >
                {t('plans.create')}
              </Button>
            </div>
          </Panel>
        </>
      ) : (
        <>
          {/* Phone: one row that opens the plan; the rest sits behind a menu. */}
          <div className="flex items-center gap-2">
            {current ? (
              <Link
                to={`/skills/plans/${current.id}`}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xs border border-accent-dim bg-panel px-3"
              >
                <span className="truncate text-sm text-accent">{current.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-text-dim">
                  {currentStats?.finish && formatLocalDate(currentStats.finish)}
                  <Icon.Descend size={Icon.ICON_SIZE.sm} />
                </span>
              </Link>
            ) : (
              <p className="flex-1 text-sm text-text-dim">{t('plans.planCardEmpty')}</p>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<Icon.More />} label={t('plans.planCardMenu')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onCloseAutoFocus={menu.onCloseAutoFocus}>
                <DropdownMenuItem onSelect={() => menu.run(() => setListOpen(true))}>
                  {t('plans.allPlansButton')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleCreate()}>
                  {t('plans.create')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
      {dialog}
    </>
  );
}
