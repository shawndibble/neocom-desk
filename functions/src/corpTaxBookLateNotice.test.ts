import { describe, it, expect } from 'vitest';
import {
  finalNoticeId,
  isFinalNoticeId,
  lateNoticeRefusal,
  noticesOfDocs,
  legacyStatementDocOf,
  listedKeys,
  paymentCode,
  minerPaymentCode,
  lateNoticeFromStatementDoc,
  lateNoticeStanding,
  type LateNoticeDayState,
  lastNoticedDay,
  noticedDates,
  reminderAllowed,
  adjustmentLineKey,
  lineKey,
  noticeSpan,
} from './corpTaxBookLateNotice.js';

/** A late notice as `issueStatement` stores it today, in `corps/{id}/statements`. */
const storedNotice = {
  id: 'notice_2026-11-01_solo:9001_2026-11-18',
  minerId: 'solo:9001',
  code: 'MT00AB12',
  kind: 'notice',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-03',
  coversFrom: '2026-11-01',
  coversThrough: '2026-11-03',
  issuedAt: '2026-11-18T09:00:00.000Z',
  issuedBy: 77,
  hubId: 'jita',
  oreForm: 'compressed',
  amount: 3_000_000,
  characterIds: [9001],
  lines: [
    {
      kind: 'mined',
      date: '2026-11-01',
      chargeKey: 'c1',
      characterId: 9001,
      structureId: 1000,
      oreLines: [{ typeId: 46280, quantity: 100 }],
      unitPrices: { 46280: 1000 },
      estimatedValue: 100_000,
      tax: 1_000_000,
    },
    {
      kind: 'correction',
      date: '2026-11-03',
      adjustmentId: 'a1',
      oreLines: [],
      estimatedValue: 0,
      tax: 2_000_000,
    },
  ],
  mailsSent: 2,
  lastMailedAt: '2026-11-19T09:00:00.000Z',
  remindersStopped: true,
  manualRemindersSent: 1,
  minerName: 'Ore Pilot',
  corporationName: 'Rock Co',
  refineryNames: { '1000': 'Athanor X' },
  uids: ['char:9001', 'char:9002'],
};

describe('lateNoticeFromStatementDoc', () => {
  it('keeps what a notice asked and drops the calendar Statement fields', () => {
    const notice = lateNoticeFromStatementDoc(storedNotice);
    expect(notice).toEqual({
      id: storedNotice.id,
      minerId: 'solo:9001',
      characterIds: [9001],
      kind: 'late',
      issuedAt: '2026-11-18T09:00:00.000Z',
      issuedBy: 77,
      code: 'MT00AB12',
      pricing: { hubId: 'jita', oreForm: 'compressed' },
      uids: ['char:9001', 'char:9002'],
      lines: [
        {
          kind: 'mined',
          date: '2026-11-01',
          key: 'c1',
          characterId: 9001,
          structureId: 1000,
          oreLines: [{ typeId: 46280, quantity: 100 }],
          unitPrices: { 46280: 1000 },
          estimatedValue: 100_000,
          tax: 1_000_000,
        },
        {
          kind: 'correction',
          date: '2026-11-03',
          key: 'adjustment:a1',
          oreLines: [],
          estimatedValue: 0,
          tax: 2_000_000,
        },
      ],
      listed: 3_000_000,
      mail: { sent: 2, lastAt: '2026-11-19T09:00:00.000Z', manualSent: 1, remindersStopped: true },
      names: {
        minerName: 'Ore Pilot',
        corporationName: 'Rock Co',
        refineryNames: { '1000': 'Athanor X' },
      },
    });
    for (const gone of ['periodStart', 'periodEnd', 'coversFrom', 'coversThrough', 'amount'])
      expect(JSON.stringify(notice)).not.toContain(gone);
  });

  it('reads a closing account’s notice as final, and a never-mailed one with no mail yet', () => {
    const notice = lateNoticeFromStatementDoc({
      ...storedNotice,
      id: 'final_solo:9001',
      mailsSent: undefined,
      lastMailedAt: undefined,
      remindersStopped: undefined,
      manualRemindersSent: undefined,
    });
    expect(notice?.kind).toBe('final');
    expect(notice?.mail).toEqual({ sent: 0, manualSent: 0, remindersStopped: false });
  });

  it('prints no code rather than an empty one, which would match every donation', () => {
    expect(lateNoticeFromStatementDoc({ ...storedNotice, code: '' })).not.toHaveProperty('code');
  });

  it('is undefined for a calendar Statement, which a notice is not', () => {
    expect(lateNoticeFromStatementDoc({ ...storedNotice, kind: undefined })).toBeUndefined();
  });

  it('keys a line with neither a charge nor an adjustment by its date, as the planner did', () => {
    const notice = lateNoticeFromStatementDoc({
      ...storedNotice,
      lines: [{ kind: 'mined', date: '2026-11-02', oreLines: [], estimatedValue: 0, tax: 5 }],
    });
    expect(notice?.lines[0]?.key).toBe('adjustment:2026-11-02');
  });
});

