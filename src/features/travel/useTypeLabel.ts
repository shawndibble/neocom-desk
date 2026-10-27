import { useEffect, useState } from 'react';
import { loadTypes } from '@/sde/loadSde';
import type { TypeLabel } from './KillmailBody';

/** Type names from the SDE; null while loading, `#id` stands in when the catalog can't load. */
export function useTypeLabel(): TypeLabel | null {
  const [typeLabel, setTypeLabel] = useState<TypeLabel | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadTypes()
      .then((types) => {
        if (!cancelled) setTypeLabel(() => (id: number) => types[String(id)]?.name ?? `#${id}`);
      })
      .catch(() => {
        if (!cancelled) setTypeLabel(() => (id: number) => `#${id}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return typeLabel;
}
