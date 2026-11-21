import { useCallback } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { setPageHubEntry, useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import { seedPageHubsOnce, useSeededOnce } from '@/features/market/pageHubSeed';
import { usePiSettings, type PiBuyTier } from './piSettings';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface SellHub {
  /** The hub PI is priced at: sold to, or the basis of the corp buyback, and bought from. */
  hub: TradeHub;
  /** False until the hub is read: a figure priced before then would be priced at the wrong hub. */
  hydrated: boolean;
  /** PI's Sell percent when it is not 100 (a corp buyback paying that percent of the hub's price), else null: the hub's market. */
  buybackPct: number | null;
  buyTiers: readonly PiBuyTier[];
  /** Sell at the hub the nudge found nearest: PI's own entry, since nearest is a fact about the colonies. */
  sellAtNearest: (id: TradeHub['id']) => void;
  /** After the shared hub menu wrote a hub pick: sell on that hub's market, and stop the nudge. */
  hubPicked: (id: TradeHub['id']) => void;
  /** After a Global / PI switch: the hub now in use, for older builds' `piSettings.hub` only. */
  hubSwitched: (id: TradeHub['id']) => void;
  /** The pilot already picked (or dismissed a suggestion for) a hub. */
  hubChosen: boolean;
  /** Keep the current hub and stop suggesting another. */
  keepHub: () => void;
}

/** Local only: this device's PI hub has been folded into the PI page hub. */
export const PI_HUB_MIGRATED_KEY = 'piHubMigrated';

/**
 * Before issue #6523 PI kept its hub in the device-local `piSettings`. A hub
 * the pilot picked there becomes PI's own page hub, once per device; the
 * default (never picked) leaves PI on Global.
 */
export function migratePiHub(): Promise<void> {
  return seedPageHubsOnce(PI_HUB_MIGRATED_KEY, ['pi'], async () => {
    await usePiSettings.getState().hydrate();
    const settings = usePiSettings.getState().value;
    // A pick made on this device reads back as `hubChosen` (the parse derives it for older rows).
    return settings.hubChosen === true ? settings.hub : null;
  });
}

/**
 * Where PI sells and what it may buy there, in the shape the PI surfaces read.
 * The hub is PI's page hub (`useHubFor('pi')`); the buyback, buy tiers and the
 * nudge's "chosen" flag stay in the device-local `piSettings.ts`. Each hub pick
 * is also written to `piSettings.hub`, which older builds still read.
 */
export function useSellHub(): SellHub {
  const settings = usePiSettings((state) => state.value);
  const setSettings = usePiSettings((state) => state.setValue);
  const settingsHydrated = useHydratedStore(usePiSettings);
  const seeded = useSeededOnce(migratePiHub);
  const { hubId, hydrated: hubHydrated } = useHubFor('pi');
  // PI's percent (`pagePricePercents.ts`): below or above 100 is a buyback at that rate.
  const percent = usePricePercentFor('pi');
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
    hydrated: settingsHydrated && seeded && hubHydrated,
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
