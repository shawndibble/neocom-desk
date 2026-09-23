/**
 * The pilot's default Trade Hub — Settings' "Default Trade Hub" control, and
 * the hub the Contracts detail modal's market-value figure (issue #717), LP
 * Store, BPC Sourcing panel and notification polling price against absent a
 * more specific choice of their own.
 *
 * Synced across their devices: which hub you price at is a fact about how you
 * play, not about the machine you opened, and a pilot who trades out of Amarr
 * had to say so again on every device. Still **not** the Payee hub Moon Mining
 * bills at (`20260907-100006`) — that one is a term of an invoice and lives on
 * the Payee record; this one is a viewing preference and Moon Mining never
 * reads it.
 *
 * **Not** the Market Browser page's own current hub, which is device-local —
 * see `browserHub.ts`'s doc comment for why the two are split.
 *
 * Lives here rather than in `src/stores/` because other features (Contracts,
 * LP Store, BPC Sourcing, notification polling) import it from here rather
 * than each holding a duplicate hub preference of their own, the same way
 * they already share `src/market/hubs.ts`'s `TradeHub` list.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';

export const MARKET_HUB_SETTING_KEY = 'sync.marketHub';

/** What it was stored under before it synced; its value is adopted once. */
export const LEGACY_MARKET_HUB_SETTING_KEY = 'marketHub';

export const useMarketHub = createSyncedSetting<TradeHub['id']>({
  key: MARKET_HUB_SETTING_KEY,
  legacyKey: LEGACY_MARKET_HUB_SETTING_KEY,
  defaultValue: DEFAULT_TRADE_HUB.id,
  // A hub id retired between releases is still a valid string, so the
  // typeof default is not enough — it has to still name a hub.
  parse: (raw) =>
    typeof raw === 'string' && getTradeHub(raw as TradeHub['id']) ? (raw as TradeHub['id']) : null,
});
