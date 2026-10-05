import { useEffect } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useGoalPlannerPrefs } from './goalPlannerPrefs';
import { useMarketSourcing } from './marketSourcingPref';

/**
 * The hub PI is priced and sold at: the Goal Planner's price hub, or, when
 * buying inputs is on, the hub the shared sourcing pref names, so no two PI
 * surfaces ever price one pilot's operation at two markets. Setting it moves
 * both, same as the Plan rail's Hub field.
 */
export function useSellHub(): { hub: TradeHub; setHub: (id: TradeHub['id']) => void } {
  const prefs = useGoalPlannerPrefs((state) => state.value);
  const hydratePrefs = useGoalPlannerPrefs((state) => state.hydrate);
  const setPrefs = useGoalPlannerPrefs((state) => state.setValue);
  const sourcing = useMarketSourcing((state) => state.value);
  const hydrateSourcing = useMarketSourcing((state) => state.hydrate);
  const setSourcing = useMarketSourcing((state) => state.setValue);
  useEffect(() => {
    void hydratePrefs();
    void hydrateSourcing();
  }, [hydratePrefs, hydrateSourcing]);
  const buyP1 = sourcing !== 'none';
  const hub = (buyP1 ? getTradeHub(sourcing) : getTradeHub(prefs.priceHub)) ?? DEFAULT_TRADE_HUB;
  const setHub = (id: TradeHub['id']) => {
    void setPrefs({ ...prefs, priceHub: id });
    if (buyP1) void setSourcing(id);
  };
  return { hub, setHub };
}
