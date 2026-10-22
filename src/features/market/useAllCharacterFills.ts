/**
 * The All characters read behind Market History (issue #3995): every
 * Character's fills and journal, plus where the local wallet archive starts
 * for the pool. Nothing is read until `enabled`.
 */
import { useEffect, useState } from 'react';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';
import { loadWalletArchiveInfo } from '@/features/character/walletArchive';
import type { CharacterFills } from './transactionMargins';

export interface AllCharacterFills {
  fills: CharacterFills[];
  typeNames: Map<number, string>;
  /** Some Character's fills stopped at the page cap. */
  truncated: boolean;
  /** The latest archive start among the pooled Characters; the shortest archive limits the pool. */
  archiveSince: number | null;
  /** Characters left out of the pool: no wallet grant, or nothing to read. The header picker names them. */
  skipped: { characterId: number; name: string }[];
}

export type AllCharacterFillsState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; data: AllCharacterFills };

function latestArchiveSince(sinces: readonly (number | null)[]): number | null {
  let latest: number | null = null;
  for (const since of sinces)
    if (since !== null && (latest === null || since > latest)) latest = since;
  return latest;
}

export function useAllCharacterFills(
  enabled: boolean,
  refreshCount: number
): AllCharacterFillsState {
  const [state, setState] = useState<AllCharacterFillsState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const snapshot = await loadAllCharactersJournals();
      const infos = await Promise.all(
        snapshot.loaded.map((c) => loadWalletArchiveInfo(c.characterId))
      );
      if (cancelled) return;
      setState({
        status: 'ready',
        data: {
          fills: snapshot.loaded.map((c) => ({
            characterId: c.characterId,
            name: c.name,
            transactions: c.transactions,
            journal: c.journal,
          })),
          typeNames: snapshot.typeNames,
          truncated: snapshot.loaded.some((c) => c.fillsTruncated),
          archiveSince: latestArchiveSince(infos.map((i) => i.since)),
          skipped: snapshot.skipped.map((c) => ({ characterId: c.characterId, name: c.name })),
        },
      });
    })().catch(() => {
      if (!cancelled) setState({ status: 'failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshCount]);
  return state;
}

/** Where one Character's local wallet archive starts; null while unread or empty. */
export function useArchiveSince(characterId: number | null): number | null {
  const [read, setRead] = useState<{ characterId: number; since: number | null } | null>(null);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadWalletArchiveInfo(characterId)
      .then((info) => {
        if (!cancelled) setRead({ characterId, since: info.since });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return read !== null && read.characterId === characterId ? read.since : null;
}
