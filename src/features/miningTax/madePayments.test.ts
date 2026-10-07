import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract, WalletJournalEntry } from '@/esi/endpoints';
import {
  loadMadePaymentsWithStatus,
  missingPaymentEndpoints,
  type MadePaymentSources,
} from './madePayments';

const loadWalletJournalWithStatus = vi.fn();
const loadContracts = vi.fn();
vi.mock('@/features/character/wallet', () => ({
  loadWalletJournalWithStatus: (...a: unknown[]) => loadWalletJournalWithStatus(...a),
}));
vi.mock('@/features/character/contracts', () => ({
  loadContracts: (...a: unknown[]) => loadContracts(...a),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: () => Promise.resolve(new Map<number, string>()),
}));

const JOURNAL: WalletJournalEntry = {
  id: 11,
  date: '2026-09-10T12:00:00Z',
  ref_type: 'player_donation',
  amount: -500_000,
  second_party_id: 9001,
} as WalletJournalEntry;

const CONTRACT = {
  contract_id: 5,
  issuer_id: 1,
  assignee_id: 9001,
  type: 'item_exchange',
  status: 'finished',
  price: 0,
  date_issued: '2026-09-11T08:00:00Z',
} as Contract;

const ok = <T>(data: T) => ({ cached: { data }, needsReauth: false });
const noPermission = { cached: null, needsReauth: true };

beforeEach(() => {
  loadWalletJournalWithStatus.mockReset();
  loadContracts.mockReset();
});

describe('loadMadePaymentsWithStatus', () => {
  it('marks a missing journal permission skipped and still returns contract payments', async () => {
    loadWalletJournalWithStatus.mockResolvedValue(noPermission);
    loadContracts.mockResolvedValue(ok([CONTRACT]));

    const result = await loadMadePaymentsWithStatus([1]);

    expect(result.sources).toEqual([
      { characterId: 1, journal: 'skipped-no-permission', contracts: 'ok' },
    ]);
    expect(result.payments.map((p) => p.key)).toEqual(['contract:5']);
  });

  it('marks both sources ok when both load', async () => {
    loadWalletJournalWithStatus.mockResolvedValue(ok([JOURNAL]));
    loadContracts.mockResolvedValue(ok([CONTRACT]));

    const result = await loadMadePaymentsWithStatus([1]);

    expect(result.sources).toEqual([{ characterId: 1, journal: 'ok', contracts: 'ok' }]);
    expect(result.payments).toHaveLength(2);
  });

  it('marks a thrown read failed, not skipped', async () => {
    loadWalletJournalWithStatus.mockRejectedValue(new Error('offline'));
    loadContracts.mockResolvedValue(ok([]));

    const result = await loadMadePaymentsWithStatus([1]);

    expect(result.sources[0]).toEqual({ characterId: 1, journal: 'failed', contracts: 'ok' });
  });
});

describe('missingPaymentEndpoints', () => {
  const base: MadePaymentSources = { characterId: 1, journal: 'ok', contracts: 'ok' };

  it('names only the skipped sources', () => {
    expect(missingPaymentEndpoints(base)).toEqual([]);
    expect(missingPaymentEndpoints({ ...base, journal: 'failed' })).toEqual([]);
    expect(missingPaymentEndpoints({ ...base, contracts: 'skipped-no-permission' })).toEqual([
      'getCharacterContracts',
    ]);
    expect(
      missingPaymentEndpoints({
        ...base,
        journal: 'skipped-no-permission',
        contracts: 'skipped-no-permission',
      })
    ).toEqual(['getCharacterWalletJournal', 'getCharacterContracts']);
  });
});
