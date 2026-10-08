import { describe, it, expect } from 'vitest';
import { sortClones, type SortableClone } from './clonesSort';
import type { JumpsAwayResult } from '@/engine/jumpsAway';

const clone = (id: string, over: Partial<SortableClone> = {}): SortableClone => ({
  id,
  locationId: Number(id.charCodeAt(0)),
  deltaSeconds: null,
  value: null,
  ...over,
});
const ids = (cs: readonly SortableClone[]) => cs.map((c) => c.id);

describe('sortClones', () => {
  it('puts the biggest saving first, unknown last', () => {
    const list = [
      clone('a', { deltaSeconds: 60 }),
      clone('b', { deltaSeconds: null }),
      clone('c', { deltaSeconds: -3600 }),
    ];
    expect(ids(sortClones(list, 'training', undefined))).toEqual(['c', 'a', 'b']);
  });

  it('puts the nearest first, unknown routes last', () => {
    const list = [clone('a'), clone('b'), clone('c')];
    const jumps = new Map<number, JumpsAwayResult>([
      [list[0].locationId, { kind: 'known', jumps: 9 }],
      [list[1].locationId, { kind: 'unknown', reason: 'noRoute' }],
      [list[2].locationId, { kind: 'known', jumps: 2 }],
    ]);
    expect(ids(sortClones(list, 'nearest', jumps))).toEqual(['c', 'a', 'b']);
    expect(ids(sortClones(list, 'nearest', undefined))).toEqual(['a', 'b', 'c']);
  });

  it('puts the most valuable first, unpriced last', () => {
    const list = [clone('a', { value: 5 }), clone('b'), clone('c', { value: 50 })];
    expect(ids(sortClones(list, 'value', undefined))).toEqual(['c', 'a', 'b']);
  });
});
