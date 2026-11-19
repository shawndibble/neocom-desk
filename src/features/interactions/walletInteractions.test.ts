import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { walletInteractions } from './walletInteractions';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${JSON.stringify(opts)}` : key;
const OTHER = 900;
const ME = 1;

const entry = (over: Partial<WalletJournalEntry>): WalletJournalEntry => ({
  id: 10,
  date: '2026-11-02T10:00:00Z',
  ref_type: 'player_donation',
  description: 'x',
  amount: 5_000_000,
  first_party_id: OTHER,
  second_party_id: ME,
  ...over,
});

const run = (
  journal: WalletJournalEntry[],
  transactions: WalletTransaction[] = [],
  typeNames = new Map<number, string>()
) =>
  walletInteractions({
    characterId: ME,
    otherId: OTHER,
    journal,
    transactions,
    typeNames,
    t,
  });

describe('walletInteractions', () => {
  it('maps a donation, signs ISK from the journal amount and links the entry', () => {
    const [row] = run([entry({ reason: 'thanks' })]);
    expect(row).toMatchObject({
      id: 'wallet-1-10',
      kind: 'wallet',
      type: 'interactions.type.donation',
      isk: 5_000_000,
      characterId: ME,
      to: '/wallet/journal?highlight=10',
      title: 'interactions.wallet.received',
      detail: 'thanks',
      at: Date.parse('2026-11-02T10:00:00Z'),
    });
  });

  it('titles an outgoing row as sent', () => {
    const [row] = run([entry({ amount: -2_000_000, first_party_id: ME, second_party_id: OTHER })]);
    expect(row.title).toBe('interactions.wallet.sent');
    expect(row.isk).toBe(-2_000_000);
  });

  it('skips rows with another counterparty, and rows without an amount', () => {
    expect(run([entry({ first_party_id: 5, second_party_id: ME })])).toEqual([]);
    expect(run([entry({ amount: undefined })])).toEqual([]);
  });

  it('skips contract-carried rows so the price counts once under Contracts', () => {
    expect(run([entry({ ref_type: 'contract_price' })])).toEqual([]);
    expect(run([entry({ ref_type: 'contract_reward' })])).toEqual([]);
    expect(
      run([entry({ ref_type: 'player_trading', context_id_type: 'contract_id', context_id: 3 })])
    ).toEqual([]);
  });

  it.each([
    ['player_trading', 'trade'],
    ['market_transaction', 'market'],
    ['bounty_prizes', 'bounty'],
    ['corporation_account_withdrawal', 'payment'],
    ['insurance', 'other'],
  ])('maps %s to the %s type', (ref, type) => {
    expect(run([entry({ ref_type: ref })])[0].type).toBe(`interactions.type.${type}`);
  });

  it('names the item of a market fill from its transaction', () => {
    const tx: WalletTransaction = {
      transaction_id: 1,
      date: '2026-11-02T10:00:00Z',
      location_id: 1,
      type_id: 34,
      unit_price: 5,
      quantity: 1000,
      client_id: OTHER,
      is_buy: false,
      journal_ref_id: 10,
      is_personal: true,
    };
    const [row] = run(
      [entry({ ref_type: 'market_transaction' })],
      [tx],
      new Map([[34, 'Tritanium']])
    );
    expect(row.title).toBe(
      'interactions.wallet.marketSold|{"quantity":"1,000","item":"Tritanium"}'
    );
  });
});
