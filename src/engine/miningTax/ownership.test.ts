import { describe, it, expect } from 'vitest';
import { computeOwnership, type CoveringAssignment } from './ownership';
import type { OreLine } from './types';

const A = 45490;
const B = 45491;
const C = 45492;

function covering(id: string, oreLines: OreLine[], collectsGrowth?: boolean): CoveringAssignment {
  return collectsGrowth === undefined ? { id, oreLines } : { id, oreLines, collectsGrowth };
}

describe('computeOwnership — nothing assigned', () => {
  it('leaves the whole entry unassigned and owns nothing', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 100 }];
    const result = computeOwnership(entry, []);
    expect(result.unassigned).toEqual([{ typeId: A, quantity: 100 }]);
    expect(result.ownedLines.size).toBe(0);
  });
});

describe('computeOwnership — a sole Assignment is the collector', () => {
  it('owns the whole entry exactly when its snapshot matches', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 100 }];
    const result = computeOwnership(entry, [covering('a', [{ typeId: A, quantity: 100 }])]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 100 }]);
  });

  it('owns growth on its own type and a brand-new type — nothing becomes unassigned', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 50 },
    ];
    const result = computeOwnership(entry, [covering('a', [{ typeId: A, quantity: 100 }])]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('a')).toEqual([
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 50 },
    ]);
  });

  it('never shrinks a snapshot when the entry reports less than it', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 60 }];
    const result = computeOwnership(entry, [covering('a', [{ typeId: A, quantity: 100 }])]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 100 }]);
    expect(result.unassigned).toEqual([]);
  });
});

describe('computeOwnership — quantity split with a flagged collector', () => {
  it('splits one type by quantity between two Assignments with no residual', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 100 }];
    const result = computeOwnership(entry, [
      covering('keep', [{ typeId: A, quantity: 60 }], true),
      covering('new', [{ typeId: A, quantity: 40 }]),
    ]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('keep')).toEqual([{ typeId: A, quantity: 60 }]);
    expect(result.ownedLines.get('new')).toEqual([{ typeId: A, quantity: 40 }]);
  });

  it('routes every later residual — same type or a new one — to the collector only', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 130 },
      { typeId: B, quantity: 20 },
    ];
    const result = computeOwnership(entry, [
      covering('keep', [{ typeId: A, quantity: 60 }]),
      covering('new', [{ typeId: A, quantity: 40 }], true),
    ]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('keep')).toEqual([{ typeId: A, quantity: 60 }]);
    expect(result.ownedLines.get('new')).toEqual([
      { typeId: A, quantity: 70 },
      { typeId: B, quantity: 20 },
    ]);
  });
});

describe('computeOwnership — several Assignments and no collector (pre-flag split)', () => {
  it('grows a type claimed by exactly one Assignment into that Assignment', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 50 },
    ];
    const result = computeOwnership(entry, [
      covering('a', [{ typeId: A, quantity: 100 }]),
      covering('b', [{ typeId: B, quantity: 50 }]),
    ]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 150 }]);
    expect(result.ownedLines.get('b')).toEqual([{ typeId: B, quantity: 50 }]);
  });

  it('leaves a type nobody claims as an unassigned residual', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
      { typeId: C, quantity: 30 },
    ];
    const result = computeOwnership(entry, [
      covering('a', [{ typeId: A, quantity: 100 }]),
      covering('b', [{ typeId: B, quantity: 50 }]),
    ]);
    expect(result.unassigned).toEqual([{ typeId: C, quantity: 30 }]);
  });

  it('leaves growth on a type two Assignments share as unassigned until someone collects', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 130 }];
    const result = computeOwnership(entry, [
      covering('a', [{ typeId: A, quantity: 60 }]),
      covering('b', [{ typeId: A, quantity: 40 }]),
    ]);
    expect(result.unassigned).toEqual([{ typeId: A, quantity: 30 }]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 60 }]);
    expect(result.ownedLines.get('b')).toEqual([{ typeId: A, quantity: 40 }]);
  });
});
