import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

/**
 * The Trade Hub the Price section quotes — the same synced "Default Trade Hub"
 * as Settings, so picking one here changes it there too.
 */
export function PriceHubSelect() {
  const { t } = useTranslation();
  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);
  const hydrate = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-dim">{t('fittings.stats.priceHub')}</span>
      <Select value={hub} onValueChange={(value) => void setHub(value as TradeHub['id'])}>
        <SelectTrigger aria-label={t('fittings.stats.priceHub')} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRADE_HUBS.map((tradeHub) => (
            <SelectItem key={tradeHub.id} value={tradeHub.id}>
              {tradeHub.systemName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
