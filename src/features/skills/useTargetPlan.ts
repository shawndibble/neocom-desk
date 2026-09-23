/**
 * The "Add to Plan" target for one Character: which of their Skill Plans an
 * action from Fit Check or the Market item-detail skill chip lands on.
 *
 * Wires `targetPlan.ts`'s pure selection rule to the Character's actual
 * plans (Dexie, live) and the synced preference that remembers the last
 * choice. `db.skillPlans.put`/`scheduleSync` here mirrors
 * `SkillPlanEditor.tsx`'s own patch pattern exactly, and `upsertEntry`
 * (`planner/reorder.ts`) is the same merge the plan editor's own Skill
 * Picker uses — a skill already covered at an equal or higher level is left
 * alone rather than duplicated or downgraded.
 *
 * Deliberately different from `SkillRowContextMenu.tsx`'s "Add to Skill
 * Plan," which asks which plan on every click via a submenu, on the stated
 * reasoning that Skill Plans has no notion of a current plan. That reasoning
 * held for a single one-off right-click; it stops holding once "Add" is the
 * whole point of a panel someone returns to repeatedly (Fit Check, Ship
 * Mastery, a Market item's skill chip) — asking every time there turns one
 * click into two, every time. This preference is the new state that trade
 * accepts; the context menu's own submenu is untouched and still correct for
 * what it does.
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

      let plan = (plans ?? []).find((p) => p.id === targetPlanId) ?? null;
      if (!plan) {
        plan = newPlan(characterId, newPlanName);
        await db.skillPlans.add(plan);
      }

      const mergedEntries = entries.reduce((acc, entry) => upsertEntry(acc, entry), plan.entries);
      await db.skillPlans.put({ ...plan, entries: mergedEntries, updatedAt: Date.now() });
      void setStored(withTargetPlanId(stored, characterId, plan.id));
      if (isSyncConfigured()) scheduleSync(characterId);
    },
    [characterId, plans, targetPlanId, stored, setStored]
  );

  return { plans, targetPlanId, setTargetPlanId, addEntries };
}
