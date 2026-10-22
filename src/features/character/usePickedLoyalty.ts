import { useCallback, useEffect, useMemo, useState } from 'react';
import { combineLoyaltyStatuses, loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { resolveNames } from '@/features/character/names';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

const NOT_READ: StatusResult<CharacterLoyaltyPoints[]> = { cached: null, needsReauth: false };

interface PickedLoyaltySnapshot {
  /** Which Characters it was read for, so a stale pick is never shown as the new one. */
  key: string;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  reauthCharacterIds: number[];
  corporationNames: Map<number, string>;
}

/**
 * Loyalty points summed per corporation across the Wallet's picked
 * Characters (issue #4694), fetched only while `enabled` (the picker reaches
 * beyond the active Character, whose own list the page snapshot already
 * holds). `snapshot === null` means "nothing to show yet" — the same
 * retained-snapshot idiom as `useWalletBalances`.
 */
export function usePickedLoyalty(enabled: boolean, characters: readonly { characterId: number }[]) {
  const key = characters.map((c) => c.characterId).join(',');
  const [snapshot, setSnapshot] = useState<PickedLoyaltySnapshot | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const characterIds = key === '' ? [] : key.split(',').map(Number);
    void (async () => {
      const statuses = await Promise.all(
        characterIds.map(async (characterId) => ({
          characterId,
          // ESI down with nothing cached throws: that Character adds nothing,
          // the rest still sum.
          status: await loadCharacterLoyaltyPoints(characterId).catch(() => NOT_READ),
        }))
      );
      const { result, reauthCharacterIds } = combineLoyaltyStatuses(statuses);
      if (cancelled) return;
      const corporationNames = await resolveNames(
        (result?.data ?? []).map((entry) => entry.corporation_id)
      );
      if (!cancelled) {
        setSnapshot({ key, loyaltyResult: result, reauthCharacterIds, corporationNames });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key, refreshCount]);
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);
  const current = snapshot?.key === key ? snapshot : null;
  return useMemo(() => ({ snapshot: current, refresh }), [current, refresh]);
}
