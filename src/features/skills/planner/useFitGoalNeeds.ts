/**
 * What each saved Fitting needs from a Skill Plan (fit goals, GLOSSARY.md
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
  const [loaded, setLoaded] = useState<FitGoalNeed[]>([]);
  // Dexie hands back a new array on every emission; re-fetching requirements
  // is keyed on what a Fitting needs from them: its id and code.
  const wantedKey = wanted.map((r) => `${r.id}:${r.code}:${r.name}`).join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const needs = (
        await Promise.all(wanted.map((record) => loadNeed(record).catch(() => null)))
      ).filter((need): need is FitGoalNeed => need !== null);
      if (!cancelled) setLoaded(needs);
    })();
    return () => {
      cancelled = true;
    };
    // `wanted` is covered by `wantedKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  const needs = useMemo(() => new Map(loaded.map((need) => [need.id, need])), [loaded]);
  return {
    needs,
    /** Every saved Fitting's id; null until the list has loaded. A tracked id missing from it was deleted. */
    savedIds: useMemo(
      () => (records && characterId !== null ? new Set(records.map((r) => r.id)) : null),
      [records, characterId]
    ),
    /** The saved Fittings, for the picker. */
    records: records ?? [],
  };
}
