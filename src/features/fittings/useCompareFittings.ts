import { useEffect, useRef, useState } from 'react';
import {
  decodeFittingShare,
  type DecodeFittingShareResult,
  type ShareDecodeError,
} from '@/engine/fittings/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { typeName } from '@/sde/loadSde';
import { withCheckedMutations } from '@/features/abyssal/mutaplasmidData';

export interface CompareSlot {
  code: string;
  fitting: Fitting | null;
  shareError: ShareDecodeError | null;
}

async function decodeSlot(code: string): Promise<CompareSlot> {
  const decoded: DecodeFittingShareResult = await decodeFittingShare(code);
  if (!decoded.ok) return { code, fitting: null, shareError: decoded.reason };
  const name = await typeName(decoded.value.hullTypeId);
  const fitting = await withCheckedMutations(shareToFitting(decoded.value, name));
  return { code, fitting, shareError: null };
}

export function useCompareFittings(codes: readonly string[]): readonly (CompareSlot | null)[] {
  const cacheRef = useRef(new Map<string, CompareSlot>());
  const [slots, setSlots] = useState<readonly (CompareSlot | null)[]>(() => codes.map(() => null));

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    setSlots(codes.map((code) => cache.get(code) ?? null));
    const missing = codes.filter((code) => !cache.has(code));
    if (missing.length === 0) return;
    void (async () => {
      const decoded = await Promise.all(missing.map(decodeSlot));
      if (cancelled) return;
      for (const slot of decoded) cache.set(slot.code, slot);
      setSlots(codes.map((code) => cache.get(code) ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [codes]);

  return slots;
}
