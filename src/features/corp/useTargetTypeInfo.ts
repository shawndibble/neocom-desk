/**
 * Names and categories for the types a stock target names but the corporation
 * owns none of: the asset read resolves labels only for types it holds, so a
 * qty-0 ledger row would otherwise read "Type #id" and a search could not find
 * it (issue #4671). Best-effort, like the Stock targets dialog's names.
 */
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
      () => {
        // Decoration only: the row keeps its "Type #id" fallback.
      }
    );
    return () => {
      live = false;
    };
  }, [key]);
  return info;
}
