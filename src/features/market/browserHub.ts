/**
 * Market Browser's own last-picked Trade Hub — device-local, never synced.
 *
 * Distinct from `hub.ts`'s `useMarketHub` (`sync.marketHub`), which is the
 * *default* the Contracts detail modal, LP Store, BPC Sourcing panel and
 * notification polling assume, and what Settings' "Default Trade Hub"
 * control edits — a fact about how the pilot trades, meant to travel with
 * them. The Market Browser page itself is a fact about the machine they're
 * sitting at: switching hubs on a phone shouldn't also switch the hub every
 * other feature defaults to, and returning to a laptop should show whatever
 * that laptop was last left on, not a hub set from the phone (issue: "app
 * not remembering my selection for trade hub/region").
 *
 * Seeded once from `sync.marketHub` so an existing pilot's first load after
 * this shipped shows no visible reset; every write after that stays local.
 */
import { db } from '@/db';
import { createSettingStore, type StoredRow } from '@/lib/settingStore';
import { settingCoercer } from '@/lib/useLocalSetting';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { MARKET_HUB_SETTING_KEY } from './hub';

export const MARKET_BROWSER_HUB_SETTING_KEY = 'marketBrowserHub';

const parse = (raw: unknown): TradeHub['id'] | null =>
  typeof raw === 'string' && getTradeHub(raw as TradeHub['id']) ? (raw as TradeHub['id']) : null;

let seeded = false;

async function read(): Promise<StoredRow | undefined> {
  const row = await db.settings.get(MARKET_BROWSER_HUB_SETTING_KEY);
  if (row !== undefined) return row;
  if (seeded) return undefined;
  const previous = await db.settings.get(MARKET_HUB_SETTING_KEY);
  if (previous === undefined) return undefined;
  seeded = true;
  await db.settings.put({ key: MARKET_BROWSER_HUB_SETTING_KEY, value: previous.value });
  return previous;
}

export const useMarketBrowserHub = createSettingStore<TradeHub['id']>({
  defaultValue: DEFAULT_TRADE_HUB.id,
  coerce: settingCoercer(DEFAULT_TRADE_HUB.id, parse),
  read,
  write: async (value) => {
    await db.settings.put({ key: MARKET_BROWSER_HUB_SETTING_KEY, value });
  },
});
