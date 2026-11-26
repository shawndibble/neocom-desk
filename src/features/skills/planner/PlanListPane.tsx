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
  height?: 'viewport' | 'sidebar';
  className?: string;
  activePlanId?: string;
  scheduleInputs?: PlanStatsInputs;
  bare?: boolean;
}

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
  const location = useLocation();
  const focusName = (location.state as { focusName?: boolean } | null)?.focusName === true;
  const autoRenamePlanId = focusName ? (activePlanId ?? null) : null;
  const spendFocusName = useCallback(
    () => navigate(location.pathname, { replace: true, state: null }),
    [navigate, location.pathname]
  );
  const isDesktop = useIsDesktop();

  const allPlans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  const pendingDeletes = useDeferredCommits();
  const { hiddenIds } = pendingDeletes;
  const plans = useMemo(
    () => (hiddenIds.size === 0 ? allPlans : allPlans?.filter((p) => !hiddenIds.has(p.id))),
    [allPlans, hiddenIds]
  );

  const stats = usePlanStats(plans, scheduleInputs, activeCharacterId);

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

  async function handleCopyToCharacter(id: string, characterId: number) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
    await db.skillPlans.add(copyOf(source, characterId));
    if (isSyncConfigured()) scheduleSync(characterId, { collections: ['plans'] });
  }

  function handleDelete(id: string) {
    const characterId = activeCharacterId;
    pendingDeletes.defer({
      id,
      message: t('plans.deleted', { name: allPlans?.find((p) => p.id === id)?.name ?? '' }),
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
        className={height === 'sidebar' ? 'max-h-[40vh] overflow-y-auto' : 'overflow-y-auto'}
        style={
          height === 'viewport' && isDesktop && scrollerMaxHeight !== null
            ? { maxHeight: scrollerMaxHeight }
            : undefined
        }
      >
        {!plans ? (
          <Spinner block="panel" label={t('common.loading')} />
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
