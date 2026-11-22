import { describe, it, expect } from 'vitest';
import {
  bookTakenTypeIds,
  computeOwnership,
  findDuplicateAssignmentIds,
  unreportedClaims,
  type CoveringAssignment,
  type DuplicateCandidate,
} from './ownership';
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

describe('computeOwnership — ore released to a corporation book stays released', () => {
  const entry: OreLine[] = [
    { typeId: A, quantity: 100 },
    { typeId: B, quantity: 50 },
  ];
  const released = (
    id: string,
    lines: OreLine[],
    releasedTypeIds: number[]
  ): CoveringAssignment => ({ id, oreLines: lines, releasedTypeIds });

  it('does not grow a released type back into the sole collector, nor offer it as unassigned', () => {
    const result = computeOwnership(entry, [released('a', [{ typeId: A, quantity: 100 }], [B])]);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 100 }]);
  });

  it('still grows a type that was not released', () => {
    const result = computeOwnership(
      [...entry, { typeId: C, quantity: 5 }],
      [released('a', [{ typeId: A, quantity: 100 }], [B])]
    );
    expect(result.ownedLines.get('a')).toEqual([
      { typeId: A, quantity: 100 },
      { typeId: C, quantity: 5 },
    ]);
  });

  it('applies to the whole entry: a release on one side hides the type from the other too', () => {
    const result = computeOwnership(entry, [
      released('a', [{ typeId: A, quantity: 100 }], [B]),
      covering('b', [{ typeId: C, quantity: 1 }]),
    ]);
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

function candidate(
  id: string,
  oreLines: OreLine[],
  overrides: Partial<DuplicateCandidate> = {}
): DuplicateCandidate {
  return { id, oreLines, payeeId: 'p1', taxPct: 5, status: 'paid', ...overrides };
}

describe('computeOwnership — a paid Assignment never grows (paid stays paid, ADR 0024)', () => {
  const paid = (id: string, oreLines: OreLine[], collectsGrowth?: boolean): CoveringAssignment => ({
    ...covering(id, oreLines, collectsGrowth),
    status: 'paid',
  });

  it('leaves growth on a sole paid Assignment unassigned, its own type or a new one', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 40 },
    ];
    const result = computeOwnership(entry, [paid('a', [{ typeId: A, quantity: 100 }])]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 100 }]);
    expect(result.unassigned).toEqual([
      { typeId: A, quantity: 50 },
      { typeId: B, quantity: 40 },
    ]);
  });

  it('leaves growth unassigned when the flagged collector of a split is paid, and the other side stays put', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 130 },
      { typeId: C, quantity: 5 },
    ];
    const result = computeOwnership(entry, [
      paid('keep', [{ typeId: A, quantity: 60 }], true),
      covering('moved', [{ typeId: A, quantity: 40 }]),
    ]);
    expect(result.ownedLines.get('keep')).toEqual([{ typeId: A, quantity: 60 }]);
    expect(result.ownedLines.get('moved')).toEqual([{ typeId: A, quantity: 40 }]);
    expect(result.unassigned).toEqual([
      { typeId: A, quantity: 30 },
      { typeId: C, quantity: 5 },
    ]);
  });

  it('leaves growth unassigned on a type only a paid Assignment claims in an unflagged split', () => {
    const entry: OreLine[] = [
      { typeId: A, quantity: 120 },
      { typeId: B, quantity: 30 },
    ];
    const result = computeOwnership(entry, [
      paid('p', [{ typeId: A, quantity: 100 }]),
      covering('o', [{ typeId: B, quantity: 20 }]),
    ]);
    expect(result.ownedLines.get('p')).toEqual([{ typeId: A, quantity: 100 }]);
    expect(result.ownedLines.get('o')).toEqual([{ typeId: B, quantity: 30 }]);
    expect(result.unassigned).toEqual([{ typeId: A, quantity: 20 }]);
  });

  it('still lets a dismissed sole Assignment collect, so its growth flags for review', () => {
    const entry: OreLine[] = [{ typeId: A, quantity: 150 }];
    const result = computeOwnership(entry, [
      { ...covering('d', [{ typeId: A, quantity: 100 }]), status: 'dismissed' },
    ]);
    expect(result.ownedLines.get('d')).toEqual([{ typeId: A, quantity: 150 }]);
    expect(result.unassigned).toEqual([]);
  });
});

describe('computeOwnership — a kept side claiming ore ESI has not reported yet', () => {
  // Corp A is owed 130 of A (the client's figure); ESI reports 100 so far.
  // Corp B moved nothing yet but collects later ore.
  const split = [covering('a', [{ typeId: A, quantity: 130 }]), covering('b', [], true)];

  it('gives the collector nothing until ESI reports past the claim', () => {
    const result = computeOwnership([{ typeId: A, quantity: 120 }], split);
    expect(result.unassigned).toEqual([]);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 130 }]);
    expect(result.ownedLines.get('b')).toEqual([]);
  });

  it('routes only the ore past the claim to the collector', () => {
    const result = computeOwnership([{ typeId: A, quantity: 145 }], split);
    expect(result.ownedLines.get('a')).toEqual([{ typeId: A, quantity: 130 }]);
    expect(result.ownedLines.get('b')).toEqual([{ typeId: A, quantity: 15 }]);
  });
});

