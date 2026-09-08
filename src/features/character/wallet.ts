/** Fetch + cache layer for the Wallet view: balance, journal, transactions. */
import {
  getCharacterWallet,
  getCharacterWalletJournal,
  getCharacterWalletTransactions,
  type WalletJournalEntry,
  type WalletTransaction,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  loadPaginatedWithCache,
  loadPaginatedWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export const KEYS = {
  balance: 'wallet:balance',
  journal: 'wallet:journal',
  transactions: 'wallet:transactions',
} as const;

const WALLET_SCOPE = ESI_REGISTRY.getCharacterWallet.scope;

/** ISK balance. ESI or cache. */
export function loadWalletBalance(characterId: number): Promise<CachedResult<number> | null> {
  return loadWithCache(
    characterId,
    KEYS.balance,
    async () => (await getCharacterWallet(characterId)).data
  );
}

/**
 * Same data as loadWalletBalance, with the auth-failure state exposed for views
 * that show a re-login affordance instead of a silent "offline" state.
 */
export function loadWalletBalanceWithStatus(characterId: number): Promise<StatusResult<number>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.balance,
    async () => (await getCharacterWallet(characterId)).data
  );
}

export interface CharacterWalletBalance {
  characterId: number;
  characterName: string;
  balanceResult: CachedResult<number> | null;
  /** Granted the wallet scope but the live read still failed auth — distinct from `skipped`, which never granted it at all. */
  needsReauth: boolean;
}

export interface WalletBalancesSnapshot {
  entries: CharacterWalletBalance[];
  /** Never granted the wallet scope — listed, never fetched (same policy as `openOrdersData.ts`). */
  skipped: { characterId: number; name: string }[];
}

/**
 * Every authenticated Character's wallet balance, for the Wallet page's
 * cross-character view (issue #607). Mirrors `openOrdersData.ts`'s
 * `loadAllCharactersOpenOrders` exactly: the scope is checked UP FRONT per
 * Character rather than left to a live 403 — a live 403 is an auth failure
 * that raises the app-wide re-auth banner naming an alt the player never
 * asked about. A Character WITH the scope whose live call still answers
 * `needsReauth` stays in `entries` (not `skipped`) so its row can show its
 * own re-auth prompt instead of the row simply vanishing.
 */
export async function loadAllCharactersWalletBalances(): Promise<WalletBalancesSnapshot> {
  const characters = await db.characters.toArray();
  const granted = await Promise.all(
    characters.map(async (character) => {
      const token = await db.tokens.get(character.characterId);
      return (token?.scopes ?? []).includes(WALLET_SCOPE);
    })
  );

  const toFetch = characters.filter((_, i) => granted[i]);
  const noScopeSkipped = characters
    .filter((_, i) => !granted[i])
    .map(({ characterId, name }) => ({ characterId, name }));

  // Slotted by original index, not push-on-completion order — same reasoning
  // as `openOrdersData.ts`: ordering stays stable regardless of which
  // Character's fetch lands first.
  const slots: (CharacterWalletBalance | null)[] = new Array(toFetch.length).fill(null);
  const fetchFailedSkipped: { characterId: number; name: string }[] = [];
  await mapWithConcurrencyLimit(
    toFetch.map((character, index) => ({ character, index })),
    ESI_FANOUT_CONCURRENCY,
    async ({ character, index }) => {
      const { characterId, name } = character;
      try {
        const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
        slots[index] = { characterId, characterName: name, balanceResult: cached, needsReauth };
      } catch {
        fetchFailedSkipped.push({ characterId, name });
      }
    }
  );

  const entries = slots.filter((entry): entry is CharacterWalletBalance => entry !== null);
  return { entries, skipped: [...noScopeSkipped, ...fetchFailedSkipped] };
}

/** Sum of every entry that actually has a usable balance — a needsReauth or never-fetched entry is simply absent from the total, not counted as zero. */
export function totalWalletBalance(entries: readonly CharacterWalletBalance[]): number {
  return entries.reduce(
    (sum, entry) =>
      entry.needsReauth || entry.balanceResult === null ? sum : sum + entry.balanceResult.data,
    0
  );
}

/** Journal. `truncated` on the result means pages were missing. */
export function loadWalletJournal(
  characterId: number
): Promise<CachedResult<WalletJournalEntry[]> | null> {
  return loadPaginatedWithCache(characterId, KEYS.journal, () =>
    getCharacterWalletJournal(characterId)
  );
}

/**
 * Same data as loadWalletJournal, with the auth-failure state exposed —
 * the Foreground Poller (features/notifications) needs to distinguish a
 * revoked scope from a transient offline failure the same way the other
 * pollable domains do (features/character/contracts.ts).
 */
export function loadWalletJournalWithStatus(
  characterId: number
): Promise<StatusResult<WalletJournalEntry[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEYS.journal, () =>
    getCharacterWalletJournal(characterId)
  );
}

/** Transactions. `truncated` means the fetch stopped at the page cap. */
export function loadWalletTransactions(
  characterId: number
): Promise<CachedResult<WalletTransaction[]> | null> {
  return loadPaginatedWithCache(characterId, KEYS.transactions, () =>
    getCharacterWalletTransactions(characterId)
  );
}
