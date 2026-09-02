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
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useIsDesktop } from '@/lib/useIsDesktop';

/** Skill Plan editor: the full editing surface for one plan, beside the plan list on wide screens (#158). */
export function SkillPlanEditor() {
  const { t } = useTranslation();
  const { planId } = useParams<{ planId: string }>();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const { catalog, trainedSkills, attributes, implants, remapInfo } =
    usePlanEditorData(activeCharacterId);
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <PlanListPane
          activeCharacterId={activeCharacterId}
          remapInfo={remapInfo}
          className={isDesktop ? '' : 'hidden'}
        />
        <div className="space-y-2">
          {!isDesktop && (
            <Link to="/skills/plans" className="inline-block text-xs text-accent hover:underline">
              {t('plans.backToList')}
            </Link>
          )}
          {/* The height cap exists to keep the plan list beside it in view on a
              wide screen. Below `lg` the list is not rendered at all, so the
              cap would only buy a 512px scroller inside an already-scrolling
              phone page — two nested scroll regions and a viewport-sized
              editor squeezed into two thirds of it. Keyed to `lg` to match the
              grid above, not to a JS breakpoint that could drift from it. */}
          <div className="lg:max-h-[32rem] lg:overflow-y-auto">
            {!catalog ? (
              <div className="flex justify-center py-16">
                <Spinner label={t('common.loading')} />
              </div>
            ) : (
              <PlanEditor
                characterId={activeCharacterId}
                plan={plan}
                catalog={catalog}
                trainedSkills={trainedSkills}
                attributes={attributes}
                implants={implants}
                remapInfo={remapInfo}
                onUpdate={(patch) => void handleUpdate(patch)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
