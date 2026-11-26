import { characterGet, characterPages } from './characterRequest';
import { uniqueTransactions } from '../uniqueTransactions';
import { esiFetch, recordEsiActivity, outcomeForError, attachEndpointId } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EsiEndpointId } from '../registry';
import type { EndpointOptions } from './options';

export function getCharacterWallet(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number>> {
  return characterGet<number>('getCharacterWallet', characterId, options);
}

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

export function getCharacterWalletJournal(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<WalletJournalEntry>> {
  return characterPages<WalletJournalEntry>('getCharacterWalletJournal', characterId, options);
}

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
  is_personal: boolean;
}

const MAX_TRANSACTION_PAGES = 5;

async function fetchTransactionCursor<T extends WalletTransactionCommon>(
  path: string,
  endpointId: EsiEndpointId,
  characterId: number,
  options: Omit<EndpointOptions, 'etag'>
): Promise<TruncatableResult<T>> {
  const items: T[] = [];
  const seen = new Set<number>();
  let fromId: number | undefined;
  let truncated = false;
  try {
    for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
      const result = await esiFetch<T[]>(path, {
        ...options,
        characterId,
        query: fromId === undefined ? undefined : { from_id: fromId },
      });
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

export type CorporationWalletTransaction = WalletTransactionCommon;
