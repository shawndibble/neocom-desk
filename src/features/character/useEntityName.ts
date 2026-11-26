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
