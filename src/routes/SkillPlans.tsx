import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { acceleratorId, injectedAccelerator } from '@/features/accelerator/characterAccelerators';
import { DataAgeBadge, Spinner, CachedNotice, Toast } from '@/components/ui';
import { isSyncConfigured } from '@/app/syncStatus';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { scheduleSync } from '@/sync';
import type { OptimizeQueueToastState, SkillPlanImportState } from '@/lib/shortcuts';
import { parseSkillQueue } from '@/engine/skills/queueImport';
import { romanLevel } from '@/engine/projection';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { loadCharacterSkillQueue } from '@/features/skills/data';
import { optimizeQueueMadeMessage } from '@/features/skills/planner/optimizeHelpers';
import { optimizeQueuePlan } from '@/features/skills/planner/optimizeQueuePlan';
import { dedupeEntries } from '@/features/skills/planner/reorder';
import { useCloneStates, cloneStateFor } from '@/features/skills/cloneState';
import { newPlan } from '@/features/skills/planner/newPlan';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributesPane, PlanAttributeChips } from '@/features/skills/planner/AttributesPane';
import { AcceleratorSection } from '@/features/skills/planner/AcceleratorSection';
import { AcceleratorRow } from '@/features/skills/planner/AcceleratorRow';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { QueueStrip } from '@/features/skills/planner/QueueStrip';
import { SkillPlanCard } from '@/features/skills/planner/SkillPlanCard';
import { buildQueueView } from '@/features/skills/planner/queueView';
import { useSkillQueue } from '@/features/skills/planner/useSkillQueue';
import { classifySkillQueue } from '@/engine/skills/queueStatus';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useTicker } from '@/lib/ticker';

const TICK_MS = 30_000;

