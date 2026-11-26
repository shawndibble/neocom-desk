import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadAllCharactersWalletBalances,
  oldestCachedBalanceAt,
  type WalletBalancesSnapshot,
} from '@/features/character/wallet';

export function useWalletBalances(
  enabled: boolean,
  characters: readonly { characterId: number }[]
) {
  const [snapshot, setSnapshot] = useState<WalletBalancesSnapshot | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadAllCharactersWalletBalances().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshCount]);
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);
  const cachedAt = useMemo(
    () =>
      oldestCachedBalanceAt(snapshot?.entries ?? [], new Set(characters.map((c) => c.characterId))),
    [snapshot, characters]
  );
  return { snapshot, refreshCount, refresh, loading: snapshot === null, cachedAt };
}
