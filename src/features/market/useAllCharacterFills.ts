import { useCallback, useEffect, useState } from 'react';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';
import { loadWalletArchiveInfo } from '@/features/character/walletArchive';
import type { CharacterFills } from './transactionMargins';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface AllCharacterFills {
  fills: CharacterFills[];
  typeNames: Map<number, string>;
  truncated: boolean;
  archiveSince: number | null;
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

export function useArchiveSince(characterId: number | null): number | null {
  const loader = useCallback(
    () => loadWalletArchiveInfo(characterId ?? 0).then((info) => info.since),
    [characterId]
  );
  return useKeyedLoad(characterId === null ? null : String(characterId), loader).data ?? null;
}
