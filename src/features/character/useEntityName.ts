/**
 * One entity's name (a faction, a corp, a pilot) through `resolveNames`, for a
 * component that needs a single name it was handed an id for. Null until it
 * resolves, and for an id that never does — the caller prints `#id` itself.
 */
import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { resolveNames } from './names';

export function useEntityName(id: number | undefined): string | null {
  const loader = useCallback(
    async () =>
      id === undefined
        ? null
        : ((await resolveNames([id]).catch(() => new Map<number, string>())).get(id) ?? null),
    [id]
  );
  const { data } = useKeyedLoad(id === undefined ? null : String(id), loader);
  return data ?? null;
}
