import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, buttonClassName, EmptyState, Spinner, Toast } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { markPlanDeleted, scheduleSync } from '@/sync';
import type { OptimizeQueueToastState } from '@/lib/shortcuts';
import { isSyncConfigured } from '@/app/syncStatus';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { PlanEditor, type PlanPatch } from '@/features/skills/planner/PlanEditor';
import { PlanEditorLayout } from '@/features/skills/planner/PlanEditorLayout';
import { useIsPlanEditorWide } from '@/features/skills/planner/useIsPlanEditorWide';
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useDocumentTitleName } from '@/app/documentTitleName';

export function SkillPlanEditor() {
  const { t } = useTranslation();
  const { planId } = useParams<{ planId: string }>();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const {
    loaded,
    catalog,
    catalogFailed,
    reload,
    trainedSkills,
    trainedSkillsKnown,
    attributes,
    attributesResult,
    attributeBaseline,
    implants,
    remapInfo,
    queueEntries,
    queueFetchedAt,
    totalSp,
    unallocatedSp,
  } = usePlanEditorData(activeCharacterId);
  const [retryRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    loaded && catalogFailed ? 'failed' : 'busy',
    activeCharacterId
  );
  const isDesktop = useIsPlanEditorWide();
  const navigate = useNavigate();
  const location = useLocation();
  const stateMessage = (location.state as Partial<OptimizeQueueToastState> | null)
    ?.optimizeQueueMessage;
  const [madeToast, setMadeToast] = useState<string | null>(stateMessage ?? null);
  useEffect(() => {
    if (stateMessage) navigate(location.pathname, { replace: true, state: null });
  }, [stateMessage, location.pathname, navigate]);
  const scheduleInputs = useMemo(
    () =>
      catalog
        ? {
            catalog,
            trained: trainedSkills,
            trainedSkillsKnown,
            queueEntries,
            attributes,
            attributeBaseline,
            implants,
          }
        : undefined,
    [
      catalog,
      trainedSkills,
      trainedSkillsKnown,
      queueEntries,
      attributes,
      attributeBaseline,
      implants,
    ]
  );
  const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);

  const planQuery = useLiveQuery(async () => {
    if (!planId) return { plan: null };
    return { plan: (await db.skillPlans.get(planId)) ?? null };
  }, [planId]);

  const loadedPlan = planQuery?.plan ?? null;
  useDocumentTitleName(loadedPlan?.name);
  const handleUpdate = useCallback(
    async (patch: PlanPatch) => {
      if (!loadedPlan) return;
      await db.skillPlans.put({ ...loadedPlan, ...patch, updatedAt: Date.now() });
      if (loadedPlan.characterId !== null && isSyncConfigured()) {
        scheduleSync(loadedPlan.characterId, { collections: ['plans'] });
      }
    },
    [loadedPlan]
  );

  if (!hydrated || planQuery === undefined) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const plan = planQuery.plan;
  if (!plan) {
    return <Navigate to="/skills/plans" replace />;
  }

  return (
    <div className="mx-auto max-w-page space-y-4">
      <SkillsPageHeader
        actions={<div ref={setHeaderActionsEl} className="flex items-center gap-1.5" />}
      />
      <SkillsSubNav />

      {!isDesktop && (
        <Link to="/skills/plans" className={buttonClassName({ size: 'sm' })}>
          {t('plans.backToList')}
        </Link>
      )}

      {!catalog || !loaded ? (
        <PlanEditorLayout
          sidebar={
            isDesktop ? (
              <PlanListPane
                activeCharacterId={activeCharacterId}
                remapInfo={remapInfo}
                height="sidebar"
                activePlanId={plan.id}
                scheduleInputs={scheduleInputs}
              />
            ) : undefined
          }
        >
          <div ref={retryRef} tabIndex={-1} className="focus:outline-none">
            {loaded && catalogFailed ? (
              <EmptyState
                title={t('plans.catalogFailed')}
                hint={t('plans.catalogFailedHint')}
                action={
                  <Button
                    onClick={() => {
                      holdFocus();
                      reload();
                    }}
                  >
                    {t('common.retry')}
                  </Button>
                }
                className="py-16"
              />
            ) : (
              <Spinner block="page" label={t('common.loading')} />
            )}
          </div>
        </PlanEditorLayout>
      ) : (
        <PlanEditor
          characterId={activeCharacterId}
          plan={plan}
          catalog={catalog}
          trainedSkills={trainedSkills}
          trainedSkillsKnown={trainedSkillsKnown}
          attributes={attributes}
          implants={implants}
          attributesResult={attributesResult}
          attributeBaseline={attributeBaseline}
          remapInfo={remapInfo}
          queueEntries={queueEntries}
          queueFetchedAt={queueFetchedAt}
          totalSp={totalSp}
          unallocatedSp={unallocatedSp}
          listPane={
            <PlanListPane
              activeCharacterId={activeCharacterId}
              remapInfo={remapInfo}
              height="sidebar"
              activePlanId={plan.id}
              scheduleInputs={scheduleInputs}
            />
          }
          headerActionsContainer={headerActionsEl}
          onUpdate={handleUpdate}
        />
      )}
      {madeToast && (
        <Toast
          message={madeToast}
          undo={{
            label: t('plans.optimizeQueueUndo'),
            onUndo: () => {
              setMadeToast(null);
              void markPlanDeleted(plan.characterId, plan.id).then(() =>
                navigate('/skills/plans', { replace: true })
              );
            },
          }}
          onClose={() => setMadeToast(null)}
        />
      )}
    </div>
  );
}
