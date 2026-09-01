import { describe, it, expect } from 'vitest';
import { jumpsAwayFromRoute } from './jumpsAway';

describe('jumpsAwayFromRoute', () => {
  it('is 0 when the route is a single system (already there)', () => {
    expect(jumpsAwayFromRoute([30000142])).toEqual({ kind: 'known', jumps: 0 });
  });

  it('is one less than the number of waypoints (origin and destination both count as stops)', () => {
    expect(jumpsAwayFromRoute([30000142, 30002053, 30002187])).toEqual({
      kind: 'known',
      jumps: 2,
    });
  });

  it('is unknown with reason noRoute when no route could be resolved', () => {
    expect(jumpsAwayFromRoute(null)).toEqual({ kind: 'unknown', reason: 'noRoute' });
  });

  it('is unknown with reason noRoute for an empty waypoint list (ESI always includes at least the origin)', () => {
    expect(jumpsAwayFromRoute([])).toEqual({ kind: 'unknown', reason: 'noRoute' });
  });
});
