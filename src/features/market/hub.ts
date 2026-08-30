/**
 * Market Browser's selected Trade Hub, persisted under the plain
 * (non-`sync.`-prefixed) key 'marketHub' — a device-local UI preference, not
 * Editable Data, so it is never synced (CONTEXT.md).
 *
 * Local to this feature (unlike `useActiveCharacter`, no other view reads it)
 * so it lives here rather than in `src/stores/`.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';

export const MARKET_HUB_SETTING_KEY = 'marketHub';

export const useMarketHub = createLocalSetting<TradeHub['id']>({
  key: MARKET_HUB_SETTING_KEY,
  defaultValue: DEFAULT_TRADE_HUB.id,
  // A hub id retired between releases is still a valid string, so the
  // typeof default is not enough — it has to still name a hub.
  parse: (raw) =>
    typeof raw === 'string' && getTradeHub(raw as TradeHub['id']) ? (raw as TradeHub['id']) : null,
});
