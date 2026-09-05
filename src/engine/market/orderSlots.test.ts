import { describe, it, expect } from 'vitest';
import type { TrainedSkill } from '@/engine/types';
import {
  BASE_ORDER_SLOTS,
  MAX_ORDER_SLOTS,
  ORDER_SLOT_SKILL_TYPE_IDS,
  maxMarketOrders,
} from './orderSlots';

function trained(levels: Record<number, number>): Map<number, TrainedSkill> {
  return new Map(
    Object.entries(levels).map(([typeID, level]) => [Number(typeID), { level, sp: 0 }])
  );
}

const [TRADE, RETAIL, WHOLESALE, TYCOON] = ORDER_SLOT_SKILL_TYPE_IDS;

describe('maxMarketOrders', () => {
  it('gives the untrained base with no trade skills at all', () => {
    expect(maxMarketOrders(new Map())).toBe(BASE_ORDER_SLOTS);
    expect(BASE_ORDER_SLOTS).toBe(5);
  });

  it('adds 4 slots per level of Trade', () => {
    expect(maxMarketOrders(trained({ [TRADE]: 1 }))).toBe(5 + 4);
    expect(maxMarketOrders(trained({ [TRADE]: 5 }))).toBe(5 + 20);
  });

  it('adds 8 per Retail, 16 per Wholesale, 32 per Tycoon level', () => {
    expect(maxMarketOrders(trained({ [RETAIL]: 3 }))).toBe(5 + 24);
    expect(maxMarketOrders(trained({ [WHOLESALE]: 2 }))).toBe(5 + 32);
    expect(maxMarketOrders(trained({ [TYCOON]: 4 }))).toBe(5 + 128);
  });

  it('sums every trade skill the character has', () => {
    expect(maxMarketOrders(trained({ [TRADE]: 5, [RETAIL]: 4, [WHOLESALE]: 1 }))).toBe(
      5 + 20 + 32 + 16
    );
  });

  it('caps at 305 with all four skills at V', () => {
    const all = trained({ [TRADE]: 5, [RETAIL]: 5, [WHOLESALE]: 5, [TYCOON]: 5 });
    expect(maxMarketOrders(all)).toBe(MAX_ORDER_SLOTS);
    expect(MAX_ORDER_SLOTS).toBe(305);
  });

  it('ignores skills that are not trade skills', () => {
    expect(maxMarketOrders(trained({ 3300: 5 }))).toBe(BASE_ORDER_SLOTS);
  });

  // ESI can report a level outside 0-5 only if a payload is malformed, but a
  // wrong slot total is worse than a clamped one: the tile reads as a limit.
  it('clamps a level outside 0-5 rather than trusting it', () => {
    expect(maxMarketOrders(trained({ [TRADE]: 9 }))).toBe(5 + 20);
    expect(maxMarketOrders(trained({ [TRADE]: -2 }))).toBe(BASE_ORDER_SLOTS);
  });
});
