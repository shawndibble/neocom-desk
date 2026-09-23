/**
 * Which Skill Plan Fit Check / the Market skill chip Add into. Wires
 * `targetPlan.ts`'s pure selection rule to the Character's live plans plus
 * the synced remembered choice. Deliberately different from
 * `SkillRowContextMenu.tsx`'s per-click plan submenu — that's right for a
 * one-off right-click, not for a panel where "Add" repeats.
 */
import { useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import type { PlanEntry } from '@/engine/types';
import { newPlan } from './planner/newPlan';
import { upsertEntry } from './planner/reorder';
import {
  selectTargetPlanId,
  targetPlanIdFor,
  withTargetPlanId,
  useTargetSkillPlans,
} from './targetPlan';

export interface TargetPlan {
  /** Every plan this Character has, for a picker to list — `undefined` while loading. */
  plans: readonly SkillPlanRecord[] | undefined;
  /** The resolved target, or `null` when the Character has no plan yet. */
  targetPlanId: string | null;
  /** Explicit choice, for a 2+-plan picker; persists as the remembered default. */
  setTargetPlanId: (planId: string) => void;
  /**
   * Merges `entries` into the target plan (creating one first, named
   * `newPlanName`, if the Character has none yet) and remembers the choice.
   */
  addEntries: (entries: readonly PlanEntry[], newPlanName: string) => Promise<void>;
}

export function useTargetPlan(characterId: number | null): TargetPlan {
  const plans = useLiveQuery(async () => {
    if (characterId === null) return [];
    return db.skillPlans.where('characterId').equals(characterId).toArray();
  }, [characterId]);

  const stored = useTargetSkillPlans((s) => s.value);
  const setStored = useTargetSkillPlans((s) => s.setValue);
  const hydrateStored = useTargetSkillPlans((s) => s.hydrate);
  useEffect(() => {
    void hydrateStored();
  }, [hydrateStored]);

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
    async (entries: readonly PlanEntry[], newPlanName: string) => {
      if (characterId === null || entries.length === 0) return;

      // Re-queries plans fresh inside the transaction rather than trusting
      // `plans`/`targetPlanId` from render (`useLiveQuery`, can still read
      // zero plans for a moment after a concurrent Add just created one) —
      // otherwise two rapid Add clicks each see "no plan yet" and both create one.
      const plan = await db.transaction('rw', db.skillPlans, async () => {
        const existing = await db.skillPlans.where('characterId').equals(characterId).toArray();
        const selected = selectTargetPlanId(existing, targetPlanIdFor(stored, characterId));
        const current =
          existing.find((p) => p.id === selected) ?? newPlan(characterId, newPlanName);
        const updated = {
          ...current,
          entries: entries.reduce((acc, entry) => upsertEntry(acc, entry), current.entries),
          updatedAt: Date.now(),
        };
        await db.skillPlans.put(updated);
        return updated;
      });

      void setStored(withTargetPlanId(stored, characterId, plan.id));
      if (isSyncConfigured()) scheduleSync(characterId);
    },
    [characterId, stored, setStored]
  );

  return { plans, targetPlanId, setTargetPlanId, addEntries };
}
