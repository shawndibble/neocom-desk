import { describe, expect, it } from 'vitest';
import { dueCheckpoints } from './accountRecords';
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

/** A November visit: October closed (through 31 Oct once 31 days have passed). */
function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-12-05T14:00:00Z',
    startDate: '2026-09-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-12-05T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-09-01' }],
    entries: [entry(1, '2026-10-05'), entry(1, '2026-11-10')],
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

describe('dueCheckpoints (B2)', () => {
  it('closes a Miner through the last month 31 days gone, every day billable and saved-priced', () => {
    const due = dueCheckpoints(buildBookView(input()), at);
    expect(due.map((c) => [c.minerId, c.through])).toEqual([['solo:1', '2026-10-31']]);
  });

  it('writes none while a day up to it is priced at a live price', () => {
    const view = buildBookView(
      input({
        pricesOn: (date) => ({
          prices: new Map([[ORE, 1000]]),
          sources: new Map([[ORE, date <= '2026-10-31' ? ('live' as const) : ('saved' as const)]]),
        }),
      })
    );
    expect(dueCheckpoints(view, at)).toEqual([]);
  });

  it('writes none while a day up to it is not billable yet', () => {
    // The last sync read through 20 Oct: the days after it are not billable, the 31st included.
    const view = buildBookView(input({ lastSyncedAt: '2026-10-20T12:00:00Z' }));
    expect(dueCheckpoints(view, at)).toEqual([]);
  });
});
