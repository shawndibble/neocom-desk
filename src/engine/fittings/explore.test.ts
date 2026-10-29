import { describe, expect, it } from 'vitest';
import { extractExplore, NO_EXPLORE } from './explore';

const item = (typeId = 1, slot = 'high') => ({ type_id: typeId, slot: { type: slot } });
const result = (attrs: Record<number, number>, state = 'active') => ({
  state,
  attributes: new Map(Object.entries(attrs).map(([id, value]) => [Number(id), { value }])),
});

describe('extractExplore', () => {
  it('is empty for a fit with no explorer module', () => {
    expect(extractExplore([item()], [result({ 73: 5000 })])).toEqual(NO_EXPLORE);
  });

  it('reads the best analyzer: strength, coherence, fastest cycle', () => {
    const explore = extractExplore(
      [item(1), item(2)],
      [result({ 1909: 60, 1910: 40, 73: 10_000 }), result({ 1909: 70, 1910: 30, 73: 8_000 })]
    );
    expect(explore.modules).toBe(2);
    expect(explore.hacking).toEqual({ strength: 70, coherence: 40, cycleSeconds: 8 });
    expect(explore.analyzers).toEqual([
      { strength: 60, coherence: 40, cycleSeconds: 10 },
      { strength: 70, coherence: 30, cycleSeconds: 8 },
    ]);
  });

  it('sums scan array bonuses, duration and deviation as cuts', () => {
    const explore = extractExplore(
      [item(1), item(2), item(3)],
      [result({ 1906: -20 }), result({ 1905: -20 }), result({ 1907: 10 })]
    );
    expect(explore.modules).toBe(3);
    expect(explore.scanning).toEqual({ strength: 10, duration: 20, deviation: 20 });
  });

  it('counts a probe launcher (takes scan probes) as an explorer module with no figure', () => {
    const explore = extractExplore([item()], [result({ 604: 479 })]);
    expect(explore.modules).toBe(1);
    expect(explore.analyzers).toEqual([]);
  });

  it('ignores drones and offline modules', () => {
    expect(extractExplore([item(1, 'drone_bay')], [result({ 1909: 60 })]).modules).toBe(0);
    expect(extractExplore([item()], [result({ 1909: 60 }, 'offline')]).modules).toBe(0);
  });
});
