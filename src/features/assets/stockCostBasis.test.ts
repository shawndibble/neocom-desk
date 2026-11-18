import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type ProductionRunRecord } from '@/db';
import type { WalletTransaction } from '@/esi/endpoints';
import { hasWalletScope, loadWalletTransactionsHistory } from '@/features/character/wallet';
import { loadWalletArchiveInfo } from '@/features/character/walletArchive';
import { heldQuantityByType, loadStockCostBases } from './stockCostBasis';

vi.mock('@/features/character/wallet', () => ({
  hasWalletScope: vi.fn(),
  loadWalletTransactionsHistory: vi.fn(),
}));
vi.mock('@/features/character/walletArchive', () => ({ loadWalletArchiveInfo: vi.fn() }));

const CHARACTER_ID = 1;
const NOW = Date.parse('2026-06-01T00:00:00Z');

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

function wallet(data: WalletTransaction[]) {
  vi.mocked(loadWalletTransactionsHistory).mockResolvedValue({
    data,
    truncated: false,
    fetchedAt: new Date(),
    fromCache: true,
  } as Awaited<ReturnType<typeof loadWalletTransactionsHistory>>);
}

beforeEach(async () => {
  await db.productionRuns.clear();
  vi.mocked(hasWalletScope).mockReset().mockResolvedValue(true);
  vi.mocked(loadWalletTransactionsHistory).mockReset();
  vi.mocked(loadWalletArchiveInfo)
    .mockReset()
    .mockResolvedValue({ since: 0, gaps: [], unconfirmed: false });
});

describe('heldQuantityByType', () => {
  it('sums a type across every stack', () => {
    const held = heldQuantityByType([
      { type_id: 34, quantity: 5 },
      { type_id: 35, quantity: 1 },
      { type_id: 34, quantity: 7 },
    ]);
    expect(held.get(34)).toBe(12);
    expect(held.get(35)).toBe(1);
  });
});

describe('loadStockCostBases', () => {
  it('prices a type whose wallet buys cover every held unit across stacks', async () => {
    wallet([buy({ quantity: 20, unit_price: 150 })]);
    const bases = await loadStockCostBases(
      CHARACTER_ID,
      [
        { type_id: 34, quantity: 8 },
        { type_id: 34, quantity: 12 },
      ],
      NOW
    );
    expect(bases.get(34)?.unitCost).toBe(150);
  });

  it('leaves out a type holding more than the history explains', async () => {
    wallet([buy({ quantity: 20 })]);
    const bases = await loadStockCostBases(CHARACTER_ID, [{ type_id: 34, quantity: 21 }], NOW);
    expect(bases.has(34)).toBe(false);
  });

  it('adds a logged Production Run as a lot of its product', async () => {
    wallet([buy({ type_id: 99 })]);
    await db.productionRuns.put({
      id: 'r1',
      characterId: CHARACTER_ID,
      buildPlanId: 'p',
      productTypeID: 34,
      quantity: 10,
      materialCost: 400,
      jobFee: 100,
      totalCost: 500,
      loggedAt: Date.parse('2026-02-01T00:00:00Z'),
      updatedAt: 0,
    } satisfies ProductionRunRecord);
    const bases = await loadStockCostBases(CHARACTER_ID, [{ type_id: 34, quantity: 10 }], NOW);
    expect(bases.get(34)?.unitCost).toBe(50);
  });

  it('gives nothing without the wallet permission', async () => {
    vi.mocked(hasWalletScope).mockResolvedValue(false);
    const bases = await loadStockCostBases(CHARACTER_ID, [{ type_id: 34, quantity: 1 }], NOW);
    expect(bases.size).toBe(0);
  });

  it('distrusts a lot older than a gap in the archive', async () => {
    wallet([buy({ quantity: 10 })]);
    vi.mocked(loadWalletArchiveInfo).mockResolvedValue({
      since: 0,
      gaps: [[Date.parse('2026-02-01T00:00:00Z'), Date.parse('2026-03-01T00:00:00Z')]],
      unconfirmed: false,
    });
    const bases = await loadStockCostBases(CHARACTER_ID, [{ type_id: 34, quantity: 10 }], NOW);
    expect(bases.size).toBe(0);
  });

  it('ignores the open stretch since the last fetch', async () => {
    wallet([buy({ quantity: 10 })]);
    vi.mocked(loadWalletArchiveInfo).mockResolvedValue({
      since: 0,
      gaps: [[Date.parse('2026-05-30T00:00:00Z'), NOW]],
      unconfirmed: false,
    });
    const bases = await loadStockCostBases(CHARACTER_ID, [{ type_id: 34, quantity: 10 }], NOW);
    expect(bases.get(34)?.unitCost).toBe(100);
  });
});