describe('listedKeys', () => {
  it('is every line any notice listed, so a later notice lists each day only once', () => {
    const a = lateNoticeFromStatementDoc(storedNotice)!;
    expect([...listedKeys([a])].sort()).toEqual(['adjustment:a1', 'c1']);
  });
});

describe('lateNoticeStanding', () => {
  const day = (over: Partial<LateNoticeDayState>): LateNoticeDayState => ({
    tax: 1_000_000,
    held: false,
    credited: 0,
    forgiven: 0,
    writtenOff: 0,
    remaining: 1_000_000,
    settled: false,
    ...over,
  });
  const notice = lateNoticeFromStatementDoc(storedNotice)!;

  it('is settled once every day it listed is, whatever money paid them', () => {
    const byDay = new Map([
      ['2026-11-01', day({ credited: 1_000_000, remaining: 0, settled: true })],
      ['2026-11-03', day({ tax: 2_000_000, credited: 2_000_000, remaining: 0, settled: true })],
    ]);
    expect(lateNoticeStanding(notice, byDay)).toEqual({
      due: 3_000_000,
      credited: 3_000_000,
      forgiven: 0,
      writtenOff: 0,
      remaining: 0,
      settled: true,
    });
  });

  it('owes its share of a day it listed part of, and leaves a held day out', () => {
    const byDay = new Map([
      // The notice listed 1M of a day that has since grown to 4M, 2M of it paid.
      ['2026-11-01', day({ tax: 4_000_000, credited: 2_000_000, remaining: 2_000_000 })],
      ['2026-11-03', day({ tax: 2_000_000, held: true, remaining: 2_000_000 })],
    ]);
    expect(lateNoticeStanding(notice, byDay)).toEqual({
      due: 1_000_000,
      held: 2_000_000,
      credited: 500_000,
      forgiven: 0,
      writtenOff: 0,
      remaining: 500_000,
      settled: false,
    });
  });

  it('reads a day that no longer bills anything as paid', () => {
    expect(lateNoticeStanding(notice, new Map()).settled).toBe(true);
  });
});

describe('minerPaymentCode', () => {
  it('is one stable code per Miner, in the MT format a notice prints', () => {
    expect(minerPaymentCode('solo:9001')).toMatch(/^MT[0-9A-Z]{6}$/);
    expect(minerPaymentCode('solo:9001')).toBe(minerPaymentCode('solo:9001'));
    expect(minerPaymentCode('solo:9001')).not.toBe(minerPaymentCode('solo:9002'));
  });
});

describe('paymentCode', () => {
  it('is the code a notice mailed before this module printed', () => {
    // Pinned: a donation carrying an already-mailed code must still be recognised.
    expect(paymentCode('notice_2026-11-01_solo:9001_2026-11-18')).toBe('MTB32P85');
    expect(paymentCode('x')).toMatch(/^MT[0-9A-Z]{6}$/);
  });
});

describe('finalNoticeId', () => {
  it('is a safe doc id that reads back as a final notice', () => {
    expect(finalNoticeId('solo:9001')).toBe('final_solo:9001');
    expect(finalNoticeId('group/a b')).toBe('final_group_a_b');
    expect(lateNoticeFromStatementDoc({ ...storedNotice, id: finalNoticeId('g') })?.kind).toBe(
      'final'
    );
  });
});

describe('legacyStatementDocOf', () => {
  it('writes back a doc an older tab reads as the same notice', () => {
    const notice = lateNoticeFromStatementDoc(storedNotice)!;
    expect(lateNoticeFromStatementDoc(legacyStatementDocOf(notice))).toEqual(notice);
  });

  it('keeps the legacy fields an older tab requires', () => {
    const doc = legacyStatementDocOf(lateNoticeFromStatementDoc(storedNotice)!);
    expect(doc).toMatchObject({
      kind: 'notice',
      periodStart: '2026-11-01',
      coversThrough: '2026-11-03',
      hubId: 'jita',
      oreForm: 'compressed',
      amount: 3_000_000,
    });
    expect((doc.lines as { adjustmentId?: string }[])[1]?.adjustmentId).toBe('a1');
  });
});

