import { describe, expect, it } from 'vitest';
import { entryFromAssignments } from './assignmentEntry';

describe('entryFromAssignments', () => {
  it('sums ore lines per type across assignments, sorted by typeId', () => {
    const entry = entryFromAssignments(7, '2026-08-01', 3, [
      {
        oreLines: [
          { typeId: 20, quantity: 50 },
          { typeId: 10, quantity: 100 },
        ],
      },
      { oreLines: [{ typeId: 10, quantity: 20 }] },
    ]);

    expect(entry).toEqual({
      characterId: 7,
      date: '2026-08-01',
      solarSystemId: 3,
      oreLines: [
        { typeId: 10, quantity: 120 },
        { typeId: 20, quantity: 50 },
      ],
    });
  });
});
