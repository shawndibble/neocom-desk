import { characterGet, characterPages } from './characterRequest';
import { uniqueTransactions } from '../uniqueTransactions';
import { esiFetch, recordEsiActivity, outcomeForError, attachEndpointId } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EsiEndpointId } from '../registry';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/wallet (esi-wallet.read_character_wallet.v1) ---

/** ISK balance. */
export function getCharacterWallet(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number>> {
  return characterGet<number>('getCharacterWallet', characterId, options);
}

// --- GET /characters/{character_id}/wallet/journal (esi-wallet.read_character_wallet.v1) ---

export interface WalletJournalEntry {
  id: number;
  date: string;
  ref_type: string;
  description: string;
  amount?: number;
  balance?: number;
  context_id?: number;
  context_id_type?: string;
  first_party_id?: number;
  second_party_id?: number;
  reason?: string;
  tax?: number;
  tax_receiver_id?: number;
}

/**
 * Paginated (X-Pages); see fetchAllPagesStatus. Returns the completeness flag
 * with the entries — a short journal must not reach the view looking whole.
 */
export function getCharacterWalletJournal(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<WalletJournalEntry>> {
  return characterPages<WalletJournalEntry>('getCharacterWalletJournal', characterId, options);
}

// --- GET /characters/{character_id}/wallet/transactions (esi-wallet.read_character_wallet.v1) ---

/**
 * Everything a wallet transaction carries on both sides of the API.
 *
 * The corporation endpoint returns exactly these nine fields and the character
 * endpoint adds one, per ESI's own schema — checked, not assumed, the same way
 * `CorporationAsset` was. Split out so `transactionTotal`, the CSV columns and
 * the filter serve both without a copy, and so the corp type cannot silently
 * gain a field ESI does not send.
 */
export interface WalletTransactionCommon {
  transaction_id: number;
  date: string;
  location_id: number;
  type_id: number;
  unit_price: number;
  quantity: number;
  client_id: number;
  is_buy: boolean;
  journal_ref_id: number;
}

export interface WalletTransaction extends WalletTransactionCommon {
  /** Character wallets only: whether the trade was on the character's own behalf. */
  is_personal: boolean;
}

/**
 * Not X-Pages paginated: cursored via `from_id` ("transactions before this
 * id"). Followed for up to MAX_TRANSACTION_PAGES calls, not to exhaustion —
 * full history is unbounded and this view needs only recent activity.
 */
const MAX_TRANSACTION_PAGES = 5;

/**
 * Walks a `from_id` transaction cursor to the page cap.
 *
 * Cursored, not X-Pages, so `fetchAllPagesStatus`'s own once-per-read activity
 * logging doesn't apply here — this loop does the same thing itself:
 * `endpointId` withheld from the per-page `esiFetch` calls, one
 * `recordEsiActivity` for the whole cursor walk (issue #32).
 *
 * Shared by the character and corporation transaction reads (issue #570): the
 * two paths differ only in the URL and the activity id, and a second copy of
 * this loop would be a second place for the exclusive-cursor subtlety below to
 * be got wrong.
 */
async function fetchTransactionCursor<T extends WalletTransactionCommon>(
  path: string,
  endpointId: EsiEndpointId,
  characterId: number,
  options: Omit<EndpointOptions, 'etag'>
): Promise<TruncatableResult<T>> {
  const items: T[] = [];
  const seen = new Set<number>();
  let fromId: number | undefined;
  // The cap is a deliberate product limit, but the user still has to be told
  // when it bit. Using every call *and* getting data on the last one is the
  // only case where history may remain unfetched — it may also have ended
  // exactly there, and ESI gives no way to tell, so this errs toward warning.
  let truncated = false;
  try {
    for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
      const result = await esiFetch<T[]>(path, {
        ...options,
        characterId,
        query: fromId === undefined ? undefined : { from_id: fromId },
      });
      // Live ESI answers `from_id` inclusively: each page repeats the fill it
      // was asked from, and the oldest page is that one fill alone. Keeping
      // only unseen ids stops the repeat from doubling a row (and every total
      // over it), and a page with nothing new is where history ends — without
      // this the walk re-fetched that last fill until the cap, then reported
      // truncation that wasn't there. Not `fromId - 1` instead: an exclusive
      // cursor would then skip the transaction `minId - 1`.
      const fresh = uniqueTransactions(result.data ?? []).filter(
        (t) => !seen.has(t.transaction_id)
      );
      if (fresh.length === 0) break;
      for (const t of fresh) seen.add(t.transaction_id);
      items.push(...fresh);
      truncated = page === MAX_TRANSACTION_PAGES - 1;
      fromId = Math.min(...fresh.map((t) => t.transaction_id));
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    recordEsiActivity(endpointId, characterId, outcomeForError(err));
    attachEndpointId(err, endpointId);
    throw err;
  }
  recordEsiActivity(endpointId, characterId, 'success');
  return { items, truncated };
}

export function getCharacterWalletTransactions(
  characterId: number,
  options: Omit<EndpointOptions, 'etag'> = {}
): Promise<TruncatableResult<WalletTransaction>> {
  return fetchTransactionCursor<WalletTransaction>(
    `/characters/${characterId}/wallet/transactions`,
    'getCharacterWalletTransactions',
    characterId,
    options
  );
}

// --- GET /corporations/{corporation_id}/wallets (esi-wallet.read_corporation_wallets.v1) ---

/** One of the corporation's seven wallet divisions; `division` is 1-7. */
export interface CorporationWalletDivision {
  division: number;
  balance: number;
}

export function getCorporationWallets(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationWalletDivision[]>> {
  return esiFetch<CorporationWalletDivision[]>(`/corporations/${corporationId}/wallets`, {
    ...options,
    characterId,
    endpointId: 'getCorporationWallets',
  });
}

// --- GET /corporations/{corporation_id}/wallets/{division}/journal (esi-wallet.read_corporation_wallets.v1) ---

/**
 * One division at a time: ESI publishes no all-divisions journal, and the
 * seven are separately role-gated in game. Paginated (X-Pages), returning the
 * completeness flag for the same reason the character journal does — a short
 * journal must not reach the view looking whole.
 *
 * Reuses `WalletJournalEntry`: ESI returns the same schema for both.
 */
export function getCorporationWalletJournal(
  characterId: number,
  corporationId: number,
  division: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<WalletJournalEntry>> {
  return fetchAllPagesStatus<WalletJournalEntry>(
    `/corporations/${corporationId}/wallets/${division}/journal`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationWalletJournal',
    }
  );
}

// --- GET /corporations/{corporation_id}/wallets/{division}/transactions (esi-wallet.read_corporation_wallets.v1) ---

/**
 * One division's market fills (issue #570).
 *
 * Same scope and the same `['Accountant', 'Junior_Accountant']` role gate as
 * the journal beside it, so registering this added nothing to the consent
 * screen and invalidated no existing corp login.
 *
 * Cursored via `from_id` like the character read, *not* X-Pages like the corp
 * journal — the two corp wallet endpoints paginate differently, so this one
 * walks the cursor and reports `truncated` when the page cap bit.
 *
 * `CorporationWalletTransaction` rather than `WalletTransaction`: ESI omits
 * `is_personal` here, which is meaningless for a corporation.
 */
export function getCorporationWalletTransactions(
  characterId: number,
  corporationId: number,
  division: number,
  options: Omit<EndpointOptions, 'etag'> = {}
): Promise<TruncatableResult<CorporationWalletTransaction>> {
  return fetchTransactionCursor<CorporationWalletTransaction>(
    `/corporations/${corporationId}/wallets/${division}/transactions`,
    'getCorporationWalletTransactions',
    characterId,
    options
  );
}

/** ESI returns the shared nine fields here and nothing else. */
export type CorporationWalletTransaction = WalletTransactionCommon;