describe('isFinalNoticeId', () => {
  it('names only the ids closing an account gives', () => {
    expect(isFinalNoticeId(finalNoticeId('solo:5'))).toBe(true);
    expect(isFinalNoticeId('final_anything')).toBe(true);
    expect(isFinalNoticeId('notice_solo:5')).toBe(false);
  });
});

describe('lateNoticeRefusal: two tabs never mail the same days', () => {
  const line = (key: string) => ({ key });
  const earlier = [
    { issuedAt: '2026-11-10T00:00:00.000Z', kind: 'late' as const, lines: [line('a')] },
  ];
  const now = '2026-11-20T00:00:00.000Z';

  it('sends a notice of new days once the cooldown has passed', () => {
    expect(lateNoticeRefusal({ lines: [line('b')] }, earlier, 7, now)).toBeNull();
    expect(lateNoticeRefusal({ lines: [line('b')] }, [], 7, now)).toBeNull();
  });

  it('refuses a day another notice already listed', () => {
    expect(lateNoticeRefusal({ lines: [line('b'), line('a')] }, earlier, 7, now)).toBe(
      'already-listed'
    );
  });

  it('refuses one inside the cooldown after the last notice', () => {
    expect(lateNoticeRefusal({ lines: [line('b')] }, earlier, 14, now)).toBe('notice-cooldown');
    // A final notice closed an account: it starts no cooldown.
    expect(
      lateNoticeRefusal({ lines: [line('b')] }, [{ ...earlier[0], kind: 'final' }], 14, now)
    ).toBeNull();
  });
});

describe('noticesOfDocs: the notices among lateNotices docs', () => {
  it('keeps each notice without its stamp, and drops anything that is no notice', () => {
    const current = {
      ...lateNoticeFromStatementDoc(storedNotice)!,
      mail: { sent: 1, manualSent: 0, remindersStopped: false },
      updatedAt: { seconds: 1 },
    };
    const [notice] = noticesOfDocs([current]);
    expect(notice).not.toHaveProperty('updatedAt');
    expect(notice.lines).toEqual(current.lines);
    expect(noticesOfDocs([{ id: 'x' }])).toEqual([]);
  });
});

describe('noticedDates / lastNoticedDay: the days a Late notice listed', () => {
  const listed = (...lines: { kind: string; date: string; characterId?: number }[]) => ({
    lines: lines as { kind: 'mined' | 'late-ore' | 'correction'; date: string }[],
  });
  const notices = [
    listed(
      { kind: 'mined', date: '2026-10-05', characterId: 1 },
      { kind: 'late-ore', date: '2026-10-02', characterId: 2 },
      { kind: 'correction', date: '2026-10-20' }
    ),
    listed({ kind: 'mined', date: '2026-10-07', characterId: 1 }),
  ];

  it('is each mined or late-ore line’s day, never a correction’s or a day between', () => {
    expect([...noticedDates(notices)].sort()).toEqual(['2026-10-02', '2026-10-05', '2026-10-07']);
    expect(lastNoticedDay(notices)).toBe('2026-10-07');
    expect(lastNoticedDay([])).toBeNull();
  });

  it("is one Character's lines alone when asked", () => {
    expect([...noticedDates(notices, 2)]).toEqual(['2026-10-02']);
  });
});

describe('reminderAllowed: one manual reminder after the Miner stopped them (D27)', () => {
  it('allows any while reminders run, and one once they are stopped', () => {
    expect(reminderAllowed({ sent: 3, manualSent: 5, remindersStopped: false })).toBe(true);
    expect(reminderAllowed({ sent: 3, manualSent: 0, remindersStopped: true })).toBe(true);
    expect(reminderAllowed({ sent: 3, manualSent: 1, remindersStopped: true })).toBe(false);
  });
});

describe('noticeSpan / adjustmentLineKey', () => {
  it("is a notice's first and last listed day, or its issue day with no line", () => {
    const lines = [{ date: '2026-10-02' }, { date: '2026-10-09' }];
    expect(noticeSpan({ lines, issuedAt: '2026-11-01T00:00:00Z' })).toEqual({
      first: '2026-10-02',
      last: '2026-10-09',
    });
    expect(noticeSpan({ lines: [], issuedAt: '2026-11-01T00:00:00Z' })).toEqual({
      first: '2026-11-01',
      last: '2026-11-01',
    });
  });

  it("is the key a correction's line carries, as lineKey spells it", () => {
    expect(adjustmentLineKey('a1')).toBe('adjustment:a1');
    expect(adjustmentLineKey('a1')).toBe(lineKey({ adjustmentId: 'a1', date: '2026-10-01' }));
  });
});
