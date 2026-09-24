import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { Panel, Spinner } from '@/components/ui';
import { markPlanDeleted, scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { newPlan } from './newPlan';
import { PlanList, type PlanRowStats } from './PlanList';
import { schedulePlan, type PlanScheduleInputs } from './planSchedule';
import { cloneStateFor, useCloneStates } from '../cloneState';
import type { RemapAvailability } from './remapAvailability';

interface PlanListPaneProps {
  activeCharacterId: number;
  remapInfo: RemapAvailability | null;
  /**
   * How tall the list may grow.
   *
   * `viewport` (default) lets it fill whatever room is left below it, which
   * is right when it is the only thing in its column (the plan-list route).
   * `sidebar` caps it at a share of the viewport instead, because on the
   * editor route the plan tools sit underneath it in the same column — an
   * unbounded list there takes the entire sidebar the moment a character has
   * more than a handful of plans, and pushes the tools off screen.
   */
  height?: 'viewport' | 'sidebar';
  className?: string;
  /**
   * When given, each row shows its plan's total time and finish, costed by
   * `schedulePlan` — the call the editor and Calendar make, so the three agree.
   * Left out on the editor route, whose sidebar stays name-only.
   */
  scheduleInputs?: Omit<PlanScheduleInputs, 'cloneState'> & { trainedSkillsKnown: boolean };
}

/**
 * Plan list pane shared by the list route and the editor route (#158): both
 * render it visible on wide screens, so opening a different plan is a click
 * in the still-visible list rather than a trip back to `/skills/plans`
 * first. It only stays *mounted* across a plan switch while already on the
 * editor route (`:planId` changing on the same route element) — crossing
 * between the list route and the editor route still unmounts/remounts it
 * like any other route change (round 17's route split is unchanged).
 */
export function PlanListPane({
  activeCharacterId,
  remapInfo,
  height = 'viewport',
  className,
  scheduleInputs,
}: PlanListPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const plans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );

  const showStats = scheduleInputs !== undefined;
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useCloneStates((state) => state.hydrated);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    if (showStats) void hydrateCloneStates();
  }, [showStats, hydrateCloneStates]);
  // One instant per mount, like the editor, so the figures match its summary.
  const [loadedAtMs] = useState(() => Date.now());
  const stats = useMemo(() => {
    // Held back until ESI has answered and Clone State is read: costing
    // against the empty stand-ins would flash catalog-only, Omega-default figures.
    if (!plans || !scheduleInputs?.trainedSkillsKnown || !cloneStatesHydrated) return undefined;
    const inputs: PlanScheduleInputs = {
      catalog: scheduleInputs.catalog,
      trained: scheduleInputs.trained,
      queueEntries: scheduleInputs.queueEntries,
      attributes: scheduleInputs.attributes,
      attributeBaseline: scheduleInputs.attributeBaseline,
      implants: scheduleInputs.implants,
      cloneState: cloneStateFor(cloneStates, activeCharacterId),
    };
    const out = new Map<string, PlanRowStats>();
    for (const plan of plans) {
      const schedule = schedulePlan(plan, inputs, loadedAtMs);
      if (schedule.error === null || schedule.error === undefined) {
        out.set(plan.id, { totalSeconds: schedule.totalSeconds, finish: schedule.finish });
      }
    }
    return out;
  }, [plans, scheduleInputs, cloneStates, cloneStatesHydrated, activeCharacterId, loadedAtMs]);

  const [scrollerRef, scrollerMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

  function syncAfterEdit() {
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  async function handleCreate() {
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    syncAfterEdit();
    navigate(`/skills/plans/${plan.id}`);
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
    const copy: SkillPlanRecord = {
      ...newPlan(activeCharacterId, t('plans.copySuffix', { name: source.name })),
      entries: source.entries,
      remapCount: source.remapCount,
      ...(source.markers ? { markers: source.markers } : {}),
      // The lenses the source is costed under travel with the copy: a
      // duplicate that dropped them would quote different training times
      // than the plan it was copied from.
      ...(source.whatIfImplants ? { whatIfImplants: source.whatIfImplants } : {}),
      ...(source.boosters ? { boosters: source.boosters } : {}),
      ...(source.boosters === undefined && source.booster ? { booster: source.booster } : {}),
      ...(source.milestones ? { milestones: source.milestones } : {}),
    };
    await db.skillPlans.add(copy);
    syncAfterEdit();
    navigate(`/skills/plans/${copy.id}`);
  }

  async function handleDelete(id: string) {
    // Always goes through markPlanDeleted (records a tombstone): a plain
    // Dexie delete would let the remote copy resurrect it on next sync.
    await markPlanDeleted(activeCharacterId, id);
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
    syncAfterEdit();
  }

  return (
    <Panel className={className}>
      <div
        ref={scrollerRef}
        // `40vh` rather than a rem constant: it has to leave room for the
        // tools below it on a short viewport too, and that is a proportion of
        // the window, not a fixed number of rows.
        className={height === 'sidebar' ? 'max-h-[40vh] overflow-y-auto' : 'overflow-y-auto'}
        style={
          // Desktop-only, like the editor route's own list pane
          // (`PlanEditor.tsx`): below `lg` this cap ignores the fixed mobile
          // tab bar (it measures `window.innerHeight`, which the bar overlays
          // rather than shrinks), sizing the scroller past the visible area
          // and hiding its bottom rows behind the bar (#1096). `<main>`
          // already reserves that same space at the page level, so leaving
          // mobile uncapped just lets the page scroll instead.
          height === 'viewport' && isDesktop && scrollerMaxHeight !== null
            ? { maxHeight: scrollerMaxHeight }
            : undefined
        }
      >
        {!plans ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : (
          <PlanList
            plans={plans}
            stats={stats}
            onOpen={(id) => navigate(`/skills/plans/${id}`)}
            onCreate={() => void handleCreate()}
            onDuplicate={(id) => void handleDuplicate(id)}
            onDelete={(id) => void handleDelete(id)}
            onRename={(id, name) => void handleRename(id, name)}
          />
        )}
      </div>
    </Panel>
  );
}
