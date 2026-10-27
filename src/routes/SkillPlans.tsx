import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db';
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
import { AttributesPane } from '@/features/skills/planner/AttributesPane';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { QueueStrip } from '@/features/skills/planner/QueueStrip';
import { SkillPlanCard } from '@/features/skills/planner/SkillPlanCard';
import { buildQueueView } from '@/features/skills/planner/queueView';
import { useSkillQueue } from '@/features/skills/planner/useSkillQueue';
import { classifySkillQueue } from '@/engine/skills/queueStatus';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useTicker } from '@/lib/ticker';

/** Countdown recompute cadence; the display is minute-grained, so 30s is fresh enough. */
const TICK_MS = 30_000;

/**
 * Where the Skills section opens (`/skills` redirects here): what the
 * character is training right now and what is queued behind it, with the
 * current Skill Plan and the attributes beside it (above it on a phone). A
 * plan's editor takes over from its own route (#158).
 */
export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const {
    catalog,
    attributesResult,
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
  // Memoised: the list pane's per-plan costing re-runs when this changes.
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
  const queueResult = useSkillQueue(activeCharacterId ?? 0);
  // Shared with every other 30 s clock on screen; paused while the tab is hidden.
  const nowMs = useTicker(TICK_MS);
  const timeZone = useTimeZone();
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

  // The oldest of the sources that are actually the saved copy: a fresh queue
  // must not date cached skills as "just now".
  const cachedAt = useMemo(() => {
    const times = [
      queueResult?.fromCache ? queueResult.fetchedAt.getTime() : null,
      fromCache && fetchedAt ? fetchedAt.getTime() : null,
    ].filter((time): time is number => time !== null);
    return times.length > 0 ? Math.min(...times) : null;
  }, [queueResult, fromCache, fetchedAt]);

  // A skill plan pasted anywhere (`app/GlobalPasteRouter.tsx`) lands here: it
  // gets a plan of its own and that plan's editor opens the Import dialog on
  // the text. A fresh plan, never the pilot's existing one — importing appends
  // to a plan, and which one was meant is not something a paste can say.
  const navigate = useNavigate();
  const location = useLocation();
  const importText = (location.state as Partial<SkillPlanImportState> | null)?.skillPlanImportText;
  const importedText = useRef<string | null>(null);
  const remapCount = remapInfo?.available ?? 0;
  useEffect(() => {
    if (!hydrated || activeCharacterId === null || !importText) return;
    // The state is spent only once the plan exists; the guard keeps a
    // re-render in between from making a second plan.
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
      // Storage refused the plan: stay on the list rather than loop or throw.
      .catch(() => undefined);
  }, [hydrated, activeCharacterId, importText, remapCount, navigate, t]);

  // "Optimize queue": a plan made from the live skill queue with its best
  // remaps placed, opened at once. One press, no dialog; Undo lands on the
  // new plan's editor (a toast closes on a route change, so it is raised there).
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
      // Malformed queue data or storage refusing the plan: say so, stay on the list.
      setNotice(t('plans.optimizeQueueFailed'));
      console.error(err);
    } finally {
      optimizing.current = false;
    }
  }, [activeCharacterId, scheduleInputs, cloneStates, remapInfo, navigate, t, timeZone]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkillsPageHeader
        meta={queueResult?.fetchedAt && <DataAgeBadge date={queueResult.fetchedAt} />}
      />
      <SkillsSubNav />

      {cachedAt !== null && <CachedNotice fetchedAt={cachedAt} />}

      <QueueStrip view={queueView} nowMs={nowMs} />

      {/* The rail comes first in the DOM so a phone reads plan and attributes
          above the queue; `lg:order-last` moves it to the right column. Sticky
          there, so it stays beside a long queue. `lg:items-start` keeps the
          shorter column from stretching to the row's height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <aside className="order-first space-y-3 lg:sticky lg:top-4 lg:order-last lg:space-y-4">
          <SkillPlanCard
            activeCharacterId={activeCharacterId}
            remapInfo={remapInfo}
            scheduleInputs={scheduleInputs}
          />
          <AttributesPane
            result={attributesResult}
            implantBonuses={implants}
            attributeBaseline={attributeBaseline}
            remapInfo={remapInfo}
            onOptimizeQueue={scheduleInputs && remapInfo ? () => void optimizeQueue() : undefined}
            queueEmpty={queueResult != null && queueResult.data.length === 0}
          />
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
