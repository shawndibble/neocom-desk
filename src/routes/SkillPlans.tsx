import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { markPlanDeleted, scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import { useSyncStatus } from '@/app/useSyncStatus';
import { SyncErrorNote } from '@/app/SyncErrorNote';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import {
  loadSkillCatalog,
  toEngineAttributes,
  toTrainedSkillsMap,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import {
  loadCharacterAttributes,
  loadCharacterSkills,
  loadImplantBonuses,
} from '@/features/skills/data';
import { PlanList } from '@/features/skills/planner/PlanList';
import { PlanEditor } from '@/features/skills/planner/PlanEditor';
import {
  remapAvailability,
  type RemapAvailability,
} from '@/features/skills/planner/remapAvailability';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';

const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

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

/** Skill Plan manager: create/duplicate/delete/rename plans, edit the selected one. */
export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const syncStatus = useSyncStatus();

  const plans = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.skillPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());
  const [attributes, setAttributes] = useState<Attributes>(DEFAULT_ATTRIBUTES);
  const [implants, setImplants] = useState<Implants>({});
  // Remaps Available (CONTEXT.md): ESI bonus remaps + the yearly remap when
  // off cooldown. Prefills new plans' remapCount; user-editable per plan.
  const [remapInfo, setRemapInfo] = useState<RemapAvailability | null>(null);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, skills, attrs, implantBonuses] = await Promise.all([
        loadSkillCatalog(),
        loadCharacterSkills(activeCharacterId),
        loadCharacterAttributes(activeCharacterId),
        loadImplantBonuses(activeCharacterId),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      if (skills?.data) setTrainedSkills(toTrainedSkillsMap(skills.data.skills));
      if (attrs?.data) setAttributes(toEngineAttributes(attrs.data, implantBonuses));
      setRemapInfo(remapAvailability(attrs?.data ?? null, new Date()));
      setImplants(implantBonuses);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  // Derived, not effect-synced: falls back to the first plan whenever the
  // explicitly selected one is missing (first load, or it was just deleted).
  const effectiveSelectedId = useMemo(() => {
    if (!plans) return null;
    if (selectedId && plans.some((p) => p.id === selectedId)) return selectedId;
    return plans[0]?.id ?? null;
  }, [plans, selectedId]);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.id === effectiveSelectedId) ?? null,
    [plans, effectiveSelectedId]
  );

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
    setSelectedId(plan.id);
    syncAfterEdit();
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
    setSelectedId(copy.id);
    syncAfterEdit();
  }

  async function handleDelete(id: string) {
    // No explicit selection reset needed: effectiveSelectedId falls back
    // automatically once `plans` no longer contains the deleted id.
    // Always goes through markPlanDeleted (records a tombstone): a plain
    // Dexie delete would let the remote copy resurrect it on next sync.
    if (activeCharacterId === null) return;
    await markPlanDeleted(activeCharacterId, id);
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
    syncAfterEdit();
  }

  async function handleUpdate(
    patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount' | 'markers'>>
  ) {
    if (!selectedPlan) return;
    await db.skillPlans.put({ ...selectedPlan, ...patch, updatedAt: Date.now() });
    syncAfterEdit();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SkillsSubNav />
      {isSyncConfigured() && <SyncErrorNote {...syncStatus} />}

      {catalog && (
        <CurrentQueuePanel
          characterId={activeCharacterId}
          catalog={catalog}
          attributes={attributes}
          implants={implants}
        />
      )}

      {!plans ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <>
          <Panel>
            <PlanList
              plans={plans}
              selectedId={effectiveSelectedId}
              onSelect={setSelectedId}
              onCreate={() => void handleCreate()}
              onDuplicate={(id) => void handleDuplicate(id)}
              onDelete={(id) => void handleDelete(id)}
              onRename={(id, name) => void handleRename(id, name)}
            />
          </Panel>

          {selectedPlan && catalog ? (
            <PlanEditor
              characterId={activeCharacterId}
              plan={selectedPlan}
              catalog={catalog}
              trainedSkills={trainedSkills}
              attributes={attributes}
              implants={implants}
              remapInfo={remapInfo}
              onUpdate={(patch) => void handleUpdate(patch)}
            />
          ) : plans.length > 0 ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : (
            <EmptyState title={t('plans.selectHint')} />
          )}
        </>
      )}
    </div>
  );
}