export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const {
    catalog,
    attributesResult,
    loaded,
    implants,
    attributeBaseline,
    remapInfo,
    trainedSkills,
    trainedSkillsKnown,
    attributes,
    queueEntries,
    fetchedAt,
    fromCache,
  } = usePlanEditorData(activeCharacterId);
  const accelerator = useLiveQuery(
    () =>
      activeCharacterId === null
        ? undefined
        : db.characterAccelerators.get(acceleratorId(activeCharacterId)),
    [activeCharacterId]
  );
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
            accelerator,
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
      accelerator,
    ]
  );
  const queueResult = useSkillQueue(activeCharacterId ?? 0);
  const nowMs = useTicker(TICK_MS);
  const timeZone = useTimeZone();
  const isDesktop = useIsDesktop();
  const injected = injectedAccelerator(accelerator, attributeBaseline, nowMs);
  const weekStart = useCalendarWeekStart((state) => state.value);
  useHydratedStore(useCalendarWeekStart);
  const queueView = useMemo(
    () =>
      buildQueueView(
        classifySkillQueue(queueResult?.data ?? [], nowMs),
        nowMs,
        weekStart,
        timeZone
      ),
    [queueResult, nowMs, weekStart, timeZone]
  );

  const cachedAt = useMemo(() => {
    const times = [
      queueResult?.fromCache ? queueResult.fetchedAt.getTime() : null,
      fromCache && fetchedAt ? fetchedAt.getTime() : null,
    ].filter((time): time is number => time !== null);
    return times.length > 0 ? Math.min(...times) : null;
  }, [queueResult, fromCache, fetchedAt]);

  const navigate = useNavigate();
  const location = useLocation();
  const importText = (location.state as Partial<SkillPlanImportState> | null)?.skillPlanImportText;
  const importedText = useRef<string | null>(null);
  const remapCount = remapInfo?.available ?? 0;
  useEffect(() => {
    if (!hydrated || activeCharacterId === null || !importText) return;
    if (importedText.current === importText) return;
    importedText.current = importText;
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapCount);
    void db.skillPlans
      .add(plan)
      .then(() => {
        if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['plans'] });
        void navigate(`/skills/plans/${plan.id}`, {
          replace: true,
          state: { skillPlanImportText: importText } satisfies SkillPlanImportState,
        });
      })
      .catch(() => undefined);
  }, [hydrated, activeCharacterId, importText, remapCount, navigate, t]);

  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);
  const optimizing = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const optimizeQueue = useCallback(async () => {
    if (optimizing.current || activeCharacterId === null || !scheduleInputs) return;
    optimizing.current = true;
    setNotice(null);
    try {
      const result = await loadCharacterSkillQueue(activeCharacterId);
      if (!result) {
        setNotice(t('plans.optimizeQueueFailed'));
        return;
      }
      const nowMs = Date.now();
      const entries = dedupeEntries(parseSkillQueue(result.data));
      const existing = await db.skillPlans.where('characterId').equals(activeCharacterId).toArray();
      const taken = new Set(existing.map((plan) => plan.name));
      const base = t('plans.optimizeQueuePlanName', { date: formatLocalDate(new Date(nowMs)) });
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
      const outcome = optimizeQueuePlan({
        entries,
        inputs: { ...scheduleInputs, cloneState: cloneStateFor(cloneStates, activeCharacterId) },
        remapInfo,
        nowMs,
        characterId: activeCharacterId,
        name,
      });
      if (outcome.kind !== 'plan') {
        setNotice(t('plans.optimizeQueueOptimal'));
        return;
      }
      await db.skillPlans.add(outcome.plan);
      if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['plans'] });
      const skill = outcome.firstRemapEntry
        ? `${scheduleInputs.catalog.engineSkills.get(outcome.firstRemapEntry.skillTypeID)?.name ?? ''} ${romanLevel(outcome.firstRemapEntry.targetLevel)}`
        : '';
      void navigate(`/skills/plans/${outcome.plan.id}`, {
        state: {
          optimizeQueueMessage: optimizeQueueMadeMessage(t, name, outcome, skill, timeZone),
        } satisfies OptimizeQueueToastState,
      });
    } catch (err) {
      setNotice(t('plans.optimizeQueueFailed'));
      console.error(err);
    } finally {
      optimizing.current = false;
    }
  }, [activeCharacterId, scheduleInputs, cloneStates, remapInfo, navigate, t, timeZone]);

  const onOptimizeQueue = scheduleInputs && remapInfo ? () => void optimizeQueue() : undefined;
  const queueEmpty = queueResult != null && queueResult.data.length === 0;

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-page space-y-4">
      <SkillsPageHeader
        meta={
          queueResult?.fetchedAt && (
            <DataAgeBadge date={queueResult.fetchedAt} expiresAt={queueResult.expiresAt} />
          )
        }
      />
      <SkillsSubNav />

      {cachedAt !== null && <CachedNotice withBadge fetchedAt={cachedAt} />}

      <QueueStrip view={queueView} nowMs={nowMs} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <aside className="order-first space-y-3 lg:sticky lg:top-4 lg:order-last lg:space-y-4">
          <SkillPlanCard
            activeCharacterId={activeCharacterId}
            remapInfo={remapInfo}
            scheduleInputs={scheduleInputs}
            onOptimizeQueue={isDesktop ? undefined : onOptimizeQueue}
            queueEmpty={queueEmpty}
          />
          {isDesktop ? (
            <AttributesPane
              result={attributesResult}
              loading={!loaded}
              implantBonuses={implants}
              attributeBaseline={attributeBaseline}
              remapInfo={remapInfo}
              onOptimizeQueue={onOptimizeQueue}
              queueEmpty={queueEmpty}
              accelerator={
                injected.running !== null || injected.detected !== null ? (
                  <AcceleratorSection
                    characterId={activeCharacterId}
                    running={injected.running}
                    detectedBonus={injected.detected}
                  />
                ) : null
              }
            />
          ) : (
            <AcceleratorRow
              characterId={activeCharacterId}
              running={injected.running}
              detectedBonus={injected.detected}
              nowMs={nowMs}
              attributes={
                <PlanAttributeChips
                  result={attributesResult}
                  loading={!loaded}
                  implantBonuses={implants}
                  attributeBaseline={attributeBaseline}
                />
              }
            />
          )}
        </aside>
        {catalog && (
          <CurrentQueuePanel
            result={queueResult}
            view={queueView}
            catalog={catalog}
            nowMs={nowMs}
          />
        )}
      </div>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
