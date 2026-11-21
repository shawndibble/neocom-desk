import { describe, expect, it } from 'vitest';
import { billableStoredRows, minedSinceStart, storedRowsWanted } from './corpTaxBookMatchRows.js';

const miners = [{ id: 'g1', characterIds: [10, 11] }];
const row = (characterId: number, date: string, quantity = 5, sourceCorporationId?: number) => ({
  characterId,
  date,
  quantity,
  ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
});

describe('minedSinceStart: the Miners who mined what the book bills', () => {
  it('names each Miner with ore on or after the book’s start', () => {
    const rows = [row(10, '2026-10-02'), row(20, '2026-09-30'), row(30, '2026-10-05', 0)];
    expect([...minedSinceStart(rows, miners, '2026-10-01')]).toEqual(['g1']);
  });
});

describe('storedRowsWanted: which stored rows a donation is matched against', () => {
  it('every Character of a held donation’s Miner and of a sender’s, from the start', () => {
    const wanted = storedRowsWanted({
      held: [
        { characterId: 10, at: '2026-10-05T00:00:00Z' },
        // Paid before the book started: nothing it paid is billed.
        { characterId: 40, at: '2026-09-01T00:00:00Z' },
      ],
      senders: [20],
      miners,
      startDate: '2026-10-01',
    });
    expect([...wanted]).toEqual([
      [10, '2026-10-01'],
      [11, '2026-10-01'],
      [20, '2026-10-01'],
    ]);
  });
});

describe('billableStoredRows', () => {
  it('keeps a wanted Character’s rows from its day, a moon owner’s only on a covered day', () => {
    const wanted = new Map([[10, '2026-10-01']]);
    const rows = [
      row(10, '2026-09-30'),
      row(10, '2026-10-02'),
      row(10, '2026-10-03', 5, 77),
      row(10, '2026-10-20', 5, 77),
      row(20, '2026-10-02'),
    ];
    const feeders = [{ corporationId: 77, coveragePeriods: [{ from: '2026-10-10' }] }];
    expect(billableStoredRows(rows, wanted, 1, feeders)).toEqual([rows[1], rows[3]]);
  });
});
