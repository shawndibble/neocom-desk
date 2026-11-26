import { useEffect, useState } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeCategories, type AssetCategory } from './assetCategories';

export interface TargetTypeInfo {
  names: ReadonlyMap<number, string>;
  categories: ReadonlyMap<number, AssetCategory>;
}

const NONE: TargetTypeInfo = { names: new Map(), categories: new Map() };

export function useTargetTypeInfo(typeIds: readonly number[]): TargetTypeInfo {
  const [info, setInfo] = useState<TargetTypeInfo>(NONE);
  const key = [...typeIds].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (key === '') return;
    let live = true;
    const ids = key.split(',').map(Number);
    Promise.all([loadTypeNames(ids), loadTypeCategories(ids)]).then(
      ([names, categories]) => {
        if (live) setInfo({ names, categories });
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [key]);
  return info;
}
