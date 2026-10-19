/**
 * What each saved Fitting needs from a Skill Plan (fit goals, GLOSSARY.md
 * "Plan Milestone"): the skill levels its hull, modules, charges, drones and
 * fighters require, from the same dogma lookup the Fitting editor's skill
 * gaps use. Requirements are one uncached ESI round trip per type, so only
 * the Fittings asked for load: those a fit goal already tracks, plus every
 * saved one while the picker is open (`all`).
 *
 * A Fitting with a type whose requirements could be neither read from cache
 * nor fetched has no `needs` entry and is reported in `unknownIds`: its needs
 * are not "none", so it must never read as met.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingNeededSkills } from '@/engine/fitGoal';
import { fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { PlanEntry } from '@/engine/types';
import { loadRequirementsForTypes } from '@/features/fittings/skillRequirements';
import { useReconnectCount } from '@/stores/network';

export interface FitGoalNeed {
  id: string;
  name: string;
  needed: PlanEntry[];
}

type NeedResult = { kind: 'known'; need: FitGoalNeed } | { kind: 'unknown'; id: string };

async function loadNeed(record: FittingRecord): Promise<NeedResult | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  const fitting = shareToFitting(decoded.value, record.name);
  const { byType, unknownTypeIds } = await loadRequirementsForTypes(
    fittingRequirementTypeIds(fitting)
  );
  if (unknownTypeIds.length > 0) return { kind: 'unknown', id: record.id };
  return {
    kind: 'known',
    need: { id: record.id, name: record.name, needed: fittingNeededSkills(fitting, byType) },
  };
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
  const [loaded, setLoaded] = useState<{ needs: FitGoalNeed[]; unknownIds: string[] }>({
    needs: [],
    unknownIds: [],
  });
  // Dexie hands back a new array on every emission; re-fetching requirements
  // is keyed on what a Fitting needs from them: its id and code.
  const wantedKey = wanted.map((r) => `${r.id}:${r.code}:${r.name}`).join('|');

  // Requirements that could not be read offline are looked up again on reconnect.
  const reconnects = useReconnectCount();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = (
        await Promise.all(wanted.map((record) => loadNeed(record).catch(() => null)))
      ).filter((result): result is NeedResult => result !== null);
      if (cancelled) return;
      setLoaded({
        needs: results.flatMap((r) => (r.kind === 'known' ? [r.need] : [])),
        unknownIds: results.flatMap((r) => (r.kind === 'unknown' ? [r.id] : [])),
      });
    })();
    return () => {
      cancelled = true;
    };
    // `wanted` is covered by `wantedKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, reconnects]);

  const needs = useMemo(() => new Map(loaded.needs.map((need) => [need.id, need])), [loaded]);
  const unknownIds = useMemo(() => new Set(loaded.unknownIds), [loaded]);
  return {
    needs,
    /** Fittings whose requirements couldn't be determined: neither met nor unmet. */
    unknownIds,
    /** Every saved Fitting's id; null until the list has loaded. A tracked id missing from it was deleted. */
    savedIds: useMemo(
      () => (records && characterId !== null ? new Set(records.map((r) => r.id)) : null),
      [records, characterId]
    ),
    /** The saved Fittings, for the picker. */
    records: records ?? [],
  };
}
