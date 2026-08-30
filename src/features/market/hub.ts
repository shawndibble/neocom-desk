/**
 * Market Browser's selected Trade Hub, persisted in Dexie settings under the
 * plain (non-`sync.`-prefixed) key 'marketHub' — a device-local UI
 * preference, not Editable Data, so it's never synced (CONTEXT.md).
 *
 * Local to this feature (unlike `useActiveCharacter`, no other view reads
 * this) so it lives here rather than in `src/stores/`.
 */
import { create } from 'zustand';
import { db } from '@/db';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';

export const MARKET_HUB_SETTING_KEY = 'marketHub';

interface MarketHubState {
  hubId: TradeHub['id'];
  /** True once the Dexie setting has been read (or written) at least once. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setHubId: (hubId: TradeHub['id']) => Promise<void>;
}

export const useMarketHub = create<MarketHubState>((set) => ({
  hubId: DEFAULT_TRADE_HUB.id,
  hydrated: false,
  hydrate: async () => {
    const record = await db.settings.get(MARKET_HUB_SETTING_KEY);
    const stored = typeof record?.value === 'string' ? (record.value as TradeHub['id']) : null;
    set({
      hubId: stored && getTradeHub(stored) ? stored : DEFAULT_TRADE_HUB.id,
      hydrated: true,
    });
  },
  setHubId: async (hubId) => {
    await db.settings.put({ key: MARKET_HUB_SETTING_KEY, value: hubId });
    set({ hubId, hydrated: true });
  },
}));
