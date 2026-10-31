import { useEffect, useState } from 'react';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { minerChoices, type MinerChoice } from '@/engine/corpTaxBook/grouping';
import { resolveNames } from '@/features/character/names';
import { loadCurrentMemberIds } from '../currentMembers';
import { readGroupingSources } from '../taxBook/bookClient';
import { useBook } from './useBook';

export interface MinerChoices {
  /** Every Miner the book knows, as the Miners tab lists them. */
  choices: readonly MinerChoice[];
  /** The stored groups, which `planRegroup` needs whole. */
  stored: readonly Miner[];
  /** A character's name, covering Miners the page itself never named. */
  name: (characterId: number) => string;
}

interface Fetched {
  key: string;
  choices: MinerChoice[];
  stored: Miner[];
  names: Map<number, string>;
}

/**
 * The Miners a dialog can pick from (#5704). The whole book already holds them. A one-Miner
 * read (`data.scopedMiner`) holds only its own, so the groups and ledger rows are read here,
 * once per open, through the device's copies; until then the list is empty.
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
      if (!sources) return;
      const base = { corporationId, startDate, miners: sources.miners, entries: sources.observed };
      const ids = minerChoices(base).flatMap((c) => c.characterIds);
      const [memberIds, resolved] = await Promise.all([
        loadCurrentMemberIds(ids, corporationId).catch(() => undefined),
        resolveNames(ids).catch(() => new Map<number, string>()),
      ]);
      if (cancelled) return;
      setFetched({
        key,
        choices: minerChoices({ ...base, ...(memberIds ? { memberIds } : {}) }),
        stored: sources.miners,
        names: resolved,
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scoped, key, characterId, corporationId, startDate]);

  if (!scoped) return { choices: view.miners, stored: data.state.miners, name: names.character };
  const held = fetched?.key === key ? fetched : null;
  return {
    choices: held?.choices ?? [],
    stored: held?.stored ?? data.state.miners,
    name: (id) => held?.names.get(id) ?? names.character(id),
  };
}
