import { describe, it, expect } from 'vitest';
import {
  resolveFillTime,
  WALLET_TRANSACTIONS_LAG_MS,
  type FillMatch,
  type FillTransaction,
} from './fillTime';

const HOUR = 3_600_000;
const OBSERVED = 1_700_000_000_000;

const match: FillMatch = {
  typeId: 34,
  locationId: 60003760,
  price: 5.5,
  issuedMs: OBSERVED - 10 * HOUR,
  quantity: 100,
};

function txn(overrides: Partial<FillTransaction> = {}): FillTransaction {
  return {
    dateMs: OBSERVED - 2 * HOUR,
    typeId: 34,
    locationId: 60003760,
    unitPrice: 5.5,
    quantity: 100,
    isBuy: false,
    ...overrides,
  };
}

/** Fetched too soon after the fill was noticed to prove the final fill is in it. */
const STALE_FETCH = OBSERVED + 5 * 60_000;
/** Fetched long enough after the fill was noticed that ESI's cache must include it. */
const FRESH_FETCH = OBSERVED + WALLET_TRANSACTIONS_LAG_MS;

describe('resolveFillTime', () => {
  it('settles on the newest matching sale once the sales cover the whole order', () => {
    const rows = [
      txn({ dateMs: OBSERVED - 5 * HOUR, quantity: 40 }),
      txn({ dateMs: OBSERVED - 2 * HOUR, quantity: 60 }),
    ];
    expect(resolveFillTime(match, rows, OBSERVED, STALE_FETCH)).toEqual({
      status: 'settled',
      fillMs: OBSERVED - 2 * HOUR,
    });
  });

  it('waits while the sales so far fall short of the order and the data may predate the last fill', () => {
    const rows = [txn({ quantity: 40 })];
    expect(resolveFillTime(match, rows, OBSERVED, STALE_FETCH)).toEqual({ status: 'pending' });
  });

  it('settles on what it has once the data is provably newer than the fill (a re-priced order)', () => {
    // Fills before a price change carry the old price and no longer match;
    // the final fill is still at the current price.
    const rows = [txn({ quantity: 30 })];
    expect(resolveFillTime(match, rows, OBSERVED, FRESH_FETCH)).toEqual({
      status: 'settled',
      fillMs: OBSERVED - 2 * HOUR,
    });
  });

  it('reports unmatched when provably fresh data holds no matching sale', () => {
    expect(resolveFillTime(match, [], OBSERVED, FRESH_FETCH)).toEqual({ status: 'unmatched' });
  });

  it('stays pending with no matching sale while the data may still be stale', () => {
    expect(resolveFillTime(match, [], OBSERVED, STALE_FETCH)).toEqual({ status: 'pending' });
  });

  it.each([
    ['a buy', { isBuy: true }],
    ['another item', { typeId: 35 }],
    ['another station', { locationId: 60008494 }],
    ['another price', { unitPrice: 5.6 }],
    ['a sale before the order was issued', { dateMs: match.issuedMs - 1 }],
  ])('ignores %s', (_label, overrides) => {
    expect(resolveFillTime(match, [txn(overrides)], OBSERVED, FRESH_FETCH)).toEqual({
      status: 'unmatched',
    });
  });

  it('matches a price that differs only by floating-point noise', () => {
    expect(
      resolveFillTime(match, [txn({ unitPrice: 5.500000000001 })], OBSERVED, STALE_FETCH)
    ).toEqual({ status: 'settled', fillMs: OBSERVED - 2 * HOUR });
  });

  it('never dates the fill after the moment it was noticed', () => {
    expect(
      resolveFillTime(match, [txn({ dateMs: OBSERVED + 60_000 })], OBSERVED, STALE_FETCH)
    ).toEqual({ status: 'settled', fillMs: OBSERVED });
  });

  it('can settle early when a twin order (same item, price and station) also sold — known limitation', () => {
    // Indistinguishable without an order id on the transaction: the twin's
    // sales count toward this order's quantity. The date is still a real
    // sale of this item at this price, so it is close, not wild.
    const rows = [txn({ dateMs: OBSERVED - 3 * HOUR, quantity: 100 })];
    expect(resolveFillTime(match, rows, OBSERVED, STALE_FETCH)).toEqual({
      status: 'settled',
      fillMs: OBSERVED - 3 * HOUR,
    });
  });
});
