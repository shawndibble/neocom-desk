import { useEffect, useMemo, useState } from 'react';
import { inputCostMove, type InputCostMove } from '@/engine/market/inputCostMove';
import { openPricePoints, type OpenPricePoint } from '@/engine/market/priceHistoryOpen';
import type { MaterialPriceBasis } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { loadMarketOpenPrices } from '@/features/market/marketOpenPrices';

const PRODUCT_SIDE = 'sell';

export function useInputCostMove(
  regionId: number,
  productTypeID: number | null,
  materials: readonly ResolvedMaterial[],
  basis: MaterialPriceBasis
): InputCostMove | null {
  const inputs = useMemo(
    () =>
      materials
        .filter((m) => !m.subBuild && !m.acquisitionTier)
        .map((m) => ({ typeID: m.typeID, quantity: m.remainingQuantity, lineCost: m.lineCost })),
    [materials]
  );
  const key = [
    ...new Set([...inputs.map((i) => i.typeID), ...(productTypeID ? [productTypeID] : [])]),
  ]
    .sort((a, b) => a - b)
    .join(',');
  const loadKey = `${regionId}:${key}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    series: ReadonlyMap<number, readonly OpenPricePoint[]>;
  } | null>(null);

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void Promise.all(
      key.split(',').map(async (id) => {
        const hub = await loadMarketOpenPrices(regionId, Number(id));
        return [Number(id), hub ? openPricePoints(hub.series) : []] as const;
      })
    ).then((entries) => {
      if (!cancelled) setLoaded({ key: loadKey, series: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [regionId, key, loadKey]);

  return useMemo(() => {
    if (!loaded || loaded.key !== loadKey) return null;
    return inputCostMove({
      inputs,
      series: loaded.series,
      materialSide: basis,
      product: productTypeID === null ? null : { typeID: productTypeID, side: PRODUCT_SIDE },
    });
  }, [loaded, loadKey, inputs, basis, productTypeID]);
}
