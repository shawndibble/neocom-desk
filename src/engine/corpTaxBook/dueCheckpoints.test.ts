import { describe, expect, it } from 'vitest';
import { dueCheckpoints } from './runningAccountRecords';
import { buildBookView, type BookViewInput } from './bookView';
import type { ObservedMiningEntry } from './types';

const CORP = 98000001;
const ORE = 45490;
const entry = (characterId: number, date: string): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: CORP,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity: 1000 }],
});

/** A December visit: the lock date is 1 Oct, so a snapshot covers through 30 Sep. */
function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-12-05T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-12-05T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry(1, '2026-08-20'), entry(1, '2026-09-10'), entry(1, '2026-11-10')],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}
const at = { at: '2026-12-05T14:00:00Z', by: 7 };

describe('dueCheckpoints (a snapshot once per lock date)', () => {
  it('records a Miner through the day before the lock date, every day billable and saved-priced', () => {
    const due = dueCheckpoints(buildBookView(input()), at);
    expect(due.map((c) => [c.minerId, c.through])).toEqual([['solo:1', '2026-09-30']]);
  });

  it('records none for a Miner that has a snapshot at that date', () => {
    const [snapshot] = dueCheckpoints(buildBookView(input()), at);
    const view = buildBookView(input({ checkpoints: new Map([['solo:1', snapshot!]]) }));
    expect(dueCheckpoints(view, at)).toEqual([]);
  });

  it('records a new one over a snapshot from an earlier lock date', () => {
    const [older] = dueCheckpoints(buildBookView(input({ now: '2026-11-05T14:00:00Z' })), {
      ...at,
      at: '2026-11-05T14:00:00Z',
    });
    expect(older!.through).toBe('2026-08-31');
    const view = buildBookView(input({ checkpoints: new Map([['solo:1', older!]]) }));
    expect(dueCheckpoints(view, at).map((c) => c.through)).toEqual(['2026-09-30']);
  });

  it('records none while a day up to it is priced at a live price', () => {
    const view = buildBookView(
      input({
        pricesOn: (date) => ({
          prices: new Map([[ORE, 1000]]),
          sources: new Map([[ORE, date <= '2026-09-30' ? ('live' as const) : ('saved' as const)]]),
        }),
      })
    );
    expect(dueCheckpoints(view, at)).toEqual([]);
  });

  it('records none while a day up to it is not billable yet', () => {
    // The last sync read through 20 Sep: the days after it are not billable, the 30th included.
    const view = buildBookView(input({ lastSyncedAt: '2026-09-20T12:00:00Z' }));
    expect(dueCheckpoints(view, at)).toEqual([]);
  });
});

describe('a stored checkpoint that is no snapshot', () => {
  it('is not used, and a snapshot is recorded over it', () => {
    const [snapshot] = dueCheckpoints(buildBookView(input()), at);
    // Through 30 Sep but recorded on 5 Nov, while Sep was still open: the old strict cache.
    const stale = { ...snapshot!, at: '2026-11-05T14:00:00Z' };
    const view = buildBookView(input({ checkpoints: new Map([['solo:1', stale]]) }));
    expect(view.internals.byMiner.get('solo:1')?.account.input.checkpoint).toBeUndefined();
    expect(dueCheckpoints(view, at).map((c) => c.through)).toEqual(['2026-09-30']);
  });
});
