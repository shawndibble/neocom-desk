import { describe, expect, it } from 'vitest';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { bidTurnInPays, orderShowsTurnIn, turnInSurfaceLine } from './orderTurnIn';

const t = (key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`;

describe('orderShowsTurnIn', () => {
  it('shows the turn-in for a sell order filed under it, even when a real problem wins', () => {
    expect(orderShowsTurnIn(openOrderRow({ problems: ['turnInPays'] }))).toBe(true);
    expect(orderShowsTurnIn(openOrderRow({ problems: ['undercutStation', 'turnInPays'] }))).toBe(
      true
    );
  });

  it('hides it for a sell order the turn-in does not beat', () => {
    expect(orderShowsTurnIn(openOrderRow({ turnInEach: 400 }))).toBe(false);
  });

  it('shows it for any buy order', () => {
    expect(orderShowsTurnIn(openOrderRow({ isBuyOrder: true }))).toBe(true);
  });
});

describe('turnInSurfaceLine', () => {
  it('says what one item pays over a sell price, with the price', () => {
    const line = turnInSurfaceLine(t, openOrderRow({ price: 57_990 }), 60_000);
    expect(line).toContain('market.orders.turnIn.overPrice');
    expect(line).toContain('"gain":"~2K"');
    expect(line).toContain('57,990');
  });

  it('says what 100 pay over a bid', () => {
    const line = turnInSurfaceLine(t, openOrderRow({ isBuyOrder: true, price: 50_500 }), 60_000);
    expect(line).toContain('market.orders.turnIn.overBid');
    expect(line).toContain('"gain":"~950K"');
  });

  it('says nothing when the turn-in pays no more than the price', () => {
    expect(turnInSurfaceLine(t, openOrderRow({ isBuyOrder: true, price: 60_000 }), 60_000)).toBe(
      undefined
    );
  });
});

describe('bidTurnInPays', () => {
  it('is true only for a buy order whose reward each is above its bid', () => {
    expect(bidTurnInPays(openOrderRow({ isBuyOrder: true, price: 500, turnInEach: 600 }))).toBe(
      true
    );
    expect(bidTurnInPays(openOrderRow({ isBuyOrder: true, price: 600, turnInEach: 600 }))).toBe(
      false
    );
    expect(bidTurnInPays(openOrderRow({ isBuyOrder: true, price: 500 }))).toBe(false);
    expect(bidTurnInPays(openOrderRow({ price: 500, turnInEach: 600 }))).toBe(false);
  });
});
