import { useMemo } from 'react';
import { splitEverMarks } from '@/features/character/loyalty';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

export function useWalletLoyalty(loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null) {
  const { everMarks } = useMemo(() => splitEverMarks(loyaltyResult?.data ?? []), [loyaltyResult]);
  return { everMarks };
}
