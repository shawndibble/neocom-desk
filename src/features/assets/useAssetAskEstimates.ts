import { useEffect, useMemo, useState } from 'react';
import {
  askEstimateCandidateTypeIds,
  type ContractAskEstimate,
} from '@/engine/contracts/askEstimate';
import { loadAssetAskEstimates } from '@/features/assets/assetAskEstimates';

const NONE: ReadonlyMap<number, ContractAskEstimate> = new Map();

export function useAssetAskEstimates(
  assets: readonly { type_id: number; is_blueprint_copy?: boolean }[],
  priceByTypeId: ReadonlyMap<number, number>,
  pricesReady: boolean,
  isAbyssalType: ((typeId: number) => boolean) | null
): ReadonlyMap<number, ContractAskEstimate> {
  const key = useMemo(
    () =>
      pricesReady && isAbyssalType
        ? askEstimateCandidateTypeIds(assets, priceByTypeId, isAbyssalType)
            .sort((a, b) => a - b)
            .join(',')
        : '',
    [assets, priceByTypeId, pricesReady, isAbyssalType]
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    estimates: ReadonlyMap<number, ContractAskEstimate>;
  } | null>(null);
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void loadAssetAskEstimates(key.split(',').map(Number)).then((estimates) => {
      if (!cancelled) setLoaded({ key, estimates });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded?.key === key ? loaded.estimates : NONE;
}
