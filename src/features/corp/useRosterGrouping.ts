import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { minerChoices, type MinerChoice } from '@/engine/corpTaxBook/grouping';
import { resolveNames } from '@/features/character/names';
import {
  editBook,
  readBookSummary,
  readGroupingFlags,
  readGroupingSources,
  verifyOfficer,
} from './taxBook/bookClient';
import type { GroupSource } from './moons/GroupMinersDialog';
import { unknownCharacterName, type PlayerGroup } from './playerRows';

const NO_IDS: ReadonlySet<number> = new Set();

export interface RosterGrouping {
  canGroup: boolean;
  groupOf: (characterId: number) => Miner | undefined;
  names: ReadonlyMap<number, string>;
  source: GroupSource;
  groups: readonly PlayerGroup[];
  conflictIds: ReadonlySet<number>;
  declinedIds: ReadonlySet<number>;
  reload: () => void;
}

export function useRosterGrouping(
  characterId: number | null,
  corporationId: number | null
): RosterGrouping {
  const [state, setState] = useState<{
    key: string;
    miners: Miner[];
    choices: MinerChoice[];
    names: Map<number, string>;
    conflictIds: ReadonlySet<number>;
    declinedIds: ReadonlySet<number>;
    status: 'loading' | 'ready' | 'failed';
  } | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${characterId}:${corporationId}`;
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    let cancelled = false;
    (async () => {
      const verdict = await verifyOfficer(characterId, corporationId);
      if (!verdict.canEdit || !verdict.bookActive) return;
      const [sources, summary, flags] = await Promise.all([
        readGroupingSources(characterId, corporationId),
        readBookSummary(characterId, corporationId),
        readGroupingFlags(characterId, corporationId).catch(() => ({
          conflictIds: NO_IDS,
          declinedIds: NO_IDS,
        })),
      ]);
      if (!sources) return;
      const choices = minerChoices({
        corporationId,
        ...(summary ? { startDate: summary.startDate } : {}),
        miners: sources.miners,
        entries: sources.observed,
      });
      const ids = [
        ...new Set([
          ...choices.flatMap((c) => c.characterIds),
          ...flags.declinedIds,
          ...flags.conflictIds,
        ]),
      ];
      const names = await resolveNames(ids).catch(() => new Map<number, string>());
      if (!cancelled)
        setState({
          key,
          miners: sources.miners,
          choices,
          names,
          conflictIds: flags.conflictIds,
          declinedIds: flags.declinedIds,
          status: 'ready',
        });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, key, tick]);

  return useMemo(() => {
    const held = state?.key === key ? state : null;
    const miners = held?.miners ?? [];
    const names = held?.names ?? new Map<number, string>();
    return {
      canGroup: held !== null,
      groupOf: (id) => miners.find((m) => m.characterIds.includes(id) && m.characterIds.length > 1),
      names,
      groups: miners as readonly PlayerGroup[],
      conflictIds: held?.conflictIds ?? NO_IDS,
      declinedIds: held?.declinedIds ?? NO_IDS,
      reload,
      source: {
        status: held?.status ?? 'loading',
        choices: held?.choices ?? [],
        stored: miners,
        name: (id) => names.get(id) ?? unknownCharacterName(id),
        edit: async (action) => {
          try {
            return await editBook(characterId ?? 0, corporationId ?? 0, action);
          } finally {
            reload();
          }
        },
        searchAs: characterId ?? 0,
      },
    };
  }, [state, key, characterId, corporationId, reload]);
}
