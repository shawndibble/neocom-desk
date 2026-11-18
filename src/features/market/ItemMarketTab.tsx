import { useState } from 'react';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import { PriceHistoryPanel } from './PriceHistoryPanel';
import { useAsyncLoad } from '@/lib/useAsyncLoad';

interface ItemMarketTabProps {
  typeId: number;
  itemName: string;
  /** The region the modal prices at; the tab opens on it. */
  initialRegionId: number;
}

/**
 * The Item Detail's Market tab: the Market Browser's Price History (range,
 * hi / lo / median, the price line with its volume bars and per-day tooltip,
 * the daily table) for the item. There is no Browser scope to take a region
 * from, so Compare regions picks them outright: the first pick is the main
 * line and the summary, any others overlay it. Picks are local to the open
 * modal.
 */
export function ItemMarketTab({ typeId, itemName, initialRegionId }: ItemMarketTabProps) {
  const [picked, setPicked] = useState<number[]>([initialRegionId]);
  const regions: readonly MarketRegionEntry[] | undefined = useAsyncLoad(loadMarketRegions).data;

  return (
    <PriceHistoryPanel
      // A new main region is a new series: remount so nothing stale carries over.
      key={picked[0]}
      regionId={picked[0]}
      typeId={typeId}
      itemName={itemName}
      compare={
        regions
          ? { regionIds: picked.slice(1), onChange: setPicked, regions, picksPrimary: true }
          : undefined
      }
    />
  );
}
