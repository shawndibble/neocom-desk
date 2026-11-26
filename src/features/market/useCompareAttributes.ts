import { useEffect, useRef, useState } from 'react';
import type { CompareSetItem } from './compareSet';
import type {
  AttributeDictionary,
  AttributeReferenceNames,
  RawDogmaAttribute,
} from '@/engine/market/itemAttributes';
import { loadTypeDetail, type TypeDetail } from '@/features/skills/typeDetail';
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
        const types = new Array<TypeDetail | null>(currentItems.length);
        const [, dictionary] = await Promise.all([
          mapWithConcurrencyLimit(
            currentItems.map((item, index) => ({ item, index })),
            ESI_FANOUT_CONCURRENCY,
            async ({ item, index }) => {
              if (cancelled) return;
              types[index] = await loadTypeDetail(item.typeId);
            }
          ),
          loadAttributeDictionary(),
        ]);
        if (cancelled) return;
        if (types.some((type) => !type)) throw new Error('Missing type data');
        const dogmaByTypeId = new Map(
          currentItems.map((item, index) => [item.typeId, types[index]?.dogma_attributes])
        );
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
