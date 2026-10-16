import { useEffect, useState } from 'react';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { AttributeDictionary } from '@/sde/marketTypes';

/** The SDE attribute dictionary; null while it loads or if it fails. */
export function useAttributeDictionary(): AttributeDictionary | null {
  const [dictionary, setDictionary] = useState<AttributeDictionary | null>(null);
  useEffect(() => {
    let live = true;
    void loadAttributeDictionary().then(
      (loaded) => {
        if (live) setDictionary(loaded);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, []);
  return dictionary;
}
