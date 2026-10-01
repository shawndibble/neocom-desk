import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type NotificationFeedRecord } from '@/db';
import { loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { WALLET_TRANSACTIONS_LAG_MS } from '@/engine/market/fillTime';
import type { WalletTransaction } from '@/esi/endpoints';
import { isProvisionalFill, type ProvisionalFillRow } from './feed';
import { planFillSettlements, settleFillTimes } from './fillTimeSettle';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);
vi.mock('@/features/character/wallet', () => ({ loadWalletTransactionsWithStatus: vi.fn() }));

const HOUR = 3_600_000;
const CHAR = 7;
const OBSERVED = 1_700_000_000_000;
const WALLET = new Set(['esi-wallet.read_character_wallet.v1']);

const fillMatch = {
  typeId: 34,
  locationId: 60003760,
  price: 5.5,
  issuedMs: OBSERVED - 10 * HOUR,
  quantity: 100,
};

function fillRow(overrides: Partial<NotificationFeedRecord> = {}): ProvisionalFillRow {
  return {
    id: `${CHAR}:marketOrderFilled:1`,
    characterId: CHAR,
    eventId: 'marketOrderFilled',
    title: 'Sell order filled',
    body: '100 x Tritanium',
    firedAt: OBSERVED,
    fillMatch,
    ...overrides,
  } as ProvisionalFillRow;
}

const sale = {
  dateMs: OBSERVED - 2 * HOUR,
  typeId: 34,
  locationId: 60003760,
  unitPrice: 5.5,
  quantity: 100,
  isBuy: false,
};

function esiSale(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 1,
    date: new Date(OBSERVED - 2 * HOUR).toISOString(),
    location_id: 60003760,
    type_id: 34,
    unit_price: 5.5,
    quantity: 100,
    client_id: 99,
    is_buy: false,
    journal_ref_id: 5,
    is_personal: true,
    ...overrides,
  };
}

function walletResult(rows: WalletTransaction[], fetchedAtMs: number) {
  return {
    cached: { data: rows, fetchedAt: new Date(fetchedAtMs), fromCache: true, truncated: false },
    needsReauth: false,
  };
}

describe('isProvisionalFill', () => {
  it('is a fill row with match details and no settlement yet', () => {
    expect(isProvisionalFill(fillRow())).toBe(true);
    expect(isProvisionalFill(fillRow({ fillSettledAt: OBSERVED }))).toBe(false);
    expect(isProvisionalFill(fillRow({ fillMatch: undefined }))).toBe(false);
    expect(isProvisionalFill(fillRow({ eventId: 'newMail' }))).toBe(false);
  });
});

describe('planFillSettlements', () => {
  const now = OBSERVED + 5 * 60_000;

  it('re-dates a row to the sale once the wallet shows it', () => {
    const wallet = { kind: 'transactions' as const, rows: [sale], fetchedAtMs: now };
    expect(planFillSettlements([fillRow()], wallet, now)).toEqual([
      { id: fillRow().id, firedAt: OBSERVED - 2 * HOUR },
    ]);
  });

  it('leaves a row for a later poll while the wallet may not show the sale yet', () => {
    const wallet = { kind: 'transactions' as const, rows: [], fetchedAtMs: now };
    expect(planFillSettlements([fillRow()], wallet, now)).toEqual([]);
  });

  it('settles at the noticed time when provably fresh data has no matching sale', () => {
    const fetchedAtMs = OBSERVED + WALLET_TRANSACTIONS_LAG_MS;
    const wallet = { kind: 'transactions' as const, rows: [], fetchedAtMs };
    expect(planFillSettlements([fillRow()], wallet, fetchedAtMs)).toEqual([
      { id: fillRow().id, firedAt: OBSERVED },
    ]);
  });

  it('settles at the noticed time when the wallet can never be read', () => {
    expect(planFillSettlements([fillRow()], { kind: 'unavailable' }, now)).toEqual([
      { id: fillRow().id, firedAt: OBSERVED },
    ]);
  });

  it('leaves everything on a transient wallet failure', () => {
    expect(planFillSettlements([fillRow()], { kind: 'retry' }, now)).toEqual([]);
  });

  it('settles a row older than the transactions endpoint reaches, at the noticed time', () => {
    const later = OBSERVED + 31 * 24 * HOUR;
    const wallet = { kind: 'transactions' as const, rows: [], fetchedAtMs: OBSERVED };
    expect(planFillSettlements([fillRow()], wallet, later)).toEqual([
      { id: fillRow().id, firedAt: OBSERVED },
    ]);
  });
});

describe('settleFillTimes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.notificationFeed.clear();
  });

  it('re-dates the row, marks it settled, and queues it to sync again', async () => {
    await db.notificationFeed.put({ ...fillRow(), syncedAt: OBSERVED });
    vi.mocked(loadWalletTransactionsWithStatus).mockResolvedValue(
      walletResult([esiSale()], OBSERVED + 60_000)
    );

    await settleFillTimes(CHAR, WALLET, OBSERVED + 60_000);

    const row = await db.notificationFeed.get(fillRow().id);
    expect(row?.firedAt).toBe(OBSERVED - 2 * HOUR);
    expect(row?.fillSettledAt).toBe(OBSERVED + 60_000);
    expect(row).not.toHaveProperty('syncedAt');
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR);
  });

  it('does not read the wallet when no row is provisional', async () => {
    await db.notificationFeed.put({ ...fillRow(), fillSettledAt: OBSERVED });
    await settleFillTimes(CHAR, WALLET, OBSERVED + 60_000);
    expect(loadWalletTransactionsWithStatus).not.toHaveBeenCalled();
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('settles without reading the wallet when the wallet scope was never granted', async () => {
    await db.notificationFeed.put(fillRow());
    await settleFillTimes(CHAR, new Set(), OBSERVED + 60_000);
    expect(loadWalletTransactionsWithStatus).not.toHaveBeenCalled();
    const row = await db.notificationFeed.get(fillRow().id);
    expect(row?.firedAt).toBe(OBSERVED);
    expect(row?.fillSettledAt).toBe(OBSERVED + 60_000);
  });

  it('leaves another Character’s provisional row alone', async () => {
    await db.notificationFeed.put(fillRow({ id: 'other', characterId: CHAR + 1 }));
    await settleFillTimes(CHAR, WALLET, OBSERVED + 60_000);
    expect(loadWalletTransactionsWithStatus).not.toHaveBeenCalled();
    expect((await db.notificationFeed.get('other'))?.fillSettledAt).toBeUndefined();
  });
});
