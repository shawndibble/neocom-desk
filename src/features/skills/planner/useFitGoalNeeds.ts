/**
 * What each saved Fitting needs from a Skill Plan (fit goals, CONTEXT.md
 * "Plan Milestone"): the skill levels its hull, modules, charges, drones and
 * fighters require, from the same dogma lookup the Fitting editor's skill
 * gaps use. Requirements are one uncached ESI round trip per type, so only
 * the Fittings asked for load: those a fit goal already tracks, plus every
 * saved one while the picker is open (`all`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingNeededSkills } from '@/engine/fitGoal';
import { fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import type { PlanEntry } from '@/engine/types';
import { loadRequirements } from '@/features/fittings/skillRequirements';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface FitGoalNeed {
  id: string;
  name: string;
  needed: PlanEntry[];
}

async function loadNeed(record: FittingRecord): Promise<FitGoalNeed | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  const fitting = shareToFitting(decoded.value, record.name);
  const byType = new Map<number, readonly RequiredSkill[]>();
  await mapWithConcurrencyLimit(
    fittingRequirementTypeIds(fitting),
    ESI_FANOUT_CONCURRENCY,
    async (typeId) => {
      byType.set(typeId, await loadRequirements(typeId));
    }
  );
  return { id: record.id, name: record.name, needed: fittingNeededSkills(fitting, byType) };
}

export function useFitGoalNeeds(
  characterId: number | null,
  trackedFittingIds: readonly string[],
  all: boolean
) {
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const trackedKey = trackedFittingIds.join('|');
  const wanted = useMemo(
    () => (records ?? []).filter((r) => all || trackedKey.split('|').includes(r.id)),
    [records, all, trackedKey]
  );
  const [loaded, setLoaded] = useState<{ source: FittingRecord[]; needs: FitGoalNeed[] } | null>(
    null
  );

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const needs = (await Promise.all(wanted.map(loadNeed))).filter(
          (need): need is FitGoalNeed => need !== null
        );
        if (!cancelled) setLoaded({ source: wanted, needs });
      } catch {
        // Leaves the goals as they were; the next change retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const needs = useMemo(
    () => new Map((loaded?.needs ?? []).map((need) => [need.id, need])),
    [loaded]
  );
  return {
    needs,
    /** Every saved Fitting's id; null until the list has loaded. A tracked id missing from it was deleted. */
    savedIds: useMemo(() => (records ? new Set(records.map((r) => r.id)) : null), [records]),
    /** The saved Fittings, name order, for the picker. */
    records: records ?? [],
  };
}
