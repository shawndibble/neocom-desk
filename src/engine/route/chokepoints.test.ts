import { describe, it, expect } from 'vitest';
import { GANK_CHOKEPOINTS, isGankChokepoint, chokepointsOnRoute } from '@/engine/route/chokepoints';

const UEDAMA = 30002768;
const TAMA = 30002813;
const JITA = 30000142;

describe('GANK_CHOKEPOINTS', () => {
  it('names the systems it holds, so a caller never re-resolves them', () => {
    expect(GANK_CHOKEPOINTS.get(UEDAMA)).toBe('Uedama');
    expect(GANK_CHOKEPOINTS.get(TAMA)).toBe('Tama');
  });

  it('leaves out Niarja, which every older guide still names', () => {
    expect(GANK_CHOKEPOINTS.has(30003504)).toBe(false);
  });
});

describe('isGankChokepoint', () => {
  it('recognises a chokepoint, and says nothing about an unplaced end', () => {
    expect(isGankChokepoint(UEDAMA)).toBe(true);
    expect(isGankChokepoint(JITA)).toBe(false);
    expect(isGankChokepoint(null)).toBe(false);
  });

  it('does not rest on security status', () => {
    expect(isGankChokepoint(UEDAMA)).toBe(true);
  });
});

describe('chokepointsOnRoute', () => {
  it('names them in the order they are flown', () => {
    expect(chokepointsOnRoute([JITA, UEDAMA, TAMA])).toEqual(['Uedama', 'Tama']);
  });

  it('is empty for a route that avoids them', () => {
    expect(chokepointsOnRoute([JITA])).toEqual([]);
    expect(chokepointsOnRoute([])).toEqual([]);
  });
});