describe('unreportedClaims', () => {
  it("lists the part of an Assignment's claim ESI has not reported yet", () => {
    const entry = [
      { typeId: A, quantity: 110 },
      { typeId: B, quantity: 40 },
    ];
    const claims = [
      covering('a', [
        { typeId: A, quantity: 130 },
        { typeId: B, quantity: 40 },
      ]),
      covering('b', [{ typeId: A, quantity: 0 }], true),
    ];
    expect(unreportedClaims(entry, claims, 'a')).toEqual([
      { typeId: A, claimed: 130, reported: 110 },
    ]);
  });

  it("counts the other sides' claims first, and a type ESI has not reported at all", () => {
    const entry = [{ typeId: A, quantity: 100 }];
    const claims = [
      covering('a', [
        { typeId: A, quantity: 80 },
        { typeId: C, quantity: 5 },
      ]),
      covering('b', [{ typeId: A, quantity: 30 }]),
    ];
    expect(unreportedClaims(entry, claims, 'a')).toEqual([
      { typeId: A, claimed: 80, reported: 70 },
      { typeId: C, claimed: 5, reported: 0 },
    ]);
  });

  it('is empty once ESI has caught up', () => {
    expect(
      unreportedClaims(
        [{ typeId: A, quantity: 140 }],
        [covering('a', [{ typeId: A, quantity: 130 }])],
        'a'
      )
    ).toEqual([]);
  });
});

describe('findDuplicateAssignmentIds', () => {
  const entry: OreLine[] = [{ typeId: A, quantity: 100 }];

  it('flags two identical records that each hold the whole entry', () => {
    const dupes = findDuplicateAssignmentIds(entry, [
      candidate('x', [{ typeId: A, quantity: 100 }]),
      candidate('y', [{ typeId: A, quantity: 100 }]),
    ]);
    expect([...dupes].sort()).toEqual(['x', 'y']);
  });

  it('does not flag identical halves that together equal the entry (a split moved back)', () => {
    const dupes = findDuplicateAssignmentIds(entry, [
      candidate('x', [{ typeId: A, quantity: 50 }]),
      candidate('y', [{ typeId: A, quantity: 50 }]),
    ]);
    expect(dupes).toEqual([]);
  });

  it('does not flag a split between two payees', () => {
    const dupes = findDuplicateAssignmentIds(entry, [
      candidate('x', [{ typeId: A, quantity: 60 }]),
      candidate('y', [{ typeId: A, quantity: 40 }], { payeeId: 'p2' }),
    ]);
    expect(dupes).toEqual([]);
  });

  it('does not flag a lone record even when the ledger shrank below it', () => {
    const dupes = findDuplicateAssignmentIds(
      [{ typeId: A, quantity: 80 }],
      [candidate('x', [{ typeId: A, quantity: 100 }])]
    );
    expect(dupes).toEqual([]);
  });

  it('does not flag two records on different terms', () => {
    const dupes = findDuplicateAssignmentIds(entry, [
      candidate('x', [{ typeId: A, quantity: 100 }]),
      candidate('y', [{ typeId: A, quantity: 100 }], { taxPct: 8 }),
    ]);
    expect(dupes).toEqual([]);
  });

  it('ignores dismissed records', () => {
    const dupes = findDuplicateAssignmentIds(entry, [
      candidate('x', [{ typeId: A, quantity: 100 }]),
      candidate('y', [{ typeId: A, quantity: 100 }], { status: 'dismissed' }),
    ]);
    expect(dupes).toEqual([]);
  });

  it('does not let an over-claim on one type flag an identical pair on another', () => {
    const dupes = findDuplicateAssignmentIds(
      [
        { typeId: A, quantity: 100 },
        { typeId: B, quantity: 10 },
      ],
      [
        candidate('x', [{ typeId: A, quantity: 50 }]),
        candidate('y', [{ typeId: A, quantity: 50 }]),
        candidate('z', [{ typeId: B, quantity: 30 }], { payeeId: 'p2' }),
      ]
    );
    expect(dupes).toEqual([]);
  });
});

describe('bookTakenTypeIds', () => {
  const entry: OreLine[] = [
    { typeId: A, quantity: 100 },
    { typeId: B, quantity: 50 },
  ];

  it('names a type the form no longer offers, because a book took it', () => {
    expect(bookTakenTypeIds(entry, [], [{ typeId: A, quantity: 100 }])).toEqual([B]);
  });

  it('names a type the book took only part of', () => {
    expect(
      bookTakenTypeIds(
        entry,
        [],
        [
          { typeId: A, quantity: 100 },
          { typeId: B, quantity: 20 },
        ]
      )
    ).toEqual([B]);
  });

  it('names nothing when the form offers everything no Assignment holds', () => {
    expect(
      bookTakenTypeIds(
        entry,
        [covering('x', [{ typeId: A, quantity: 100 }])],
        [{ typeId: B, quantity: 50 }]
      )
    ).toEqual([]);
  });

  it('ignores ore another Assignment already holds', () => {
    expect(
      bookTakenTypeIds(
        entry,
        [covering('x', [{ typeId: B, quantity: 50 }])],
        [{ typeId: A, quantity: 100 }]
      )
    ).toEqual([]);
  });
});
