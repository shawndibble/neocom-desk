import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function useModuleNames(
  typeIds: readonly number[] | null,
  lookUp: (typeId: number) => Promise<string>
): ReadonlyMap<number, string> {
  const loader = useCallback(
    async (): Promise<ReadonlyMap<number, string>> =>
      new Map(
        await Promise.all(
          [...new Set(typeIds ?? [])].map(async (typeId): Promise<[number, string]> => [
            typeId,
            await lookUp(typeId),
          ])
        )
      ),
    [typeIds, lookUp]
  );
  const { data } = useKeyedLoad('names', loader, typeIds === null);
  return data ?? NO_NAMES;
}
