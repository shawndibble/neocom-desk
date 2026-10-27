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
    // Moved into Pochven in 2020 and reads -1.0 in the current SDE, so it is
    // not a highsec chokepoint any more — that traffic is what made Uedama.
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
    // Uedama reads 0.505, which rounds to a 0.5 highsec system. Being a
    // chokepoint is about traffic, not about the security band.
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
