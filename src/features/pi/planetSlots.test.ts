import { describe, it, expect } from 'vitest';
import { planetSlots } from './planetSlots';

describe('planetSlots', () => {
  it('gives one planet per trained level, plus the one every capsuleer starts with', () => {
    // Reported bug: the app asserted six planets flat. A pilot at
    // Interplanetary Consolidation IV can run five.
    expect(planetSlots(4)).toEqual({ slots: 5, assumed: false });
  });

  it('reaches six only at level V', () => {
    expect(planetSlots(5)).toEqual({ slots: 6, assumed: false });
  });

  it('gives one planet to a pilot who has never trained it', () => {
    expect(planetSlots(0)).toEqual({ slots: 1, assumed: false });
  });

  it('keeps a confident zero distinct from no skill data', () => {
    // Same distinction `customsRateSource` and `maxColonyBudget` draw: an
    // untrained pilot is a fact, a pilot whose `/skills` never loaded is not.
    // Both get one slot; only the first may be shown as fact.
    expect(planetSlots(null)).toEqual({ slots: 1, assumed: true });
  });

  it('never reports more than the game allows', () => {
    expect(planetSlots(9).slots).toBe(6);
  });

  it('never reports fewer than the one slot a colony needs', () => {
    expect(planetSlots(-3).slots).toBe(1);
  });
});
