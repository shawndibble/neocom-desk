import { db, type QuickbarItem } from '@/db';
import { getHubPrices } from '@/market/prices';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { tradeHubIdFor } from '@/features/market/hub';
import type {
  PriceAlertEntrySnapshot,
  PriceAlertSnapshot,
  PriceAlertTriggeredFire,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

const isPriceAlertEntrySnapshot = shapeGuard<PriceAlertEntrySnapshot>({
  typeId: is.number,
  name: is.string,
  targetPrice: is.number,
  direction: is.oneOf(['above', 'below'] as const),
  price: is.nullable(is.number),
});

export async function currentHub(characterId: number) {
  return getTradeHub(await tradeHubIdFor(characterId, 'market')) ?? DEFAULT_TRADE_HUB;
}

type TargetedItem = QuickbarItem & { targetPrice: number; targetDirection: 'above' | 'below' };

export async function targetedQuickbarItems(characterId: number): Promise<TargetedItem[]> {
  const record = await db.quickbars.get(String(characterId));
  return (record?.items ?? []).filter(
    (item): item is TargetedItem =>
      item.targetPrice !== undefined && item.targetDirection !== undefined
  );
}

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
    const targeted = await targetedQuickbarItems(characterId);
    if (targeted.length === 0) return [];
    const hub = await currentHub(characterId);
    const prices = await getHubPrices(
      hub,
      targeted.map((item) => item.typeId),
      Date.now,
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

export async function lastPriceAlertSnapshot(
  characterId: number
): Promise<PriceAlertSnapshot | null> {
  await priceAlertDomain.store.getState().hydrate();
  const snapshot = priceAlertDomain.store.getState().value[characterId];
  return (snapshot as PriceAlertSnapshot | undefined) ?? null;
}
