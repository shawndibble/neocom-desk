import { describe, expect, it } from 'vitest';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import { nearestLowsecSystem, reactionLocationState } from './reactionLocation';

describe('reactionLocationState', () => {
  it('flags a highsec location', () => {
    expect(reactionLocationState('highsec', true)).toBe('highsec');
  });
  it('accepts lowsec and nullsec', () => {
    expect(reactionLocationState('lowsec', true)).toBe('ok');
    expect(reactionLocationState('nullsec', true)).toBe('ok');
  });
  it('treats no chosen system as unset, never highsec', () => {
    expect(reactionLocationState('highsec', false)).toBe('unset');
  });
});

describe('nearestLowsecSystem', () => {
  // 1 - 2 - 3 - 4 ; 1 high, 2 high, 3 low, 4 low
  const graph: JumpGraph = new Map([
    [1, [2]],
    [2, [1, 3]],
    [3, [2, 4]],
    [4, [3]],
  ]);
  const sec: Record<number, number> = { 1: 0.9, 2: 0.6, 3: 0.3, 4: 0.2 };
  const securityOf = (id: number) => sec[id];

  it('finds the closest lowsec system from the current system', () => {
    expect(nearestLowsecSystem(graph, 1, null, securityOf)).toEqual({ systemId: 3, jumps: 2 });
  });
  it('falls back to the build system when the current one is unknown', () => {
    expect(nearestLowsecSystem(graph, null, 4, securityOf)).toEqual({ systemId: 4, jumps: 0 });
  });
  it('returns null with nothing to start from, no graph, or no lowsec reachable', () => {
    expect(nearestLowsecSystem(graph, null, null, securityOf)).toBeNull();
    expect(nearestLowsecSystem(undefined, 1, null, securityOf)).toBeNull();
    expect(nearestLowsecSystem(graph, 1, null, () => 0.9)).toBeNull();
  });
  it('bands on the shown security: 0.45 displays as 0.5 and is highsec', () => {
    sec[3] = 0.45;
    expect(nearestLowsecSystem(graph, 1, null, securityOf)).toEqual({ systemId: 4, jumps: 3 });
  });
  it('breaks ties by lower system id', () => {
    const g: JumpGraph = new Map([
      [1, [5, 3]],
      [3, [1]],
      [5, [1]],
    ]);
    expect(nearestLowsecSystem(g, 1, null, (id) => (id === 1 ? 0.9 : 0.3))).toEqual({
      systemId: 3,
      jumps: 1,
    });
  });
});
