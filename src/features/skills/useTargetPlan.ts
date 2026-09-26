/**
 * Which Skill Plan Fit Check / the Market skill chip Add into. Deliberately
 * different from `SkillRowContextMenu.tsx`'s per-click plan submenu — that's
 * right for a one-off right-click, not a panel where "Add" repeats.
 */
import { useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SkillPlanRecord } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import type { PlanEntry } from '@/engine/types';
import { newPlan } from './planner/newPlan';
import { removeEntry, upsertEntry } from './planner/reorder';
import {
  selectTargetPlanId,
  targetPlanIdFor,
  withTargetPlanId,
  useTargetSkillPlans,
} from './targetPlan';

export interface AddEntriesResult {
  /** The plan `entries` were merged into — existing, or newly created and named `newPlanName`. */
  planId: string;
  /** That plan's name, straight from the transaction — no separate lookup a caller could race against its own live query for. */
  planName: string;
  /**
   * The subset of `entries` not already covered by an existing row at that
   * level (`upsertEntry`'s rule, applied cumulatively) — what a caller's
   * Undo should pass back to `removeEntries`.
   */
  added: readonly PlanEntry[];
}

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
  addEntries: (entries: readonly PlanEntry[], newPlanName: string) => Promise<AddEntriesResult>;
  /** Removes exactly these entries from a plan — undoes an `addEntries` call. */
  removeEntries: (planId: string, entries: readonly PlanEntry[]) => Promise<void>;
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
    async (entries: readonly PlanEntry[], newPlanName: string): Promise<AddEntriesResult> => {
      if (characterId === null || entries.length === 0) {
        return { planId: '', planName: '', added: [] };
      }

      // Re-queries plans fresh inside the transaction rather than trusting
      // `plans`/`targetPlanId` from render (`useLiveQuery`, can still read
      // zero plans for a moment after a concurrent Add just created one) —
      // otherwise two rapid Add clicks each see "no plan yet" and both create one.
      const result = await db.transaction('rw', db.skillPlans, async () => {
        const existing = await db.skillPlans.where('characterId').equals(characterId).toArray();
        const selected = selectTargetPlanId(existing, targetPlanIdFor(stored, characterId));
        const current =
          existing.find((p) => p.id === selected) ?? newPlan(characterId, newPlanName);
        // Tracked alongside the reduce, not a length diff after it: an
        // in-batch duplicate must also be excluded from `added`, or Undo
        // would remove a row that was never its own.
        const added: PlanEntry[] = [];
        const merged = entries.reduce((acc, entry) => {
          const next = upsertEntry(acc, entry);
          if (next.length > acc.length) added.push(entry);
          return next;
        }, current.entries);
        const updated = { ...current, entries: merged, updatedAt: Date.now() };
        await db.skillPlans.put(updated);
        return { planId: updated.id, planName: updated.name, added };
      });

      void setStored(withTargetPlanId(stored, characterId, result.planId));
      if (isSyncConfigured()) scheduleSync(characterId);
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
        const updated = {
          ...plan,
          entries: entries.reduce(
            (acc, e) => removeEntry(acc, e.skillTypeID, e.targetLevel),
            plan.entries
          ),
          updatedAt: Date.now(),
        };
        await db.skillPlans.put(updated);
      });
      if (characterId !== null && isSyncConfigured()) scheduleSync(characterId);
    },
    [characterId]
  );

  return { plans, targetPlanId, setTargetPlanId, addEntries, removeEntries };
}
