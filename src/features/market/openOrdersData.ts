import { ESI_REGISTRY } from '@/esi/registry';
import type { MarketOrder } from '@/esi/endpoints';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { loadOrders } from '@/features/character/orders';

const ORDERS_SCOPE = ESI_REGISTRY.getCharacterOrders.scope;

export interface CharacterOpenOrders {
  characterId: number;
  characterName: string;
  orders: readonly MarketOrder[];
  fetchedAt: number;
  fromCache: boolean;
  needsReauth: boolean;
}

export interface OpenOrdersSnapshot {
  entries: CharacterOpenOrders[];
  skipped: { characterId: number; name: string }[];
}

export function loadAllCharactersOpenOrders(): Promise<OpenOrdersSnapshot> {
  return fanOutAllCharacters<CharacterOpenOrders>({
    scope: ORDERS_SCOPE,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadOrders(characterId);
      return {
        characterId,
        characterName: name,
        orders: cached?.data ?? [],
        fetchedAt: cached?.fetchedAt.getTime() ?? 0,
        fromCache: cached?.fromCache ?? false,
        needsReauth,
      };
    },
  });
}
