import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { TRADE_HUBS } from '@/market/hubs';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import { PriceHistoryPanel } from './PriceHistoryPanel';

interface ItemMarketTabProps {
  typeId: number;
  itemName: string;
  /** The region the modal prices at; the picker opens on it. */
  initialRegionId: number;
}

/**
 * The Item Detail's Market tab: the Market Browser's Price History (range,
 * hi / lo / median, the price line with its volume bars and per-day tooltip,
 * the daily table, Compare regions) for the item, with its own Trade Hub
 * picker on top — there is no Browser scope here to take the region from.
 * Compare picks are local to the open modal.
 */
export function ItemMarketTab({ typeId, itemName, initialRegionId }: ItemMarketTabProps) {
  const { t } = useTranslation();
  const [regionId, setRegionId] = useState(initialRegionId);
  const [compareRegionIds, setCompareRegionIds] = useState<number[]>([]);
  const [regions, setRegions] = useState<readonly MarketRegionEntry[] | undefined>();
  useEffect(() => {
    let cancelled = false;
    loadMarketRegions().then(
      (loaded) => {
        if (!cancelled) setRegions(loaded);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const isHubRegion = TRADE_HUBS.some((hub) => hub.regionId === initialRegionId);
  const extraName = regions?.find((region) => region.id === initialRegionId)?.name;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-text-dim">
        {t('market.itemDetail.marketHub')}
        <Select value={String(regionId)} onValueChange={(value) => setRegionId(Number(value))}>
          <SelectTrigger size="sm" aria-label={t('market.itemDetail.marketHub')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRADE_HUBS.map((hub) => (
              <SelectItem key={hub.id} value={String(hub.regionId)}>
                {hub.systemName}
              </SelectItem>
            ))}
            {!isHubRegion && (
              <SelectItem value={String(initialRegionId)}>
                {extraName ?? String(initialRegionId)}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </label>
      <PriceHistoryPanel
        // A new region is a new series: remount so range-independent state resets.
        key={regionId}
        regionId={regionId}
        typeId={typeId}
        itemName={itemName}
        compare={
          regions
            ? { regionIds: compareRegionIds, onChange: setCompareRegionIds, regions }
            : undefined
        }
      />
    </div>
  );
}
