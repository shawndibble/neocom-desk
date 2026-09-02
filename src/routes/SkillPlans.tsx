import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { markPlanDeleted, scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import { useSyncStatus } from '@/app/useSyncStatus';
import { SyncErrorNote } from '@/app/SyncErrorNote';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { PlanList } from '@/features/skills/planner/PlanList';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';

function newPlan(characterId: number, name: string, remapCount = 0): SkillPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId,
    name,
    entries: [],
    remapCount,
    updatedAt: Date.now(),
  };
}

/** Skill Plan list: create/duplicate/delete/rename plans; editing a plan happens on its own page. */
export function SkillPlans() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const syncStatus = useSyncStatus();
  const { catalog, remapInfo } = usePlanEditorData(activeCharacterId);

  const plans = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.skillPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  function syncAfterEdit() {
    if (activeCharacterId !== null && isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  async function handleCreate() {
    if (activeCharacterId === null) return;
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    syncAfterEdit();
    navigate(`/skills/plans/${plan.id}`);
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source || activeCharacterId === null) return;
    const copy: SkillPlanRecord = {
      ...newPlan(activeCharacterId, t('plans.copySuffix', { name: source.name })),
      entries: source.entries,
      remapCount: source.remapCount,
      ...(source.markers ? { markers: source.markers } : {}),
    };
    await db.skillPlans.add(copy);
    syncAfterEdit();
    navigate(`/skills/plans/${copy.id}`);
  }

  async function handleDelete(id: string) {
    // Always goes through markPlanDeleted (records a tombstone): a plain
    // Dexie delete would let the remote copy resurrect it on next sync.
    if (activeCharacterId === null) return;
    await markPlanDeleted(activeCharacterId, id);
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
    syncAfterEdit();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SkillsSubNav />
      {isSyncConfigured() && <SyncErrorNote {...syncStatus} />}

      {catalog && <CurrentQueuePanel characterId={activeCharacterId} catalog={catalog} />}

      {!plans ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <Panel>
          <PlanList
            plans={plans}
            onOpen={(id) => navigate(`/skills/plans/${id}`)}
            onCreate={() => void handleCreate()}
            onDuplicate={(id) => void handleDuplicate(id)}
            onDelete={(id) => void handleDelete(id)}
            onRename={(id, name) => void handleRename(id, name)}
          />
        </Panel>
      )}
    </div>
  );
}
