import { useMemo } from 'react';
import { splitEverMarks } from '@/features/character/loyalty';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

/**
 * The Wallet Balance tab's EverMarks figure, split out of the loyalty list. The
 * per-corporation list lives on the LP Store tab.
 */
export function useWalletLoyalty(loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null) {
  const { everMarks } = useMemo(() => splitEverMarks(loyaltyResult?.data ?? []), [loyaltyResult]);
  return { everMarks };
}
