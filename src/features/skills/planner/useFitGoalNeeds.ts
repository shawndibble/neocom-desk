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
  const wantedKey = wanted.map((r) => `${r.id}:${r.code}:${r.name}`).join('|');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, reconnects]);

  const needs = useMemo(() => new Map(loaded.needs.map((need) => [need.id, need])), [loaded]);
  const unknownIds = useMemo(() => new Set(loaded.unknownIds), [loaded]);
  return {
    needs,
    unknownIds,
    savedIds: useMemo(
      () => (records && characterId !== null ? new Set(records.map((r) => r.id)) : null),
      [records, characterId]
    ),
    records: records ?? [],
  };
}
