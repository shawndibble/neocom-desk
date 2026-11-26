import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import type { PlanEntry } from '@/engine/types';
import { newPlan } from './planner/newPlan';
import { addEntry, removeEntry, type SkillPlanEditable } from './planner/skillPlanEdit';
import {
  selectTargetPlanId,
  targetPlanIdFor,
  withTargetPlanId,
  useTargetSkillPlans,
} from './targetPlan';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface AddEntriesResult {
  planId: string;
  planName: string;
  added: readonly PlanEntry[];
}

export interface TargetPlan {
  plans: readonly SkillPlanRecord[] | undefined;
  targetPlanId: string | null;
  setTargetPlanId: (planId: string) => void;
  addEntries: (entries: readonly PlanEntry[], newPlanName: string) => Promise<AddEntriesResult>;
  removeEntries: (planId: string, entries: readonly PlanEntry[]) => Promise<void>;
}

export function targetPlanEntries(
  target: Pick<TargetPlan, 'plans' | 'targetPlanId'>
): readonly PlanEntry[] {
  return target.plans?.find((p) => p.id === target.targetPlanId)?.entries ?? [];
}

export function useTargetPlan(characterId: number | null): TargetPlan {
  const plans = useLiveQuery(async () => {
    if (characterId === null) return [];
    return db.skillPlans.where('characterId').equals(characterId).toArray();
  }, [characterId]);

  const stored = useTargetSkillPlans((s) => s.value);
  const setStored = useTargetSkillPlans((s) => s.setValue);
  useHydratedStore(useTargetSkillPlans);

  const targetPlanId =
    characterId === null || plans === undefined
      ? null
      : selectTargetPlanId(plans, targetPlanIdFor(stored, characterId));

  const setTargetPlanId = useCallback(
    (planId: string) => {
      if (characterId === null) return;
      void setStored(withTargetPlanId(stored, characterId, planId));
    },
    [characterId, stored, setStored]
  );

  const addEntries = useCallback(
    async (entries: readonly PlanEntry[], newPlanName: string): Promise<AddEntriesResult> => {
      if (characterId === null || entries.length === 0) {
        return { planId: '', planName: '', added: [] };
      }

      const result = await db.transaction('rw', db.skillPlans, async () => {
        const existing = await db.skillPlans.where('characterId').equals(characterId).toArray();
        const selected = selectTargetPlanId(existing, targetPlanIdFor(stored, characterId));
        const current =
          existing.find((p) => p.id === selected) ?? newPlan(characterId, newPlanName);
        const added: PlanEntry[] = [];
        const merged = entries.reduce<SkillPlanEditable>((acc, entry) => {
          const next = { ...acc, ...addEntry(acc, entry) };
          if (next.entries.length > acc.entries.length) added.push(entry);
          return next;
        }, current);
        const updated = { ...current, ...merged, updatedAt: Date.now() };
        await db.skillPlans.put(updated);
        return { planId: updated.id, planName: updated.name, added };
      });

      void setStored(withTargetPlanId(stored, characterId, result.planId));
      if (isSyncConfigured()) scheduleSync(characterId, { collections: ['plans'] });
      return result;
    },
    [characterId, stored, setStored]
  );

  const removeEntries = useCallback(
    async (planId: string, entries: readonly PlanEntry[]) => {
      if (entries.length === 0) return;
      await db.transaction('rw', db.skillPlans, async () => {
        const plan = await db.skillPlans.get(planId);
        if (!plan) return;
        const edited = entries.reduce<SkillPlanEditable>(
          (acc, e) => ({ ...acc, ...removeEntry(acc, e.skillTypeID, e.targetLevel) }),
          plan
        );
        const updated = { ...plan, ...edited, updatedAt: Date.now() };
        await db.skillPlans.put(updated);
      });
      if (characterId !== null && isSyncConfigured())
        scheduleSync(characterId, { collections: ['plans'] });
    },
    [characterId]
  );

  return { plans, targetPlanId, setTargetPlanId, addEntries, removeEntries };
}
