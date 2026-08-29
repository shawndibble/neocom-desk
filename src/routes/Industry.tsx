import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCharacterSkills } from '@/features/skills/data';
import {
  loadBlueprintCatalog,
  type BlueprintCatalog,
  type BlueprintCatalogEntry,
} from '@/features/industry/blueprintCatalog';
import { findOwnedBlueprint, loadCharacterBlueprints } from '@/features/industry/data';
import { ActiveJobsPanel } from '@/features/industry/ActiveJobsPanel';
import { BuildPlanList } from '@/features/industry/BuildPlanList';
import { BuildPlanDetail } from '@/features/industry/BuildPlanDetail';

function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null
): BuildPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId,
    name: entry.productName,
    blueprintTypeID: entry.blueprintTypeID,
    runs: 1,
    me: owned?.material_efficiency ?? 0,
    te: owned?.time_efficiency ?? 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: DEFAULT_TRADE_HUB.id,
    updatedAt: Date.now(),
  };
}

/** Build Plan manager: create (via blueprint search)/duplicate/delete/rename plans, edit the selected one. */
export function Industry() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const plans = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.buildPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [ownedBlueprints, setOwnedBlueprints] = useState<CharacterBlueprint[]>([]);
  const [skills, setSkills] = useState<SkillLevels>({});

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, owned, skillsResult] = await Promise.all([
        loadBlueprintCatalog(),
        loadCharacterBlueprints(activeCharacterId),
        loadCharacterSkills(activeCharacterId),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      setOwnedBlueprints(owned?.data ?? []);
      if (skillsResult?.data) {
        const map: SkillLevels = {};
        for (const skill of skillsResult.data.skills)
          map[skill.skill_id] = skill.trained_skill_level;
        setSkills(map);
      }
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

  async function handleCreate(entry: BlueprintCatalogEntry) {
    if (activeCharacterId === null) return;
    const owned = findOwnedBlueprint(ownedBlueprints, entry.blueprintTypeID);
    const plan = newBuildPlan(activeCharacterId, entry, owned);
    await db.buildPlans.add(plan);
    scheduleSync(activeCharacterId);
    setSelectedId(plan.id);
  }

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source || activeCharacterId === null) return;
    const copy: BuildPlanRecord = {
      ...source,
      id: crypto.randomUUID(),
      name: t('industry.copySuffix', { name: source.name }),
      updatedAt: Date.now(),
    };
    await db.buildPlans.add(copy);
    scheduleSync(activeCharacterId);
    setSelectedId(copy.id);
  }

  async function handleDelete(id: string) {
    // No explicit selection reset needed: effectiveSelectedId falls back
    // automatically once `plans` no longer contains the deleted id.
    // Tombstoned (not plain-deleted) so the remote copy can't resurrect it.
    if (activeCharacterId === null) return;
    await markBuildPlanDeleted(activeCharacterId, id);
    scheduleSync(activeCharacterId);
  }

  async function handleRename(id: string, name: string) {
    await db.buildPlans.update(id, { name, updatedAt: Date.now() });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  async function handleUpdate(
    patch: Partial<
      Pick<
        BuildPlanRecord,
        'runs' | 'me' | 'te' | 'facility' | 'rigLevel' | 'security' | 'hubId' | 'facilityTaxPct'
      >
    >
  ) {
    if (!selectedPlan) return;
    await db.buildPlans.put({ ...selectedPlan, ...patch, updatedAt: Date.now() });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ActiveJobsPanel characterId={activeCharacterId} />

      {!plans || !catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <>
          <Panel>
            <BuildPlanList
              plans={plans}
              catalog={catalog}
              selectedId={effectiveSelectedId}
              onSelect={setSelectedId}
              onCreate={(entry) => void handleCreate(entry)}
              onDuplicate={(id) => void handleDuplicate(id)}
              onDelete={(id) => void handleDelete(id)}
              onRename={(id, name) => void handleRename(id, name)}
            />
          </Panel>

          {selectedPlan ? (
            <BuildPlanDetail
              key={selectedPlan.id}
              plan={selectedPlan}
              catalog={catalog}
              ownedBlueprints={ownedBlueprints}
              skills={skills}
              onUpdate={(patch) => void handleUpdate(patch)}
            />
          ) : plans.length > 0 ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : (
            <EmptyState title={t('industry.selectHint')} />
          )}
        </>
      )}
    </div>
  );
}
