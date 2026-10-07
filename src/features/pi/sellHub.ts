import { useEffect } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { usePiSettings, type PiBuyTier } from './piSettings';

export interface SellHub {
  /** The hub PI is priced at: sold to, or the basis of the corp buyback, and bought from. */
  hub: TradeHub;
  /** The corp buyback's percent of the hub's price, or null when selling on the hub's market. */
  buybackPct: number | null;
  buyTiers: readonly PiBuyTier[];
  /** Sell on this hub's market. */
  setHub: (id: TradeHub['id']) => void;
  /** The pilot already picked (or dismissed a suggestion for) a hub. */
  hubChosen: boolean;
  /** Keep the current hub and stop suggesting another. */
  keepHub: () => void;
  /** Sell to a corp buyback at this percent of the hub's price; null returns to the market. */
  setBuyback: (pct: number | null) => void;
}

/**
 * Where PI sells and what it may buy there: the shared PI settings
 * (`piSettings.ts`) in the shape the PI surfaces read. The page strip, the
 * Plan rail, the Advisor and the settings form all edit the same record.
 */
export function useSellHub(): SellHub {
  const settings = usePiSettings((state) => state.value);
  const hydrate = usePiSettings((state) => state.hydrate);
  const setSettings = usePiSettings((state) => state.setValue);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return {
    hub: getTradeHub(settings.hub) ?? DEFAULT_TRADE_HUB,
    buybackPct: settings.buybackPct,
    buyTiers: settings.buyTiers,
    hubChosen: settings.hubChosen === true,
    keepHub: () => void setSettings({ ...settings, hubChosen: true }),
    setHub: (id) => void setSettings({ ...settings, hub: id, buybackPct: null, hubChosen: true }),
    setBuyback: (pct) =>
      void setSettings({
        ...settings,
        buybackPct: pct === null ? null : pct,
        ...(pct === null ? {} : { hubChosen: true as const }),
      }),
  };
}
