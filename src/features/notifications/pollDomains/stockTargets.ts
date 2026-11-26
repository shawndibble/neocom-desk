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

const isStockAlertEntry = shapeGuard<StockAlertEntry>({
  listId: is.string,
  listName: is.string,
  locationId: is.number,
  typeId: is.number,
  name: is.string,
  target: is.number,
  listed: is.nullable(is.number),
  inHangar: is.number,
  inJobs: is.optional(is.number),
});

async function stockAlertOwner(): Promise<number | null> {
  const scope = ESI_REGISTRY.getCharacterOrders.scope;
  const ids = (await characterIdsWithScopes([scope])).sort((a, b) => a - b);
  return ids[0] ?? null;
}

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
