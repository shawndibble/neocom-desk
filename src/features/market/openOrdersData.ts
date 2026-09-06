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
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import type { MarketOrder } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
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

type FanOutOutcome =
  | { kind: 'entry'; value: CharacterOpenOrders }
  | { kind: 'skipped'; value: { characterId: number; name: string } };

/**
 * Every authenticated Character's open market orders, active one included —
 * this page IS the cross-character view, so there is no "active Character"
 * to exclude the way `loadOtherCharactersAssets`'s toggle does.
 */
export async function loadAllCharactersOpenOrders(): Promise<OpenOrdersSnapshot> {
  const characters = await db.characters.toArray();
  const granted = await Promise.all(
    characters.map(async (character) => {
      const token = await db.tokens.get(character.characterId);
      return (token?.scopes ?? []).includes(ORDERS_SCOPE);
    })
  );

  const toFetch = characters.filter((_, i) => granted[i]);
  const noScopeSkipped = characters
    .filter((_, i) => !granted[i])
    .map(({ characterId, name }) => ({ characterId, name }));

  // Slotted by original index, not push-on-completion order, so a slower
  // Character's fetch can never reorder the snapshot relative to a faster
  // one's — "ordering is stable" holds regardless of which response lands
  // first.
  const outcomes: FanOutOutcome[] = new Array(toFetch.length);
  await mapWithConcurrencyLimit(
    toFetch.map((character, index) => ({ character, index })),
    ESI_FANOUT_CONCURRENCY,
    async ({ character, index }) => {
      const { characterId, name } = character;
      try {
        const { cached, needsReauth } = await loadOrders(characterId);
        outcomes[index] = {
          kind: 'entry',
          value: {
            characterId,
            characterName: name,
            orders: cached?.data ?? [],
            fetchedAt: cached?.fetchedAt.getTime() ?? 0,
            fromCache: cached?.fromCache ?? false,
            needsReauth,
          },
        };
      } catch {
        outcomes[index] = { kind: 'skipped', value: { characterId, name } };
      }
    }
  );

  const entries: CharacterOpenOrders[] = [];
  const fetchFailedSkipped: { characterId: number; name: string }[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'entry') entries.push(outcome.value);
    else fetchFailedSkipped.push(outcome.value);
  }

  return { entries, skipped: [...noScopeSkipped, ...fetchFailedSkipped] };
}
