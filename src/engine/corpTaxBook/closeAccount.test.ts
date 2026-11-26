import { describe, expect, it } from 'vitest';
import { buildBookView, type BookViewInput } from './bookView';
import { planNotices } from './lateNotices';
import { DEFAULT_NOTICE_RULES } from './notices';
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

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [guestEntry('2026-08-10', 1000), guestEntry('2026-09-17', 500)],
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
  it('sends one final notice of every unpaid day, whatever the notice rules say', () => {
    const view = buildBookView(input());
    const plan = planCloseAccount(view, 'solo:50')!;
    expect(plan.notice?.listed).toBe(150_000);
    expect(plan.notice).toMatchObject({ kind: 'final', minerId: 'solo:50', characterIds: [50] });
    expect(plan.owedAfter).toBe(150_000);
    expect(plan.creditAfter).toBe(0);
  });

  it('has nothing to plan for a Miner the book does not hold', () => {
    const view = buildBookView(input({ entries: [] }));
    expect(planCloseAccount(view, 'solo:50')).toBeUndefined();
  });

  it('refunds the credit held, with no final notice when nothing is owed', () => {
    const view = buildBookView(
      input({
        payments: [
          { id: 'p', minerId: 'solo:50', amount: 1_000_000, at: '2026-09-01T00:00:00Z' } as never,
        ],
      })
    );
    const plan = planCloseAccount(view, 'solo:50')!;
    expect(plan.notice).toBeUndefined();
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

  it('gets no more late notices', () => {
    const rules = { ...DEFAULT_NOTICE_RULES, minimum: 0 };
    expect(planNotices(buildBookView(input()), rules)).toHaveLength(1);
    expect(planNotices(buildBookView(input({ miners: [closed] })), rules)).toHaveLength(0);
  });

  it('mails the final notice and earlier ones, nothing issued after', () => {
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
