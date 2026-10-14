import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db';
import { Spinner } from '@/components/ui';
import { isSyncConfigured } from '@/app/syncStatus';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { scheduleSync } from '@/sync';
import type { SkillPlanImportState } from '@/lib/shortcuts';
import { newPlan } from '@/features/skills/planner/newPlan';
import { SkillsPageHeader } from '@/features/skills/SkillsPageHeader';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributesPane } from '@/features/skills/planner/AttributesPane';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { QueueStrip } from '@/features/skills/planner/QueueStrip';
import { SkillPlanCard } from '@/features/skills/planner/SkillPlanCard';
import { buildQueueView } from '@/features/skills/planner/queueView';
import { useSkillQueue } from '@/features/skills/planner/useSkillQueue';
import { classifySkillQueue } from '@/features/skills/queueStatus';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
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
  const queueView = useMemo(
    () => buildQueueView(classifySkillQueue(queueResult?.data ?? [], nowMs)),
    [queueResult, nowMs]
  );

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
        if (isSyncConfigured()) scheduleSync(activeCharacterId);
        void navigate(`/skills/plans/${plan.id}`, {
          replace: true,
          state: { skillPlanImportText: importText } satisfies SkillPlanImportState,
        });
      })
      // Storage refused the plan: stay on the list rather than loop or throw.
      .catch(() => undefined);
  }, [hydrated, activeCharacterId, importText, remapCount, navigate, t]);

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
      <SkillsPageHeader />
      <SkillsSubNav />

      <QueueStrip view={queueView} nowMs={nowMs} fetchedAt={queueResult?.fetchedAt} />

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
    </div>
  );
}
