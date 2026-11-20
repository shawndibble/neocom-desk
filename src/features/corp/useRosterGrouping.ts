import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { minerChoices, type MinerChoice } from '@/engine/corpTaxBook/grouping';
import { resolveNames } from '@/features/character/names';
import {
  editBook,
  readBookSummary,
  readGroupingSources,
  verifyOfficer,
} from './taxBook/bookClient';
import type { GroupSource } from './moons/GroupMinersDialog';

export interface RosterGrouping {
  /** An officer who can edit an active book: the roster offers "Group with…". */
  canGroup: boolean;
  /** The stored group a character is in, if it is in one. */
  groupOf: (characterId: number) => Miner | undefined;
  /** Names for every character in a group, or a choice (empty until read). */
  names: ReadonlyMap<number, string>;
  /** The dialog's data, for the Miner of `characterId` (a stored group or the character alone). */
  source: GroupSource;
  reload: () => void;
}

/**
 * What the Members roster needs to show and edit groups (the roster sits outside the Corp Tax
 * Book's page, so it reads the book itself). Quiet: a Character that is no officer, or a corporation
 * with no book, simply gets no grouping.
 */
export function useRosterGrouping(
  characterId: number | null,
  corporationId: number | null
): RosterGrouping {
  const [state, setState] = useState<{
    key: string;
    miners: Miner[];
    choices: MinerChoice[];
    names: Map<number, string>;
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
      const [sources, summary] = await Promise.all([
        readGroupingSources(characterId, corporationId),
        readBookSummary(characterId, corporationId),
      ]);
      if (!sources) return;
      const choices = minerChoices({
        corporationId,
        ...(summary ? { startDate: summary.startDate } : {}),
        miners: sources.miners,
        entries: sources.observed,
      });
      const ids = [...new Set(choices.flatMap((c) => c.characterIds))];
      const names = await resolveNames(ids).catch(() => new Map<number, string>());
      if (!cancelled) setState({ key, miners: sources.miners, choices, names, status: 'ready' });
    })().catch(() => {
      // Not an officer, or the book is unreadable: no grouping on the roster.
    });
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
      reload,
      source: {
        status: held?.status ?? 'loading',
        choices: held?.choices ?? [],
        stored: miners,
        name: (id) => names.get(id) ?? `#${id}`,
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
