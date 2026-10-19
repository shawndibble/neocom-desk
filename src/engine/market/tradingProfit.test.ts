import { describe, expect, it } from 'vitest';
import { realizedMargins } from './realizedMargin';
import { marginsByItem, sumBrokerFees, sumMargins, type SaleFill } from './tradingProfit';
import type { RealizedMargin } from './realizedMargin';
import type { WalletTrade } from './walletCostBasis';

const margin = (value: number): RealizedMargin => ({ unitCost: 1, salesTax: 0, margin: value });
const sale = (transactionId: number, date: string, typeId = 34): SaleFill => ({
  transactionId,
  date,
  typeId,
  isBuy: false,
});

describe('sumMargins', () => {
  it('totals the matched sales and counts matched against all sales', () => {
    const fills = [
      sale(1, '2026-01-01T10:00:00Z'),
      sale(2, '2026-01-01T11:00:00Z'),
      sale(3, '2026-01-02T11:00:00Z'),
      { ...sale(4, '2026-01-02T12:00:00Z'), isBuy: true },
    ];
    const margins = new Map([
      [1, margin(100)],
      [2, margin(-30)],
    ]);
    expect(sumMargins(fills, margins)).toEqual({ margin: 70, matched: 2, sales: 3 });
  });

  it('is zero over no sales', () => {
    expect(sumMargins([], new Map())).toEqual({ margin: 0, matched: 0, sales: 0 });
  });
});

describe('marginsByItem', () => {
  it('sums matched margins per item, best first, with sale counts', () => {
    const fills = [sale(1, '2026-01-01T10:00:00Z', 34), sale(2, '2026-01-01T10:00:00Z', 35)];
    const margins = new Map([
      [1, margin(10)],
      [2, margin(50)],
    ]);
    expect(marginsByItem(fills, margins).map((r) => [r.typeId, r.margin, r.sales])).toEqual([
      [35, 50, 1],
      [34, 10, 1],
    ]);
  });
});

describe('sumBrokerFees', () => {
  const entry = (ref_type: string, amount: number | undefined, date: string) => ({
    ref_type,
    amount,
    date,
  });
  it('adds the broker fee lines in the window as a positive total', () => {
    const journal = [
      entry('brokers_fee', -100, '2026-01-02T00:00:00Z'),
      entry('brokers_fee', -50, '2026-01-03T00:00:00Z'),
      entry('transaction_tax', -999, '2026-01-02T00:00:00Z'),
      entry('brokers_fee', -7, '2025-12-01T00:00:00Z'),
      entry('brokers_fee', undefined, '2026-01-02T00:00:00Z'),
    ];
    expect(sumBrokerFees(journal, Date.parse('2026-01-01'), Date.parse('2026-01-31'))).toBe(150);
  });
});

describe('pooled FIFO', () => {
  const trade = (over: Partial<WalletTrade>): WalletTrade => ({
    transactionId: 1,
    date: '2026-01-01T00:00:00Z',
    typeId: 34,
    quantity: 10,
    unitPrice: 100,
    isBuy: true,
    isPersonal: true,
    ...over,
  });
  it('gives a sale of an alt-bought stack a margin only when both are in one pool', () => {
    const altBuy = trade({ transactionId: 1 });
    const mainSale = trade({
      transactionId: 2,
      date: '2026-01-02T00:00:00Z',
      isBuy: false,
      unitPrice: 150,
    });
    const tax = new Map([[2, 0]]);
    expect(realizedMargins([mainSale], tax).size).toBe(0);
    expect(realizedMargins([altBuy, mainSale], tax).get(2)?.margin).toBe(500);
  });
});

describe('sumBrokerFees malformed dates', () => {
  it('skips a fee line whose date does not parse', () => {
    const journal = [
      { ref_type: 'brokers_fee', amount: -100, date: '2026-01-02T00:00:00Z' },
      { ref_type: 'brokers_fee', amount: -50, date: 'garbage' },
    ];
    expect(sumBrokerFees(journal, Date.parse('2026-01-01'), Date.parse('2026-01-31'))).toBe(100);
  });
});
