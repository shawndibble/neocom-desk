import { useState } from 'react';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import { PriceHistoryPanel } from './PriceHistoryPanel';
import { useAsyncLoad } from '@/lib/useAsyncLoad';

interface ItemMarketTabProps {
  typeId: number;
  itemName: string;
  initialRegionId: number;
}

export function ItemMarketTab({ typeId, itemName, initialRegionId }: ItemMarketTabProps) {
  const [picked, setPicked] = useState<number[]>([initialRegionId]);
  const regions: readonly MarketRegionEntry[] | undefined = useAsyncLoad(loadMarketRegions).data;

  return (
    <PriceHistoryPanel
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
