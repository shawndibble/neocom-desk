import { useMemo } from 'react';
import { loadTypes } from '@/sde/loadSde';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { TypeLabel } from './KillmailBody';

/** Type names from the SDE; null while loading, `#id` stands in when the catalog can't load. */
export function useTypeLabel(): TypeLabel | null {
  const { status, data } = useAsyncLoad(loadTypes);
  return useMemo<TypeLabel | null>(() => {
    if (status === 'ready') return (id: number) => data[String(id)]?.name ?? `#${id}`;
    return status === 'failed' ? (id: number) => `#${id}` : null;
  }, [status, data]);
}
