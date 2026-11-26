import { useCallback } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { unnamedTypeName } from './useFittingCatalogue';

export function useResolvedTypeName(
  typeName: (typeId: number) => string,
  typeIds: readonly number[]
): (typeId: number) => string {
  const unnamed = [...new Set(typeIds)]
    .filter((id) => typeName(id) === unnamedTypeName(id))
    .sort((a, b) => a - b);
  const key = unnamed.length > 0 ? unnamed.join(',') : null;
  const load = useKeyedLoad(
    key,
    useCallback(() => loadTypeNames(key === null ? [] : key.split(',').map(Number)), [key])
  );
  const resolved = load.data;
  return (typeId) => {
    const name = typeName(typeId);
    if (name !== unnamedTypeName(typeId)) return name;
    const found = resolved?.get(typeId);
    return found === undefined || found === `Type #${typeId}` ? name : found;
  };
}
