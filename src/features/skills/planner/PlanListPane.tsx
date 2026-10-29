import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { Panel, Spinner, ToastStack, useDeferredCommits } from '@/components/ui';
import { markPlanDeleted, scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { newPlan } from './newPlan';
import { NewPlanSplitButton } from './NewPlanSplitButton';
import { PlanList } from './PlanList';
import { usePlanStats, type PlanStatsInputs } from './usePlanStats';
import { readsLoadedImplants } from './whatIfImplants';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
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
  /** The plan open in the editor, highlighted in the list. */
  activePlanId?: string;
  /**
   * When given, each row shows its plan's total time and finish, costed by
   * `schedulePlan` — the call the editor and Calendar make, so the three agree.
   */
  scheduleInputs?: PlanStatsInputs;
  /**
   * Just the rows, with no "Plans" panel or New plan button around them: for a
   * host that is itself the surface and already offers New plan (the plans popover).
   */
  bare?: boolean;
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
  activePlanId,
  scheduleInputs,
  bare = false,
}: PlanListPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // "New plan" navigates with this flag so the new plan's row opens in rename mode.
  const location = useLocation();
  const focusName = (location.state as { focusName?: boolean } | null)?.focusName === true;
  const autoRenamePlanId = focusName ? (activePlanId ?? null) : null;
  // Spent once the row is in rename mode, so a reload or Back doesn't reopen it.
  const spendFocusName = useCallback(
    () => navigate(location.pathname, { replace: true, state: null }),
    [navigate, location.pathname]
  );
  const isDesktop = useIsDesktop();

  const allPlans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  // A deleted plan stays hidden until its Undo toast ends and the write lands,
  // so a sync pull in that window can't bring it back.
  const pendingDeletes = useDeferredCommits();
  const { hiddenIds } = pendingDeletes;
  const plans = useMemo(
    () => (hiddenIds.size === 0 ? allPlans : allPlans?.filter((p) => !hiddenIds.has(p.id))),
    [allPlans, hiddenIds]
  );

  const stats = usePlanStats(plans, scheduleInputs, activeCharacterId);

  // The sidebar sits beside the Plan Editor, which carries its own note.
  const showImplantsNote =
    height !== 'sidebar' &&
    stats !== undefined &&
    (plans ?? []).some((plan) => readsLoadedImplants(plan.whatIfImplants));

  const [scrollerRef, scrollerMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

  function syncAfterEdit() {
    if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['plans'] });
  }

  const headingRef = useRef<HTMLHeadingElement>(null);

  const characters = useCharacters();
  const otherCharacters = characters.filter((c) => c.characterId !== activeCharacterId);

  function copyOf(source: SkillPlanRecord, characterId: number): SkillPlanRecord {
    return {
      ...newPlan(characterId, t('plans.copySuffix', { name: source.name })),
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
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
    const copy = copyOf(source, activeCharacterId);
    await db.skillPlans.add(copy);
    syncAfterEdit();
    navigate(`/skills/plans/${copy.id}`);
  }

  // Stays on the current character: the copy belongs to the chosen one, so
  // there is no editor route to open for it from here.
  async function handleCopyToCharacter(id: string, characterId: number) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
    await db.skillPlans.add(copyOf(source, characterId));
    if (isSyncConfigured()) scheduleSync(characterId, { collections: ['plans'] });
  }

  // Delete hides the row and raises an Undo toast; the write lands when the
  // toast ends (or the page or pane goes away), never lost.
  function handleDelete(id: string) {
    const characterId = activeCharacterId;
    pendingDeletes.defer({
      id,
      message: t('plans.deleted', { name: allPlans?.find((p) => p.id === id)?.name ?? '' }),
      // Always goes through markPlanDeleted (records a tombstone): a plain
      // Dexie delete would let the remote copy resurrect it on next sync.
      commit: () => markPlanDeleted(characterId, id),
    });
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
    syncAfterEdit();
  }

  const content = (
    <>
      {showImplantsNote && (
        <div className="border-b border-line px-3 empty:hidden">
          <ImplantsAssumedNote
            characterId={activeCharacterId}
            hint={t('plans.assumesNoImplantsHint')}
          />
        </div>
      )}
      <div
        ref={scrollerRef}
        // `40vh` rather than a rem constant: it has to leave room for the
        // tools below it on a short viewport too, and that is a proportion of
        // the window, not a fixed number of rows.
        className={height === 'sidebar' ? 'max-h-[40vh] overflow-y-auto' : 'overflow-y-auto'}
        style={
          // Desktop-only: below `lg` this cap ignores the fixed mobile
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
            headingRef={headingRef}
            plans={plans}
            stats={stats}
            activePlanId={activePlanId}
            autoRenamePlanId={autoRenamePlanId}
            onAutoRenameStarted={spendFocusName}
            planHref={(id) => `/skills/plans/${id}`}
            onDuplicate={(id) => void handleDuplicate(id)}
            otherCharacters={otherCharacters}
            onCopyToCharacter={(id, characterId) => void handleCopyToCharacter(id, characterId)}
            onDelete={handleDelete}
            onRename={(id, name) => void handleRename(id, name)}
          />
        )}
      </div>
      <ToastStack
        items={pendingDeletes.items}
        undoLabel={t('plans.undo')}
        onUndo={pendingDeletes.undo}
        onClose={pendingDeletes.commit}
      />
    </>
  );

  if (bare) return <div className={className}>{content}</div>;

  return (
    <Panel
      className={className}
      title={t('plans.title')}
      headingRef={headingRef}
      actions={<NewPlanSplitButton activeCharacterId={activeCharacterId} remapInfo={remapInfo} />}
    >
      {content}
    </Panel>
  );
}
