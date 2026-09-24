import { describe, it, expect } from 'vitest';
import { orderNextAction } from './orderNextAction';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderVerdict } from './orderVerdict';

const BASE_ROW: OpenOrderRow = {
  orderId: 101,
  characterId: 1,
  characterName: 'Alpha',
  typeId: 34,
  typeName: 'Tritanium',
  isBuyOrder: false,
  price: 500,
  volumeRemain: 10,
  volumeTotal: 10,
  locationId: 60003760,
  regionId: 10000002,
  stationName: 'Jita IV - Moon 4',
  issued: new Date().toISOString(),
  durationDays: 90,
  expiry: { expiresAt: Date.now() + 60 * 86_400_000, daysLeft: 60, expired: false },
  floor: null,
  costBasis: null,
  station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
  deepUndercut: null,
  worstScope: null,
  problem: 'healthy',
  problems: ['healthy'],
  iskTiedUp: 5000,
  belowFloor: false,
  frequentlyUndercut: false,
};

describe('orderNextAction', () => {
  it('raises to the verdict price for raisePrice', () => {
    const verdict: OrderVerdict = { kind: 'raisePrice', amount: 200, price: 700 };
    expect(orderNextAction(BASE_ROW, verdict)).toEqual({ kind: 'raisePrice', price: 700 });
  });

  it('matches at the verdict price for matchThem — not the raw rival price', () => {
    // The verdict's price is already the legal one-tick-under price
    // (`undercutPrice`, issue #1421); the headline must reuse it rather than
    // re-deriving the raw rival price, or it would disagree with the verdict
    // sentence that already states this exact figure.
    const verdict: OrderVerdict = { kind: 'matchThem', amount: 30, price: 449.9 };
    expect(orderNextAction(BASE_ROW, verdict)).toEqual({ kind: 'matchThem', price: 449.9 });
  });

  it('keeps the current price for letGo', () => {
    const verdict: OrderVerdict = { kind: 'letGo', amount: 30, price: 449.9 };
    expect(orderNextAction({ ...BASE_ROW, price: 500 }, verdict)).toEqual({
      kind: 'keepAt',
      price: 500,
    });
  });

  it('keeps the current price for leaveItAlone', () => {
    const verdict: OrderVerdict = { kind: 'leaveItAlone', amount: null, price: null };
    expect(orderNextAction({ ...BASE_ROW, price: 500 }, verdict)).toEqual({
      kind: 'keepAt',
      price: 500,
    });
  });

  it('falls back to badge advice for a raisePrice/matchThem verdict with a null price, never a mismatched one', () => {
    // A degenerate floor could in principle leave `verdict.price` null while
    // `verdict.kind` still says `raisePrice` — the headline above would keep
    // rendering that kind's text. Showing a different (cheapest-rival or
    // badge) price here would disagree with it; no Next step is the honest
    // fallback instead.
    const verdict: OrderVerdict = { kind: 'raisePrice', amount: 200, price: null };
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderNextAction(row, verdict)).toEqual({ kind: 'badgeAdvice' });
  });

  it('states the cheapest rival as a fact with no verdict and a known undercut, but advises no match', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderNextAction(row, null)).toEqual({ kind: 'cheapestRival', price: 450 });
  });

  it('falls back to the badge advice with no verdict and nothing else to say', () => {
    expect(orderNextAction(BASE_ROW, null)).toEqual({ kind: 'badgeAdvice' });
  });

  it('never carries a price for a buy order', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: 'station',
      station: { bestPrice: 520, beatsMe: true, gapIsk: 20, gapPct: 4 },
    };
    expect(orderNextAction(row, null)).toEqual({ kind: 'badgeAdvice' });
  });
});
