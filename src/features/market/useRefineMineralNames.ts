import { useEffect, useMemo, useState } from 'react';
import type { AppraisalItem } from '@/engine/market/appraisal';
import { loadTypeNames } from '@/features/character/typeNames';

const NONE: ReadonlyMap<number, string> = new Map();

/**
 * Names for the minerals the items refine into, for the breakdown's table.
 * Empty until read; the breakdown falls back to "#id" for a name not here yet,
 * so a slow or failed read costs labels, never the figures.
 */
export function useRefineMineralNames(
  items: readonly AppraisalItem[]
): ReadonlyMap<number, string> {
  const key = useMemo(() => {
    const ids = new Set<number>();
    for (const item of items) {
      for (const material of item.refine?.detail?.materials ?? []) ids.add(material.typeId);
    }
    return [...ids].sort((a, b) => a - b).join(',');
  }, [items]);
  const [loaded, setLoaded] = useState<{ key: string; names: ReadonlyMap<number, string> }>({
    key: '',
    names: NONE,
  });
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void loadTypeNames(key.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setLoaded({ key, names });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded.key === key ? loaded.names : NONE;
}
