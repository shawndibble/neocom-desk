import { describe, expect, it } from 'vitest';
import type { WalletTrade } from './walletCostBasis';
import { paidBasis, percentVsPaid } from './paidVsPrice';

let id = 0;
const trade = (isBuy: boolean, quantity: number, unitPrice: number, date: string): WalletTrade => ({
  transactionId: ++id,
  date,
  typeId: 34,
  quantity,
  unitPrice,
  isBuy,
  isPersonal: true,
});

describe('paidBasis', () => {
  it('averages the units still held, FIFO', () => {
    const basis = paidBasis({
      transactions: [
        trade(true, 10, 100, '2026-01-01T00:00:00Z'),
        trade(true, 10, 200, '2026-01-02T00:00:00Z'),
        trade(false, 10, 150, '2026-01-03T00:00:00Z'),
      ],
      typeId: 34,
    });
    expect(basis).toEqual({ unitCost: 200, units: 10 });
  });

  it('weights a mixed pool by quantity', () => {
    const basis = paidBasis({
      transactions: [
        trade(true, 10, 100, '2026-01-01T00:00:00Z'),
        trade(true, 30, 200, '2026-01-02T00:00:00Z'),
      ],
      typeId: 34,
    });
    expect(basis).toEqual({ unitCost: 175, units: 40 });
  });

  it('is null with no buys', () => {
    expect(paidBasis({ transactions: [], typeId: 34 })).toBeNull();
  });

  it('is null when everything bought was sold', () => {
    const basis = paidBasis({
      transactions: [
        trade(true, 5, 100, '2026-01-01T00:00:00Z'),
        trade(false, 5, 120, '2026-01-02T00:00:00Z'),
      ],
      typeId: 34,
    });
    expect(basis).toBeNull();
  });

  it('is null when a sell has no buy behind it (history short)', () => {
    const basis = paidBasis({
      transactions: [
        trade(false, 5, 120, '2026-01-02T00:00:00Z'),
        trade(true, 5, 100, '2026-01-03T00:00:00Z'),
      ],
      typeId: 34,
    });
    expect(basis).toBeNull();
  });

  it('ignores corp trades and other types', () => {
    const corp = { ...trade(true, 5, 100, '2026-01-01T00:00:00Z'), isPersonal: false };
    const other = { ...trade(true, 5, 100, '2026-01-01T00:00:00Z'), typeId: 35 };
    expect(paidBasis({ transactions: [corp, other], typeId: 34 })).toBeNull();
  });
});

describe('percentVsPaid', () => {
  it('is signed and rounded', () => {
    expect(percentVsPaid(150, 100)).toBe(50);
    expect(percentVsPaid(88, 100)).toBe(-12);
    expect(percentVsPaid(100.4, 100)).toBe(0);
  });

  it('is null without a usable price or cost', () => {
    expect(percentVsPaid(null, 100)).toBeNull();
    expect(percentVsPaid(100, 0)).toBeNull();
  });
});
