/**
 * Fetch + cache layer for a cross-character Market Orders page: every open
 * order across every authenticated Character in one call.
 *
 * Copies `loadAllCharactersAssets`'s reasoning (src/features/character/
 * assets.ts, issue #181) exactly: the orders scope is checked UP FRONT per
 * Character (`db.tokens` against `ESI_REGISTRY.getCharacterOrders.scope`)
 * rather than left to a live 403. A live 403 is an auth failure that raises
 * the app-wide re-auth banner naming an alt the player never asked about —
 * checking first means a Character who never granted the scope is silently
 * listed in `skipped` instead of tripping that banner on every page load.
 *
 * Unlike the assets fan-out, a Character WITH the scope whose live call still
 * answers `needsReauth` is not dropped into `skipped`: it stays in `entries`
 * with `needsReauth: true` and empty `orders`, so the page can show a
 * per-character re-auth prompt on that one row instead of the row simply
 * vanishing. Only a Character that never granted the scope, or whose fetch
 * rejects outright (the rare case `loadOrders` really can throw — see
 * `assets.ts`'s fan-out for why), lands in `skipped`.
 */
import { ESI_REGISTRY } from '@/esi/registry';
import type { MarketOrder } from '@/esi/endpoints';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { loadOrders } from '@/features/character/orders';

const ORDERS_SCOPE = ESI_REGISTRY.getCharacterOrders.scope;

export interface CharacterOpenOrders {
  characterId: number;
  characterName: string;
  orders: readonly MarketOrder[];
  /** 0 when no result was obtained at all (e.g. `needsReauth` with nothing cached) — read `needsReauth` first. */
  fetchedAt: number;
  fromCache: boolean;
  needsReauth: boolean;
}

export interface OpenOrdersSnapshot {
  entries: CharacterOpenOrders[];
  /** Characters that never granted the orders scope — listed, never fetched. */
  skipped: { characterId: number; name: string }[];
}

/**
 * Every authenticated Character's open market orders, active one included —
 * this page IS the cross-character view, so there is no "active Character"
 * to exclude the way `loadOtherCharactersAssetsDetailed`'s toggle does.
 */
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
