import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { Panel, Spinner } from '@/components/ui';
import { markPlanDeleted, scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import { PlanList } from './PlanList';
import type { RemapAvailability } from './remapAvailability';

interface PlanListPaneProps {
  activeCharacterId: number;
  remapInfo: RemapAvailability | null;
  className?: string;
}

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

/**
 * Plan list pane shared by the list route and the editor route (#158): both
 * keep it mounted and visible on wide screens, so opening a different plan
 * is a click in the still-visible list rather than a trip back to `/skills/plans`.
 */
export function PlanListPane({ activeCharacterId, remapInfo, className }: PlanListPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const plans = useLiveQuery(
    async () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );

  function syncAfterEdit() {
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  async function handleCreate() {
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    syncAfterEdit();
    navigate(`/skills/plans/${plan.id}`);
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
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
    await markPlanDeleted(activeCharacterId, id);
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
    syncAfterEdit();
  }

  return (
    <Panel className={className}>
      <div className="max-h-[32rem] overflow-y-auto">
        {!plans ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : (
          <PlanList
            plans={plans}
            onOpen={(id) => navigate(`/skills/plans/${id}`)}
            onCreate={() => void handleCreate()}
            onDuplicate={(id) => void handleDuplicate(id)}
            onDelete={(id) => void handleDelete(id)}
            onRename={(id, name) => void handleRename(id, name)}
          />
        )}
      </div>
    </Panel>
  );
}
