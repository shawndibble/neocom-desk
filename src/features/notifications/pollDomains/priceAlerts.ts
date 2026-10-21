import { db, type QuickbarItem } from '@/db';
import { getHubPrices } from '@/market/prices';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import type {
  PriceAlertEntrySnapshot,
  PriceAlertSnapshot,
  PriceAlertTriggeredFire,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* Quickbar: price alerts ----------------------------------------------------- */

const isPriceAlertEntrySnapshot = shapeGuard<PriceAlertEntrySnapshot>({
  typeId: is.number,
  name: is.string,
  targetPrice: is.number,
  direction: is.oneOf(['above', 'below'] as const),
  price: is.nullable(is.number),
});

/** The Trade Hub Quickbar prices at, re-read every poll for the same reason as `currentThresholds` in `shared.ts`: AC4's "without a reload" needs the live value. */
async function currentHub() {
  await useMarketHub.getState().hydrate();
  return getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
}

/**
 * Prices only the Quickbar items carrying a target (issue #680) — an item
 * with no target has nothing for `diffPriceAlertTriggered` to compare, so
 * pricing it would be a wasted Fuzzwork call. Always prices "the item's
 * Quickbar entry" at the one Trade Hub Quickbar and Compare already share
 * (`features/market/hub.ts`); `QuickbarItem` carries no hub of its own.
 */
export const priceAlertDomain = defineDomain<
  PriceAlertEntrySnapshot,
  PriceAlertSnapshot,
  PriceAlertTriggeredFire
>({
  source: SNAPSHOT_SOURCES.priceAlert,
  stateKey: 'notifications.pollerState.priceAlert',
  entriesKey: 'entries',
  isEntry: isPriceAlertEntrySnapshot,
  load: async (characterId) => {
    const record = await db.quickbars.get(String(characterId));
    const targeted = (record?.items ?? []).filter(
      (item): item is QuickbarItem & { targetPrice: number; targetDirection: 'above' | 'below' } =>
        item.targetPrice !== undefined && item.targetDirection !== undefined
    );
    if (targeted.length === 0) return [];
    const hub = await currentHub();
    const prices = await getHubPrices(
      hub,
      targeted.map((item) => item.typeId),
      Date.now,
      // An alert compares a live price with a target; yesterday's close could fire a false one.
      { allowStale: false }
    );
    return targeted.map((item) => ({
      typeId: item.typeId,
      name: item.name,
      targetPrice: item.targetPrice,
      direction: item.targetDirection,
      price: prices.get(item.typeId)?.sellMin ?? null,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});

/**
 * The price-alert poller's last reading for one Character, or null before its
 * first poll. The Overview's Price alerts card reads prices from here rather
 * than fetching its own, so the two can never disagree about a crossing.
 */
export async function lastPriceAlertSnapshot(
  characterId: number
): Promise<PriceAlertSnapshot | null> {
  await priceAlertDomain.store.getState().hydrate();
  // The store's parse already ran `isPriceAlertEntrySnapshot` over every entry.
  const snapshot = priceAlertDomain.store.getState().value[characterId];
  return (snapshot as PriceAlertSnapshot | undefined) ?? null;
}
