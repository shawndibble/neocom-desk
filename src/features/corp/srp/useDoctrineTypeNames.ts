import { useEffect, useMemo, useState } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';

export function useDoctrineTypeNames(typeIds: readonly number[]): (typeId: number) => string {
  const key = [...new Set(typeIds)].sort((a, b) => a - b).join(',');
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    loadTypeNames(key.split(',').map(Number))
      .then((map) => !cancelled && setNames(map))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return useMemo(() => (id: number) => names.get(id) ?? `#${id}`, [names]);
}
