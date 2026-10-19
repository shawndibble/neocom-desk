import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadAllCharactersWalletBalances,
  oldestCachedBalanceAt,
  type WalletBalancesSnapshot,
} from '@/features/character/wallet';

/**
 * Every Character's wallet balance, fetched only while `enabled` (the Character
 * filter asks for more than the active Character, or the net worth view is
 * drilled in). No separate "loading" state: `snapshot === null` already means
 * "nothing to show yet," and a manual refresh deliberately leaves the previous
 * snapshot in place while it re-fetches — same retained-snapshot idiom
 * `useRouteSnapshot`/`useCorpSnapshot` use elsewhere in this app, and the only
 * way to give the effect below no synchronous `setState` call of its own
 * (`react-hooks/set-state-in-effect`).
 */
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
  // The all-characters totals add up one balance read per character: if any of
  // them is the saved copy the total is only as fresh as the oldest of those.
  const cachedAt = useMemo(
    () =>
      oldestCachedBalanceAt(snapshot?.entries ?? [], new Set(characters.map((c) => c.characterId))),
    [snapshot, characters]
  );
  return { snapshot, refreshCount, refresh, loading: snapshot === null, cachedAt };
}
