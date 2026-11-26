import { useCallback } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { setPageHubEntry, useHubFor } from '@/features/market/hub';
import { PRICE_PERCENT_STORES, usePricePercentFor } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import { seedPageHubsOnce, useSeededOnce } from '@/features/market/pageHubSeed';
import { usePiSettings, type PiBuyTier } from './piSettings';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface SellHub {
  hub: TradeHub;
  hydrated: boolean;
  buybackPct: number | null;
  buyTiers: readonly PiBuyTier[];
  sellAtNearest: (id: TradeHub['id']) => void;
  hubPicked: (id: TradeHub['id']) => void;
  hubSwitched: (id: TradeHub['id']) => void;
  hubChosen: boolean;
  keepHub: () => void;
}

export const PI_HUB_MIGRATED_KEY = 'piHubMigrated';

export function migratePiHub(): Promise<void> {
  return seedPageHubsOnce(PI_HUB_MIGRATED_KEY, ['pi'], async () => {
    await usePiSettings.getState().hydrate();
    const settings = usePiSettings.getState().value;
    return settings.hubChosen === true ? settings.hub : null;
  });
}

export function useSellHub(): SellHub {
  const settings = usePiSettings((state) => state.value);
  const setSettings = usePiSettings((state) => state.setValue);
  const settingsHydrated = useHydratedStore(usePiSettings);
  const seeded = useSeededOnce(migratePiHub);
  const { hubId, hydrated: hubHydrated } = useHubFor('pi');
  const percent = usePricePercentFor('pi');
  const percentHydrated = useHydratedStore(...PRICE_PERCENT_STORES);
  const picked = useCallback(
    (id: TradeHub['id']) =>
      void setSettings({
        ...usePiSettings.getState().value,
        hub: id,
        hubChosen: true,
      }),
    [setSettings]
  );
  return {
    hub: getTradeHub(hubId) ?? DEFAULT_TRADE_HUB,
    hydrated: settingsHydrated && seeded && hubHydrated && percentHydrated,
    buybackPct: percent === DEFAULT_PRICE_PERCENT ? null : percent,
    buyTiers: settings.buyTiers,
    hubChosen: settings.hubChosen === true,
    keepHub: () => void setSettings({ ...usePiSettings.getState().value, hubChosen: true }),
    sellAtNearest: (id) => {
      void setPageHubEntry('pi', id);
      picked(id);
    },
    hubPicked: picked,
    hubSwitched: (id) => void setSettings({ ...usePiSettings.getState().value, hub: id }),
  };
}
