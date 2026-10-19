import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { useStockLists } from '@/features/stockTargets/stockListsStore';
import { loadStockAlertEntries } from '@/features/stockTargets/stockTargetsData';
import type {
  StockAlertEntry,
  StockAlertSnapshot,
  StockBelowTargetFire,
} from '@/engine/stockTargets/stockAlert';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* Stock Targets: below-target alert ----------------------------------------- */

const isStockAlertEntry = shapeGuard<StockAlertEntry>({
  listId: is.string,
  listName: is.string,
  locationId: is.number,
  typeId: is.number,
  name: is.string,
  target: is.number,
  listed: is.nullable(is.number),
  inHangar: is.number,
});

/**
 * The one Character the lists' alerts are filed under. Stock Lists are
 * account-wide and count every Character's orders, so polling them under each
 * Character would fire one alert per Character for a single empty shelf. The
 * lowest id with the orders scope is stable for as long as the roster is.
 */
async function stockAlertOwner(): Promise<number | null> {
  const scope = ESI_REGISTRY.getCharacterOrders.scope;
  const ids = (await characterIdsWithScopes([scope])).sort((a, b) => a - b);
  return ids[0] ?? null;
}

/**
 * A market's listed amount of an item dropping to Low or Out (issue #3521),
 * counted from the cached order and asset lists only — never a live fetch
 * inside the poll.
 */
export const stockTargetDomain = defineDomain<
  StockAlertEntry,
  StockAlertSnapshot,
  StockBelowTargetFire
>({
  source: SNAPSHOT_SOURCES.stockTargets,
  stateKey: 'notifications.pollerState.stockTargets',
  entriesKey: 'entries',
  isEntry: isStockAlertEntry,
  load: async (characterId) => {
    if ((await stockAlertOwner()) !== characterId) return [];
    await useStockLists.getState().hydrate();
    return loadStockAlertEntries(useStockLists.getState().value);
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
