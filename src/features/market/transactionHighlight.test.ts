import { describe, it, expect } from 'vitest';
import { highlightedTransactionId, parseHighlightTypeId } from './transactionHighlight';

function txn(overrides: Partial<Parameters<typeof highlightedTransactionId>[0][number]> = {}) {
  return {
    transaction_id: 1,
    type_id: 34,
    is_buy: false,
    date: '2026-09-08T12:00:00Z',
    ...overrides,
  };
}

describe('parseHighlightTypeId', () => {
  it('reads a positive integer', () => {
    expect(parseHighlightTypeId('34')).toEqual(34);
  });

  it('rejects anything that is not one, rather than searching for type NaN', () => {
    for (const raw of [null, '', 'abc', '0', '-5', '3.5', '1e3']) {
      expect(parseHighlightTypeId(raw)).toBeNull();
    }
  });
});

describe('highlightedTransactionId', () => {
  it('picks the newest sell of that type', () => {
    const rows = [
      txn({ transaction_id: 1, date: '2026-09-08T10:00:00Z' }),
      txn({ transaction_id: 2, date: '2026-09-08T14:00:00Z' }),
      txn({ transaction_id: 3, date: '2026-09-08T11:00:00Z' }),
    ];
    expect(highlightedTransactionId(rows, 34)).toEqual(2);
  });

  it('ignores buys — the alert only ever fires for a filled sell order', () => {
    const rows = [
      txn({ transaction_id: 1, is_buy: true, date: '2026-09-08T20:00:00Z' }),
      txn({ transaction_id: 2, date: '2026-09-08T09:00:00Z' }),
    ];
    expect(highlightedTransactionId(rows, 34)).toEqual(2);
  });

  it('ignores other items', () => {
    const rows = [
      txn({ transaction_id: 1, type_id: 35, date: '2026-09-08T20:00:00Z' }),
      txn({ transaction_id: 2, type_id: 34, date: '2026-09-08T09:00:00Z' }),
    ];
    expect(highlightedTransactionId(rows, 34)).toEqual(2);
  });

  it('breaks a tie on the higher transaction id, so the choice is not arrival order', () => {
    const rows = [
      txn({ transaction_id: 7, date: '2026-09-08T12:00:00Z' }),
      txn({ transaction_id: 9, date: '2026-09-08T12:00:00Z' }),
      txn({ transaction_id: 8, date: '2026-09-08T12:00:00Z' }),
    ];
    expect(highlightedTransactionId(rows, 9999999)).toBeNull();
    expect(highlightedTransactionId(rows, 34)).toEqual(9);
  });

  it('returns null when nothing matches, so a stale link pulses nothing', () => {
    expect(highlightedTransactionId([txn({ type_id: 35 })], 34)).toBeNull();
    expect(highlightedTransactionId([], 34)).toBeNull();
  });

  it('returns null for no requested type at all', () => {
    expect(highlightedTransactionId([txn()], null)).toBeNull();
  });
});
