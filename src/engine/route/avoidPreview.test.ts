import { describe, expect, it } from 'vitest';
import { avoidPreviewOutcome, candidateAvoid } from './avoidPreview';

describe('candidateAvoid', () => {
  it('adds the system to the avoid list the route already uses, sorted', () => {
    expect(
      candidateAvoid({
        effective: [30, 10],
        systemId: 20,
        avoidList: [10],
        avoidListEnabled: true,
      })
    ).toEqual([10, 20, 30]);
  });

  it('does not list a system twice', () => {
    expect(
      candidateAvoid({ effective: [10, 20], systemId: 20, avoidList: [20], avoidListEnabled: true })
    ).toEqual([10, 20]);
  });

  it('brings in the whole stored list when the switch is off, since turning it on does', () => {
    expect(
      candidateAvoid({
        effective: [5],
        systemId: 20,
        avoidList: [40, 10],
        avoidListEnabled: false,
      })
    ).toEqual([5, 10, 20, 40]);
  });
});

describe('avoidPreviewOutcome', () => {
  it('gives the new jump count and its change from the current route', () => {
    expect(
      avoidPreviewOutcome({
        currentJumps: 33,
        route: [1, 2, 3, 4],
        systemId: 9,
        lowestSecurity: 0.5,
      })
    ).toEqual({ jumps: 3, jumpDelta: -30, lowestSecurity: 0.5, stillCrosses: false });
  });

  it('says the route still crosses the system when there is no way around it', () => {
    expect(
      avoidPreviewOutcome({ currentJumps: 2, route: [1, 2, 3], systemId: 2, lowestSecurity: 0.9 })
    ).toEqual({ jumps: 2, jumpDelta: 0, lowestSecurity: 0.9, stillCrosses: true });
  });

  it('keeps an equal-length detour apart from no way around', () => {
    expect(
      avoidPreviewOutcome({ currentJumps: 2, route: [1, 7, 3], systemId: 2, lowestSecurity: null })
        .stillCrosses
    ).toBe(false);
  });
});
