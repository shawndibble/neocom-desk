/**
 * Fetches each Compare Set item's full dogma attributes, for the drawer's
 * Attributes view (moved out of the old `VariationsCompareModal`, issue
 * #1425). Only fetches while `enabled` — a closed drawer, or one open on
 * Prices, must not fire N ESI reads for attributes nobody is looking at,
 * mirroring `useCompareRows.ts`'s own enabled gate.
 */
import { useEffect, useRef, useState } from 'react';
import type { CompareSetItem } from './compareSet';
import type {
  AttributeDictionary,
  AttributeReferenceNames,
  RawDogmaAttribute,
} from '@/engine/market/itemAttributes';
import { getUniverseType } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadAttributeReferenceNames } from './attributeReferenceNames';

export interface CompareAttributesData {
  dogmaByTypeId: ReadonlyMap<number, readonly RawDogmaAttribute[] | undefined>;
  dictionary: AttributeDictionary;
  names: AttributeReferenceNames;
}

export interface UseCompareAttributesResult {
  data: CompareAttributesData | null;
  loading: boolean;
  error: boolean;
}

export function useCompareAttributes(
  items: readonly CompareSetItem[],
  enabled: boolean
): UseCompareAttributesResult {
  const [data, setData] = useState<CompareAttributesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // A fresh `items` array reference can land on every render; the fetch
  // effect keys on a value-stable typeId signature instead (same pattern as
  // `useCompareRows.ts` and the modal this replaced) so an unrelated
  // re-render doesn't restart every ESI fetch.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemsKey = items.map((item) => item.typeId).join(',');

  useEffect(() => {
    const currentItems = itemsRef.current;
    if (!enabled || currentItems.length === 0) {
      setData(null);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      try {
        const types = new Array<Awaited<ReturnType<typeof getUniverseType>>>(currentItems.length);
        const [, dictionary] = await Promise.all([
          // A large variation group (up to `VARIATIONS_LIMIT`) fanning out
          // unbounded risks ESI's rate limit, same reasoning as
          // `SkillCompare.tsx`'s own per-item fetch for the same "N items in
          // a compare table" shape.
          mapWithConcurrencyLimit(
            currentItems.map((item, index) => ({ item, index })),
            ESI_FANOUT_CONCURRENCY,
            async ({ item, index }) => {
              // A superseded run stops spending ESI budget on columns nobody will see.
              if (cancelled) return;
              types[index] = await getUniverseType(item.typeId);
            }
          ),
          loadAttributeDictionary(),
        ]);
        if (cancelled) return;
        if (types.some((result) => !result.data)) throw new Error('Missing type data');
        const dogmaByTypeId = new Map(
          currentItems.map((item, index) => [item.typeId, types[index].data?.dogma_attributes])
        );
        // One resolve for the whole matrix: ids repeat hard across
        // variations, so every column shares the lookups the first paid for.
        const names = await loadAttributeReferenceNames([...dogmaByTypeId.values()], dictionary);
        if (cancelled) return;
        setData({ dogmaByTypeId, dictionary, names });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, itemsKey]);

  return { data, loading, error };
}
