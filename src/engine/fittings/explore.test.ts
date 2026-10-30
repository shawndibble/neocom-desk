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

  // SDE names: 1910 is Virus Strength, 1909 is Virus Coherence (a Data Analyzer II: 30 and 60).
  it('reads the best analyzer: strength, coherence, fastest cycle', () => {
    const explore = extractExplore(
      [item(1), item(2)],
      [result({ 1910: 60, 1909: 40, 73: 10_000 }), result({ 1910: 70, 1909: 30, 73: 8_000 })]
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

  it('reads strength off Virus Strength, not Virus Coherence', () => {
    // A Data Analyzer II on a hull with no hacking bonus.
    const explore = extractExplore([item()], [result({ 1910: 30, 1909: 60, 73: 10_000 })]);
    expect(explore.hacking).toEqual({ strength: 30, coherence: 60, cycleSeconds: 10 });
  });

  it('does not count a Mining Survey Chipset (its crit bonus is not a survey range)', () => {
    expect(extractExplore([item()], [result({ 6050: 0.05 })])).toEqual(NO_EXPLORE);
  });

  it('ignores drones and offline modules', () => {
    expect(extractExplore([item(1, 'drone_bay')], [result({ 1910: 60 })]).modules).toBe(0);
    expect(extractExplore([item()], [result({ 1910: 60 }, 'offline')]).modules).toBe(0);
  });
});
