/**
 * Decodes each compare slot's Share Link code into a Fitting. An invalid
 * code becomes its own error slot rather than failing the whole page — a
 * stranger's mis-typed URL shouldn't blank the other two fittings. Decoded
 * slots are cached per code, so adding a third fitting doesn't re-decode
 * the first two — which also keeps their `Fitting` object reference stable
 * across renders, letting `useCompareStats`/`useCompareCanFly` skip
 * recomputing them too.
 */
import { useEffect, useRef, useState } from 'react';
import { decodeFittingShare, type DecodeFittingShareResult } from '@/engine/fitting/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { typeName } from '@/sde/loadSde';

export type ShareDecodeError = 'invalid' | 'unsupported-version';

export interface CompareSlot {
  code: string;
  fitting: Fitting | null;
  shareError: ShareDecodeError | null;
}

async function decodeSlot(code: string): Promise<CompareSlot> {
  const decoded: DecodeFittingShareResult = await decodeFittingShare(code);
  if (!decoded.ok) return { code, fitting: null, shareError: decoded.reason };
  const name = await typeName(decoded.value.hullTypeId);
  return { code, fitting: shareToFitting(decoded.value, name), shareError: null };
}

/** One decoded slot per code, in the same order; `null` while a code's decode is in flight. */
export function useCompareFittings(codes: readonly string[]): readonly (CompareSlot | null)[] {
  const cacheRef = useRef(new Map<string, CompareSlot>());
  // The effect below reconciles against the cache immediately after mount;
  // starting from all-null (rather than reading the ref during render) keeps
  // this hook off `react-hooks/refs`.
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
