import { useCallback, useMemo } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { unnamedTypeName } from './useFittingCatalogue';

export function useResolvedTypeName(
  typeName: (typeId: number) => string,
  typeIds: readonly number[]
): (typeId: number) => string {
  const unnamed = useMemo(
    () =>
      [...new Set(typeIds)]
        .filter((id) => typeName(id) === unnamedTypeName(id))
        .sort((a, b) => a - b),
    [typeIds, typeName]
  );
  const load = useKeyedLoad(
    unnamed.length > 0 ? unnamed.join(',') : null,
    useCallback(() => loadTypeNames(unnamed), [unnamed])
  );
  const resolved = load.data;
  return useCallback(
    (typeId: number) => {
      const name = typeName(typeId);
      return name === unnamedTypeName(typeId) ? (resolved?.get(typeId) ?? name) : name;
    },
    [typeName, resolved]
  );
}
