import { useEffect, useMemo, useState } from 'react';
import { inputCostMove, type InputCostMove } from '@/engine/market/inputCostMove';
import { openPricePoints, type OpenPricePoint } from '@/engine/market/priceHistoryOpen';
import type { MaterialPriceBasis } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { loadMarketOpenPrices } from '@/features/market/marketOpenPrices';

/** The product sells on the sell side of its hub, as the plan's revenue does. */
const PRODUCT_SIDE = 'sell';

/**
 * The plan's own inputs and product, read from the daily Open Prices series
 * (one cached read per type) and folded into the 7-day cost move. Null while
 * loading, when the hub has no series, or when the move is under the threshold.
 */
export function useInputCostMove(
  regionId: number,
  productTypeID: number | null,
  materials: readonly ResolvedMaterial[],
  basis: MaterialPriceBasis
): InputCostMove | null {
  // Built materials are costed by their own sub-job, not a market price.
  const inputs = useMemo(
    () =>
      materials
        .filter((m) => !m.subBuild && !m.acquisitionTier)
        .map((m) => ({ typeID: m.typeID, quantity: m.remainingQuantity })),
    [materials]
  );
  const key = [
    ...new Set([...inputs.map((i) => i.typeID), ...(productTypeID ? [productTypeID] : [])]),
  ]
    .sort((a, b) => a - b)
    .join(',');
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
      if (!cancelled) setLoaded({ key: `${regionId}:${key}`, series: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [regionId, key]);

  return useMemo(() => {
    if (!loaded || loaded.key !== `${regionId}:${key}`) return null;
    return inputCostMove({
      inputs,
      series: loaded.series,
      materialSide: basis,
      product: productTypeID === null ? null : { typeID: productTypeID, side: PRODUCT_SIDE },
    });
  }, [loaded, regionId, key, inputs, basis, productTypeID]);
}
