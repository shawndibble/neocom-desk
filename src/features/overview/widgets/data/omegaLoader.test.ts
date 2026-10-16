import { describe, expect, it, vi } from 'vitest';
import type { WalletTransaction } from '@/esi/endpoints';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { loadOmegaWidget } from './kindLoaders';

const A = 1;
const B = 2;
const DATE = '2026-10-10T00:00:00Z';
const line = (id: number, over: Record<string, unknown>) => ({
  id,
  date: DATE,
  ref_type: 'player_donation',
  description: '',
  ...over,
});

vi.mock('@/features/character/walletJournalAll', () => ({
  loadWalletScopedCharacterIds: async () => [A, B],
  loadAllCharactersJournals: async () => ({
    skipped: [],
    typeNames: new Map(),
    loaded: [
      {
        characterId: A,
        name: 'A',
        journal: [
          line(1, { amount: 100 }),
          line(2, { amount: -50, first_party_id: A, second_party_id: B }),
          line(3, { amount: -400, ref_type: 'market_transaction' }),
        ],
        transactions: [
          {
            transaction_id: 9,
            journal_ref_id: 3,
            type_id: PLEX_TYPE_ID,
            is_buy: true,
          } as WalletTransaction,
        ],
        truncated: false,
        fillsTruncated: false,
        fetchedAt: new Date(5_000),
      },
      {
        characterId: B,
        name: 'B',
        journal: [line(1, { amount: 50, first_party_id: A, second_party_id: B })],
        transactions: [],
        truncated: false,
        fillsTruncated: false,
        fetchedAt: new Date(9_000),
      },
    ],
  }),
}));
vi.mock('@/features/market/plexPrice', () => ({
  loadPlexQuote: async () => ({ price: 2_000_000, fetchedAt: 7_000 }),
}));

describe('loadOmegaWidget', () => {
  it('nets own-Character transfers and PLEX buys out, reads the oldest age and the PLEX price', async () => {
    const data = await loadOmegaWidget();
    const byKey = (id: number, amount: number) =>
      data.rows.find((r) => r.characterId === id && r.amount === amount);
    expect(byKey(A, -50)?.internal).toBe(true);
    expect(byKey(B, 50)?.internal).toBe(true);
    expect(byKey(A, -400)?.refKey).toBe('plex_bought');
    expect(byKey(A, 100)?.internal).toBeUndefined();
    expect(data.journalFetchedAt).toEqual(new Date(5_000));
    expect(data.plex).toEqual({ price: 2_000_000, fetchedAt: 7_000 });
    expect(data.historyStart[A]).toBe(Date.parse(DATE));
    expect(data.loadedIds).toEqual([A, B]);
  });
});
