import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { PlanEditor } from '@/features/skills/planner/PlanEditor';
import { PlanEditorLayout } from '@/features/skills/planner/PlanEditorLayout';
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * Skill Plan editor: the full editing surface for one plan, beside the plan
 * list on wide screens (#158).
 *
 * The two-column grid itself belongs to `PlanEditor`, not to this route: the
 * sidebar's lower half is the plan's own tools, which need every handler
 * `PlanEditor` already owns. This route's job is the data, and the plan list
 * it hands over to fill the top of that sidebar.
 */
export function SkillPlanEditor() {
  const { t } = useTranslation();
  const { planId } = useParams<{ planId: string }>();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const {
    catalog,
    trainedSkills,
    attributes,
    attributesResult,
    attributeBaseline,
    implants,
    remapInfo,
  } = usePlanEditorData(activeCharacterId);
  const isDesktop = useIsDesktop();

  // Wrapped so `undefined` (still loading) is distinguishable from a plan
  // genuinely not found: db.skillPlans.get() resolves to undefined either
  // way, and useLiveQuery never invents an in-between "loading but plan is
  // missing" value on its own.
  const planQuery = useLiveQuery(async () => {
    if (!planId) return { plan: null };
    return { plan: (await db.skillPlans.get(planId)) ?? null };
  }, [planId]);

  if (!hydrated || planQuery === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const plan = planQuery.plan;
  // Deleted elsewhere, a stale URL, or another character's plan — the list
  // is the only page left to send the user back to.
  if (!plan || plan.characterId !== activeCharacterId) {
    return <Navigate to="/skills/plans" replace />;
  }

  function syncAfterEdit() {
    if (activeCharacterId !== null && isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  async function handleUpdate(
    patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount' | 'markers'>>
  ) {
    if (!plan) return;
    await db.skillPlans.put({ ...plan, ...patch, updatedAt: Date.now() });
    syncAfterEdit();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkillsSubNav />

      {/* Below `lg` the list is not on screen at all, so this is the only way
          back to it. */}
      {!isDesktop && (
        <Link to="/skills/plans" className="inline-block text-xs text-accent hover:underline">
          {t('plans.backToList')}
        </Link>
      )}

      {!catalog ? (
        // Same two-column shape while the skill catalog loads, so the plan
        // list stays put in the sidebar instead of vanishing behind a
        // full-page spinner and snapping back once the catalog arrives.
        <PlanEditorLayout
          sidebar={
            isDesktop ? (
              <PlanListPane
                activeCharacterId={activeCharacterId}
                remapInfo={remapInfo}
                height="sidebar"
              />
            ) : undefined
          }
        >
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        </PlanEditorLayout>
      ) : (
        <PlanEditor
          characterId={activeCharacterId}
          plan={plan}
          catalog={catalog}
          trainedSkills={trainedSkills}
          attributes={attributes}
          implants={implants}
          attributesResult={attributesResult}
          attributeBaseline={attributeBaseline}
          remapInfo={remapInfo}
          listPane={
            <PlanListPane
              activeCharacterId={activeCharacterId}
              remapInfo={remapInfo}
              height="sidebar"
            />
          }
          onUpdate={(patch) => void handleUpdate(patch)}
        />
      )}
    </div>
  );
}
