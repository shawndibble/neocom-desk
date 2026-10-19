import { describe, expect, it } from 'vitest';
import { buildBookView, planStatementRun, type BookViewInput } from './bookView';
import {
  FORFEIT_NO_REPLY_DAYS,
  forfeitAllowed,
  mailableAfterClose,
  planCloseAccount,
} from './closeAccount';
import type { ObservedMiningEntry } from './types';

const CORP = 98000001;
const GUEST_CORP = 98000999;
const ORE = 45490;

const guestEntry = (date: string, quantity: number): ObservedMiningEntry => ({
  characterId: 50,
  recordedCorporationId: GUEST_CORP,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

/** 1,000 ISK per unit at 10%: 1,000 units owe 100,000. */
function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 5_000_000,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [guestEntry('2026-08-10', 1000), guestEntry('2026-09-17', 500)],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}

describe('forfeitAllowed', () => {
  it('needs a recorded consent in words', () => {
    expect(forfeitAllowed({ kind: 'consent', note: 'agreed in a convo' }, '2026-09-18')).toBe(true);
    expect(forfeitAllowed({ kind: 'consent', note: '   ' }, '2026-09-18')).toBe(false);
  });

  it('allows a no-reply forfeit only after 90 days', () => {
    expect(FORFEIT_NO_REPLY_DAYS).toBe(90);
    expect(forfeitAllowed({ kind: 'no-reply', askedAt: '2026-06-20' }, '2026-09-18')).toBe(true);
    expect(forfeitAllowed({ kind: 'no-reply', askedAt: '2026-06-21' }, '2026-09-18')).toBe(false);
  });
});

describe('planCloseAccount', () => {
  it('issues one final Statement over everything Billable, ignoring the minimum', () => {
    const view = buildBookView(input());
    const plan = planCloseAccount(view, 'solo:50')!;
    // The 17 Sep day is Billable (synced after its grace) and is billed too.
    expect(plan.statement?.amount).toBe(150_000);
    expect(plan.statement?.minerId).toBe('solo:50');
    expect(plan.statement?.characterIds).toEqual([50]);
    expect(plan.owedAfter).toBe(150_000);
    expect(plan.creditAfter).toBe(0);
  });

  it('has no final Statement when nothing is left to bill', () => {
    const view = buildBookView(input({ entries: [] }));
    expect(planCloseAccount(view, 'solo:50')).toBeUndefined();
  });

  it('refunds credit left after the final Statement', () => {
    const view = buildBookView(
      input({
        payments: [
          { id: 'p', minerId: 'solo:50', amount: 1_000_000, at: '2026-09-01T00:00:00Z' } as never,
        ],
      })
    );
    const plan = planCloseAccount(view, 'solo:50')!;
    expect(plan.owedAfter).toBe(0);
    expect(plan.creditAfter).toBe(1_000_000 - 150_000);
  });
});

describe('a closed Miner', () => {
  const closed = {
    id: 'solo:50',
    characterIds: [50],
    mainCharacterId: 50,
    closedAt: '2026-09-18T14:00:00Z',
  };

  it('is skipped by the Statement run', () => {
    const open = planStatementRun(buildBookView(input({ minimumStatement: 0 })), {
      start: '2026-08-01',
      end: '2026-08-31',
    });
    expect(open.lines).toHaveLength(1);
    const view = buildBookView(input({ minimumStatement: 0, miners: [closed] }));
    expect(planStatementRun(view, { start: '2026-08-01', end: '2026-08-31' }).lines).toHaveLength(
      0
    );
  });

  it('mails the final Statement and earlier ones, nothing issued after', () => {
    const miner = { ...closed, finalStatementId: 'final_solo:50' };
    expect(
      mailableAfterClose(miner, { id: 'final_solo:50', issuedAt: '2026-09-18T14:00:01Z' })
    ).toBe(true);
    expect(mailableAfterClose(miner, { id: 'old', issuedAt: '2026-09-01T00:00:00Z' })).toBe(true);
    expect(mailableAfterClose(miner, { id: 'later', issuedAt: '2026-10-01T00:00:00Z' })).toBe(
      false
    );
    expect(mailableAfterClose(undefined, { id: 'x', issuedAt: '2030-01-01T00:00:00Z' })).toBe(true);
  });
});
