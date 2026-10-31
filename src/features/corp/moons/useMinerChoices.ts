import { useEffect, useMemo, useState } from 'react';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { minerChoices, type MinerChoice } from '@/engine/corpTaxBook/grouping';
import { resolveNames } from '@/features/character/names';
import { loadCurrentMemberIds } from '../currentMembers';
import { readGroupingSources } from '../taxBook/bookClient';
import { useBook } from './useBook';

export interface MinerChoices {
  status: 'loading' | 'ready' | 'failed';
  /** Every stored group, and every ungrouped character mining since the start date. */
  choices: readonly MinerChoice[];
  /** The stored groups, which `planRegroup` needs whole. */
  stored: readonly Miner[];
  /** A character's name, covering Miners the page itself never named. */
  name: (characterId: number) => string;
}

type Fetched =
  | { key: string; status: 'failed' }
  | {
      key: string;
      status: 'ready';
      choices: MinerChoice[];
      stored: Miner[];
      names: Map<number, string>;
    };

/**
 * The Miners a dialog can pick from. A one-Miner read (`data.scopedMiner`) holds only its
 * own, so the groups and ledger rows are read here, once per open, through the device's copies.
 */
export function useMinerChoices(): MinerChoices {
  const { characterId, corporationId, view, data, names, settings } = useBook();
  const scoped = data.scopedMiner !== undefined;
  const key = `${characterId}:${corporationId}`;
  const startDate = settings.startDate;
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!scoped) return;
    let cancelled = false;
    (async () => {
      const sources = await readGroupingSources(characterId, corporationId);
      if (!sources) throw new Error('no book');
      const base = { corporationId, startDate, miners: sources.miners, entries: sources.observed };
      const ids = minerChoices(base).flatMap((c) => c.characterIds);
      const [memberIds, resolved] = await Promise.all([
        loadCurrentMemberIds(ids, corporationId).catch(() => undefined),
        resolveNames(ids).catch(() => new Map<number, string>()),
      ]);
      if (cancelled) return;
      setFetched({
        key,
        status: 'ready',
        choices: minerChoices({ ...base, ...(memberIds ? { memberIds } : {}) }),
        stored: sources.miners,
        names: resolved,
      });
    })().catch(() => {
      if (!cancelled) setFetched({ key, status: 'failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [scoped, key, characterId, corporationId, startDate]);

  return useMemo(() => {
    if (!scoped)
      return {
        status: 'ready',
        choices: view.miners,
        stored: data.state.miners,
        name: names.character,
      };
    const held = fetched?.key === key ? fetched : null;
    const ready = held?.status === 'ready' ? held : null;
    return {
      status: held?.status ?? 'loading',
      choices: ready?.choices ?? [],
      stored: ready?.stored ?? data.state.miners,
      name: (id: number) => ready?.names.get(id) ?? names.character(id),
    };
  }, [scoped, view.miners, data.state.miners, names, fetched, key]);
}
