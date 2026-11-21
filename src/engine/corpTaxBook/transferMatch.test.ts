import { describe, expect, it } from 'vitest';
import type { TaxPayment } from './payments';
import { isSameTransfer, pairWithMadePayments, SAME_TRANSFER_MS } from './transferMatch';

const CORP = 98000001;
const ME = 90000001;

const held = { characterId: ME, amount: 1_000_000, at: '2026-11-10T12:00:00Z' };
const made = (over: Partial<Parameters<typeof isSameTransfer>[1]> = {}) => ({
  characterId: ME,
  amount: 1_000_000,
  date: '2026-11-10T12:00:00Z',
  ...over,
});

describe('isSameTransfer', () => {
  it('is the same sender, the same amount and the same few minutes', () => {
    expect(SAME_TRANSFER_MS).toBe(10 * 60_000);
    expect(isSameTransfer(held, made())).toBe(true);
    expect(isSameTransfer(held, made({ date: '2026-11-10T12:10:00Z' }))).toBe(true);
    expect(isSameTransfer(held, made({ date: '2026-11-10T11:50:00Z' }))).toBe(true);
  });

  it('is not once the time, the amount or the sender differs by more than the rule allows', () => {
    expect(isSameTransfer(held, made({ date: '2026-11-10T12:10:01Z' }))).toBe(false);
    expect(isSameTransfer(held, made({ amount: 1_000_000.99 }))).toBe(true);
    expect(isSameTransfer(held, made({ amount: 1_000_001 }))).toBe(false);
    expect(isSameTransfer(held, made({ characterId: ME + 1 }))).toBe(false);
  });
});

const payment = (id: string, at: string, over: Partial<TaxPayment> = {}): TaxPayment => ({
  id,
  minerId: `solo:${ME}`,
  characterId: ME,
  amount: 1_000_000,
  at,
  source: 'donation',
  ...over,
});
const journal = (refId: number, date: string, over: Record<string, unknown> = {}) => ({
  refId,
  characterId: ME,
  counterpartyId: CORP,
  amount: 1_000_000,
  date,
  method: 'donation',
  ...over,
});

describe('pairWithMadePayments', () => {
  it('pairs a donation with the member’s own journal entry for it', () => {
    const pairs = pairWithMadePayments(
      [payment('j1_900', '2026-11-10T12:01:00Z')],
      [journal(5150, '2026-11-10T12:00:00Z')],
      CORP
    );
    expect(pairs).toEqual(new Map([['j1_900', 5150]]));
  });

  it('pairs each of two donations with its own entry', () => {
    const pairs = pairWithMadePayments(
      [payment('a', '2026-11-10T12:00:00Z'), payment('b', '2026-11-11T12:00:00Z')],
      [journal(2, '2026-11-11T12:00:30Z'), journal(1, '2026-11-10T12:00:30Z')],
      CORP
    );
    expect(pairs).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ])
    );
  });

  it('never pairs an officer-recorded payment, another sender, another recipient or a contract', () => {
    const at = '2026-11-10T12:00:00Z';
    expect(
      pairWithMadePayments([payment('m', at, { source: 'manual' })], [journal(1, at)], CORP).size
    ).toBe(0);
    expect(
      pairWithMadePayments([payment('p', at)], [journal(1, at, { characterId: 2 })], CORP).size
    ).toBe(0);
    expect(
      pairWithMadePayments([payment('p', at)], [journal(1, at, { counterpartyId: 5 })], CORP).size
    ).toBe(0);
    expect(
      pairWithMadePayments([payment('p', at)], [journal(1, at, { method: 'contract' })], CORP).size
    ).toBe(0);
    expect(
      pairWithMadePayments([payment('p', at)], [journal(1, at, { refId: undefined })], CORP).size
    ).toBe(0);
  });

  it('draws no link when two entries match one donation equally well', () => {
    const at = '2026-11-10T12:00:00Z';
    expect(
      pairWithMadePayments([payment('p', at)], [journal(1, at), journal(2, at)], CORP).size
    ).toBe(0);
  });

  it('takes the nearer entry when two match one donation unequally', () => {
    const pairs = pairWithMadePayments(
      [payment('p', '2026-11-10T12:00:00Z')],
      [journal(1, '2026-11-10T12:06:00Z'), journal(2, '2026-11-10T12:01:00Z')],
      CORP
    );
    expect(pairs).toEqual(new Map([['p', 2]]));
  });

  it('draws no link when three entries tie, or the two nearest tie with a farther third', () => {
    const at = '2026-11-10T12:00:00Z';
    expect(
      pairWithMadePayments(
        [payment('p', at)],
        [journal(1, at), journal(2, at), journal(3, at)],
        CORP
      ).size
    ).toBe(0);
    expect(
      pairWithMadePayments(
        [payment('p', at)],
        [
          journal(1, '2026-11-10T12:02:00Z'),
          journal(2, '2026-11-10T11:58:00Z'),
          journal(3, '2026-11-10T12:07:00Z'),
        ],
        CORP
      ).size
    ).toBe(0);
  });

  it('pairs on the donation’s gross amount, whatever part an officer coded not tax', () => {
    const pairs = pairWithMadePayments(
      [payment('p', '2026-11-10T12:00:00Z', { notTaxAmount: 400_000 })],
      [journal(1, '2026-11-10T12:00:20Z')],
      CORP
    );
    expect(pairs).toEqual(new Map([['p', 1]]));
  });

  it('ignores an entry with no amount or no money out', () => {
    const at = '2026-11-10T12:00:00Z';
    expect(
      pairWithMadePayments(
        [payment('p', at)],
        [journal(1, at, { amount: null }), journal(2, at, { amount: 0 })],
        CORP
      ).size
    ).toBe(0);
  });

  it('keeps a link another donation could not take: only the entry both chose is dropped', () => {
    const pairs = pairWithMadePayments(
      [payment('a', '2026-11-10T12:00:00Z'), payment('b', '2026-11-10T12:08:00Z')],
      [journal(1, '2026-11-10T12:04:00Z'), journal(2, '2026-11-10T12:09:00Z')],
      CORP
    );
    // a: only entry 1 is near enough (4 min); b: entry 2 is nearer (1 min) than entry 1 (4 min).
    expect(pairs).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ])
    );
  });

  it('draws no link for two identical donations that share one entry', () => {
    const pairs = pairWithMadePayments(
      [payment('a', '2026-11-10T12:00:00Z'), payment('b', '2026-11-10T12:05:00Z')],
      [journal(1, '2026-11-10T12:02:00Z')],
      CORP
    );
    expect(pairs.size).toBe(0);
  });
});
