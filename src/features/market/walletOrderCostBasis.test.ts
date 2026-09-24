import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';
import { hasWalletScope, loadWalletTransactions } from '@/features/character/wallet';
import { loadWalletOrderCostBases } from './orderCostBasis';

vi.mock('@/features/character/wallet', () => ({
  hasWalletScope: vi.fn(),
  loadWalletTransactions: vi.fn(),
}));

const CHARACTER_ID = 1;

function order(over: Partial<MarketOrder> & Pick<MarketOrder, 'order_id'>): MarketOrder {
  return {
    type_id: 34,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    ...over,
  } as MarketOrder;
}

function buy(over: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 1,
    date: '2026-01-01T00:00:00Z',
    location_id: 1,
    type_id: 34,
    unit_price: 100,
    quantity: 10,
    client_id: 1,
    is_buy: true,
    journal_ref_id: 1,
    is_personal: true,
    ...over,
  };
}

function wallet(data: WalletTransaction[], truncated = false) {
  vi.mocked(loadWalletTransactions).mockResolvedValue({
    data,
    truncated,
    fetchedAt: new Date(),
    fromCache: true,
  } as Awaited<ReturnType<typeof loadWalletTransactions>>);
}

beforeEach(() => {
  vi.mocked(hasWalletScope).mockReset().mockResolvedValue(true);
  vi.mocked(loadWalletTransactions).mockReset();
});

describe('loadWalletOrderCostBases', () => {
  it('gives every unlinked sell order of a type the pooled unit cost', async () => {
    wallet([buy({ quantity: 20, unit_price: 150 })]);
    const { bases, gaps } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1 }), order({ order_id: 2 })],
      new Set()
    );
    expect(bases.get(1)).toMatchObject({ source: 'wallet', unitCost: 150, unitsCovered: 20 });
    expect(bases.get(2)?.unitCost).toBe(150);
    expect(gaps.size).toBe(0);
  });

  it('leaves excluded (linked) orders out of the pool', async () => {
    wallet([buy({ quantity: 10 })]);
    const { bases } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1 }), order({ order_id: 2 })],
      new Set([2])
    );
    expect(bases.has(1)).toBe(true);
    expect(bases.has(2)).toBe(false);
  });

  it('ignores buy and corporation orders', async () => {
    wallet([buy({ quantity: 100 })]);
    const { bases, gaps } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1, is_buy_order: true }), order({ order_id: 2, is_corporation: true })],
      new Set()
    );
    expect(bases.size + gaps.size).toBe(0);
    expect(loadWalletTransactions).not.toHaveBeenCalled();
  });

  it('reports a gap when the wallet covers only part of the units', async () => {
    wallet([buy({ quantity: 4 })], true);
    const { bases, gaps } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1 })],
      new Set()
    );
    expect(bases.size).toBe(0);
    expect(gaps.get(1)).toEqual({ kind: 'partial', coveredUnits: 4, pool: 10, truncated: true });
  });

  it('never reads the wallet without the scope', async () => {
    vi.mocked(hasWalletScope).mockResolvedValue(false);
    const { bases, gaps } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1 })],
      new Set()
    );
    expect(bases.size + gaps.size).toBe(0);
    expect(loadWalletTransactions).not.toHaveBeenCalled();
  });

  it('gives no basis when the wallet read fails', async () => {
    vi.mocked(loadWalletTransactions).mockRejectedValue(new Error('offline'));
    const { bases, gaps } = await loadWalletOrderCostBases(
      CHARACTER_ID,
      [order({ order_id: 1 })],
      new Set()
    );
    expect(bases.size + gaps.size).toBe(0);
  });
});
