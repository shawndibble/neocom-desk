import { describe, it, expect } from 'vitest';
import {
  listedKeys,
  minerPaymentCode,
  noticeFromStatementDoc,
  noticeStanding,
  type NoticeDayState,
} from './corpTaxBookNotice.js';

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
};

describe('noticeFromStatementDoc', () => {
  it('keeps what a notice asked and drops the calendar Statement fields', () => {
    const notice = noticeFromStatementDoc(storedNotice);
    expect(notice).toEqual({
      id: storedNotice.id,
      minerId: 'solo:9001',
      characterIds: [9001],
      kind: 'late',
      issuedAt: '2026-11-18T09:00:00.000Z',
      issuedBy: 77,
      code: 'MT00AB12',
      lines: [
        { date: '2026-11-01', key: 'c1', characterId: 9001, structureId: 1000, tax: 1_000_000 },
        { date: '2026-11-03', key: 'adjustment:a1', tax: 2_000_000 },
      ],
      listed: 3_000_000,
      mail: { sent: 2, lastAt: '2026-11-19T09:00:00.000Z', manualSent: 1, remindersStopped: true },
      names: {
        minerName: 'Ore Pilot',
        corporationName: 'Rock Co',
        refineryNames: { '1000': 'Athanor X' },
      },
    });
    for (const gone of ['periodStart', 'coversFrom', 'hubId', 'oreForm', 'amount', 'unitPrices'])
      expect(JSON.stringify(notice)).not.toContain(gone);
  });

  it('reads a closing account’s notice as final, and a never-mailed one with no mail yet', () => {
    const notice = noticeFromStatementDoc({
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

  it('is undefined for a calendar Statement, which a notice is not', () => {
    expect(noticeFromStatementDoc({ ...storedNotice, kind: undefined })).toBeUndefined();
  });

  it('keys a line with neither a charge nor an adjustment by its date, as the planner did', () => {
    const notice = noticeFromStatementDoc({
      ...storedNotice,
      lines: [{ kind: 'mined', date: '2026-11-02', oreLines: [], estimatedValue: 0, tax: 5 }],
    });
    expect(notice?.lines[0]?.key).toBe('adjustment:2026-11-02');
  });
});

describe('listedKeys', () => {
  it('is every line any notice listed, so a later notice lists each day only once', () => {
    const a = noticeFromStatementDoc(storedNotice)!;
    expect([...listedKeys([a])].sort()).toEqual(['adjustment:a1', 'c1']);
  });
});

describe('noticeStanding', () => {
  const day = (over: Partial<NoticeDayState>): NoticeDayState => ({
    tax: 1_000_000,
    held: false,
    credited: 0,
    forgiven: 0,
    writtenOff: 0,
    remaining: 1_000_000,
    settled: false,
    ...over,
  });
  const notice = noticeFromStatementDoc(storedNotice)!;

  it('is settled once every day it listed is, whatever money paid them', () => {
    const byDay = new Map([
      ['2026-11-01', day({ credited: 1_000_000, remaining: 0, settled: true })],
      ['2026-11-03', day({ tax: 2_000_000, credited: 2_000_000, remaining: 0, settled: true })],
    ]);
    expect(noticeStanding(notice, byDay)).toEqual({
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
    expect(noticeStanding(notice, byDay)).toEqual({
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
    expect(noticeStanding(notice, new Map()).settled).toBe(true);
  });
});

describe('minerPaymentCode', () => {
  it('is one stable code per Miner, in the MT format a notice prints', () => {
    expect(minerPaymentCode('solo:9001')).toMatch(/^MT[0-9A-Z]{6}$/);
    expect(minerPaymentCode('solo:9001')).toBe(minerPaymentCode('solo:9001'));
    expect(minerPaymentCode('solo:9001')).not.toBe(minerPaymentCode('solo:9002'));
  });
});
