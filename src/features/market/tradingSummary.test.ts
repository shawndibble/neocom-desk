import { describe, expect, it } from 'vitest';
import type { WalletTransaction } from '@/esi/endpoints';
import { summarizeTrading, tradingWindow } from './tradingSummary';

function sale(id: number, date: string): WalletTransaction {
  return {
    transaction_id: id,
    date,
    location_id: 1,
    type_id: 34,
    unit_price: 10,
    quantity: 1,
    client_id: 1,
    is_buy: false,
    journal_ref_id: id,
    is_personal: true,
  };
}
const NO_DATES = { startDate: null, endDate: null };

describe('tradingWindow', () => {
  it('starts on the filter day, or the first fill day, and is open-ended without an end day', () => {
    const fills = [sale(1, '2026-01-05T10:00:00Z'), sale(2, '2026-01-03T10:00:00Z')];
    expect(tradingWindow(NO_DATES, fills).fromMs).toBe(Date.parse('2026-01-03T00:00:00Z'));
    expect(tradingWindow(NO_DATES, fills).toMs).toBe(Number.POSITIVE_INFINITY);
    const dated = tradingWindow({ startDate: '2026-01-04', endDate: '2026-01-04' }, fills);
    expect(dated.fromMs).toBe(Date.parse('2026-01-04T00:00:00Z'));
    expect(dated.toMs).toBe(Date.parse('2026-01-04T23:59:59.999Z'));
  });
});

describe('summarizeTrading', () => {
  const fills = [sale(1, '2026-01-05T10:00:00Z'), sale(2, '2026-01-06T10:00:00Z')];
  const margins = new Map([[1, { unitCost: 1, salesTax: 0, margin: 40 }]]);
  const journal = [
    { ref_type: 'brokers_fee', amount: -8, date: '2026-01-04T10:00:00Z' },
    { ref_type: 'brokers_fee', amount: -3, date: '2025-12-01T10:00:00Z' },
  ];

  it('totals margin, counts matches and sums the broker fees over the same dates', () => {
    const s = summarizeTrading(fills, margins, journal, NO_DATES, null);
    expect(s).toMatchObject({ margin: 40, matched: 1, sales: 2, brokerFees: 0 });
    const s2 = summarizeTrading(
      fills,
      margins,
      journal,
      { startDate: '2026-01-01', endDate: null },
      null
    );
    expect(s2.brokerFees).toBe(8);
  });

  it('reports the archive start only when it falls after the range starts', () => {
    const dates = { startDate: '2026-01-01', endDate: null };
    expect(
      summarizeTrading(fills, margins, journal, dates, Date.parse('2026-01-03T00:00:00Z'))
        .archiveSince
    ).toBe(Date.parse('2026-01-03T00:00:00Z'));
    expect(
      summarizeTrading(fills, margins, journal, dates, Date.parse('2025-06-01T00:00:00Z'))
        .archiveSince
    ).toBeNull();
  });

  it('counts the sales shown that have a gap, and their revenue', () => {
    const three = [...fills, { ...sale(3, '2026-01-07T10:00:00Z'), quantity: 5, unit_price: 20 }];
    const gaps = new Map<number, 'noBuy' | 'outside' | 'noTax'>([
      [2, 'noBuy'],
      [3, 'noTax'],
    ]);
    const s = summarizeTrading(three, margins, journal, NO_DATES, null, gaps);
    expect(s.uncosted).toEqual({ sales: 2, revenue: 10 + 100 });
  });

  it('reports no uncosted sales without gaps', () => {
    expect(summarizeTrading(fills, margins, journal, NO_DATES, null).uncosted).toEqual({
      sales: 0,
      revenue: 0,
    });
  });
});
