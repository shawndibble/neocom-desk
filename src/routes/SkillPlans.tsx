import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db';
import { PageHeader, Spinner } from '@/components/ui';
import { isSyncConfigured } from '@/app/syncStatus';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { scheduleSync } from '@/sync';
import type { SkillPlanImportState } from '@/lib/shortcuts';
import { newPlan } from '@/features/skills/planner/newPlan';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributesPane } from '@/features/skills/planner/AttributesPane';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * Skill Plan list — where the Skills section opens (`/skills` redirects here).
 * On wide screens the pane beside it holds the character's current attributes
 * until a plan is opened, at which point the editor takes it over from its own
 * route (#158).
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
  const isDesktop = useIsDesktop();

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
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />

      {/* `lg:items-start`: grid items stretch to the row's height by
          default, so without this a short right column gets pulled down to
          match a taller plan list, or vice versa. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <PlanListPane
          activeCharacterId={activeCharacterId}
          remapInfo={remapInfo}
          scheduleInputs={scheduleInputs}
        />
        {/* Desktop-only, like the placeholder it replaces: below `lg` the
            list owns the single column, and the editor takes it once a plan
            is open. */}
        <AttributesPane
          result={attributesResult}
          implantBonuses={implants}
          attributeBaseline={attributeBaseline}
          remapInfo={remapInfo}
          className={isDesktop ? '' : 'hidden'}
        />
      </div>

      {catalog && <CurrentQueuePanel characterId={activeCharacterId} catalog={catalog} />}
    </div>
  );
}
