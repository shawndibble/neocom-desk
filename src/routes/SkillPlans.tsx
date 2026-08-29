import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import {
  loadSkillCatalog,
  toEngineAttributes,
  toTrainedSkillsMap,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { loadCharacterAttributes, loadCharacterSkills } from '@/features/skills/data';
import { PlanList } from '@/features/skills/planner/PlanList';
import { PlanEditor } from '@/features/skills/planner/PlanEditor';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import type { Attributes, TrainedSkill } from '@/engine/types';

const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

function newPlan(characterId: number, name: string): SkillPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId,
    name,
    entries: [],
    remapCount: 0,
    updatedAt: Date.now(),
  };
}

/** Skill Plan manager: create/duplicate/delete/rename plans, edit the selected one. */
export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const plans = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.skillPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());
  const [attributes, setAttributes] = useState<Attributes>(DEFAULT_ATTRIBUTES);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, skills, attrs] = await Promise.all([
        loadSkillCatalog(),
        loadCharacterSkills(activeCharacterId),
        loadCharacterAttributes(activeCharacterId),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      if (skills?.data) setTrainedSkills(toTrainedSkillsMap(skills.data.skills));
      if (attrs?.data) setAttributes(toEngineAttributes(attrs.data));
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

  async function handleCreate() {
    if (activeCharacterId === null) return;
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'));
    await db.skillPlans.add(plan);
    setSelectedId(plan.id);
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source || activeCharacterId === null) return;
    const copy: SkillPlanRecord = {
      ...newPlan(activeCharacterId, t('plans.copySuffix', { name: source.name })),
      entries: source.entries,
      remapCount: source.remapCount,
    };
    await db.skillPlans.add(copy);
    setSelectedId(copy.id);
  }

  async function handleDelete(id: string) {
    // No explicit selection reset needed: effectiveSelectedId falls back
    // automatically once `plans` no longer contains the deleted id.
    await db.skillPlans.delete(id);
  }

  async function handleRename(id: string, name: string) {
    await db.skillPlans.update(id, { name, updatedAt: Date.now() });
  }

  async function handleUpdate(patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount'>>) {
    if (!selectedPlan) return;
    await db.skillPlans.put({ ...selectedPlan, ...patch, updatedAt: Date.now() });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SkillsSubNav />

      {catalog && (
        <CurrentQueuePanel
          characterId={activeCharacterId}
          catalog={catalog}
          attributes={attributes}
          implants={{}}
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
              implants={{}}
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
