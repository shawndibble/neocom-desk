import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  enqueuePayeeChangeMail,
  enqueueRateChangeMail,
  enqueueReminder,
  enqueueRemovalMails,
  enqueueSrpResultMails,
  enqueueStatements,
  retryMail,
  type StatementToMail,
} from './mailQueue';

const readVerifyTokens = vi.fn();
const editCorpTaxBook = vi.fn();
vi.mock('@/features/corp/taxBook/bookClient', () => ({
  readVerifyTokens: (...a: unknown[]) => readVerifyTokens(...a),
  editBook: (...a: unknown[]) => editCorpTaxBook(...a),
  verifyUrl: (origin: string, token: string) => `${origin}/v/${token}`,
}));

function statement(n: number): StatementToMail {
  return {
    statementId: `s${n}`,
    recipientId: 100 + n,
    recipientName: `Miner ${n}`,
    amountDue: 6_000_000,
    periodLabel: 'Sep 2026',
    code: `C${n}`,
    carried: 0,
    dueDate: '2026-10-15',
    lines: [
      {
        kind: 'mined',
        date: '2026-09-03',
        structureId: 1,
        estimatedValue: 60_000_000,
        tax: 6_000_000,
      },
    ],
  };
}

const base = {
  corporationId: 98000001,
  corporationName: 'Ore & Glory',
  senderCharacterId: 7,
  refineryName: () => 'Efa - Brass Anvil',
  origin: 'https://app.test',
};

beforeEach(async () => {
  await db.corpMailQueue.clear();
  readVerifyTokens.mockReset();
  editCorpTaxBook.mockReset().mockResolvedValue(undefined);
});

describe('enqueueStatements', () => {
  it('queues one waiting mail per Statement, in order, with the verify link in the body', async () => {
    readVerifyTokens.mockResolvedValue(
      new Map([
        ['s1', 'tok1'],
        ['s2', 'tok2'],
      ])
    );
    const result = await enqueueStatements({ ...base, statements: [statement(1), statement(2)] });
    expect(result).toMatchObject({ queued: 2, skipped: 0, missingLink: [] });
    expect(readVerifyTokens).toHaveBeenCalledWith(7, 98000001, ['s1', 's2']);
    const rows = (await db.corpMailQueue.toArray()).sort((a, b) => a.order - b.order);
    expect(rows.map((r) => [r.statementId, r.recipientId, r.status, r.kind])).toEqual([
      ['s1', 101, 'waiting', 'statement'],
      ['s2', 102, 'waiting', 'statement'],
    ]);
    expect(rows[0].body).toContain('https://app.test/v/tok1');
    expect(rows[0].batchId).toBe(rows[1].batchId);
  });

  it('skips a Statement already queued and one with no verify link', async () => {
    readVerifyTokens.mockResolvedValue(new Map([['s1', 'tok1']]));
    await enqueueStatements({ ...base, statements: [statement(1)] });
    readVerifyTokens.mockResolvedValue(new Map([['s1', 'tok1']]));
    const again = await enqueueStatements({ ...base, statements: [statement(1), statement(2)] });
    expect(again).toMatchObject({ queued: 0, skipped: 1, missingLink: ['s2'] });
    expect(await db.corpMailQueue.count()).toBe(1);
  });

  it('continues numbering after what is already queued', async () => {
    readVerifyTokens.mockResolvedValue(
      new Map([
        ['s1', 't'],
        ['s2', 't'],
      ])
    );
    await enqueueStatements({ ...base, statements: [statement(1)] });
    await enqueueStatements({ ...base, statements: [statement(2)] });
    const orders = (await db.corpMailQueue.toArray()).map((r) => r.order).sort();
    expect(new Set(orders).size).toBe(2);
  });
});

describe('enqueueReminder (D27)', () => {
  const stopped = { remindersStopped: true, manualRemindersSent: 0 };

  it('sends one reminder to an opted-out Miner, counted in the book first', async () => {
    readVerifyTokens.mockResolvedValue(new Map([['s1', 'tok1']]));
    const result = await enqueueReminder({ ...base, statement: statement(1), ...stopped });
    expect(result).toMatchObject({ ok: true, queued: 1 });
    expect(editCorpTaxBook).toHaveBeenCalledWith(
      7,
      98000001,
      {
        action: 'recordReminder',
        statementId: 's1',
      },
      { freshToken: true }
    );
    const [row] = await db.corpMailQueue.toArray();
    expect(row.kind).toBe('reminder');
    expect(row.subject.startsWith('Reminder: ')).toBe(true);
  });

  it('refuses the second one without touching the book', async () => {
    const result = await enqueueReminder({
      ...base,
      statement: statement(1),
      remindersStopped: true,
      manualRemindersSent: 1,
    });
    expect(result).toEqual({ ok: false, reason: 'stopped' });
    expect(editCorpTaxBook).not.toHaveBeenCalled();
    expect(await db.corpMailQueue.count()).toBe(0);
  });

  it('does not double-queue a reminder still waiting', async () => {
    readVerifyTokens.mockResolvedValue(new Map([['s1', 'tok1']]));
    const opts = {
      ...base,
      statement: statement(1),
      remindersStopped: false,
      manualRemindersSent: 0,
    };
    await enqueueReminder(opts);
    expect(await enqueueReminder(opts)).toEqual({ ok: false, reason: 'queued' });
    expect(editCorpTaxBook).toHaveBeenCalledTimes(1);
  });

  it('does not count a reminder it cannot queue', async () => {
    readVerifyTokens.mockResolvedValue(new Map());
    const result = await enqueueReminder({ ...base, statement: statement(1), ...stopped });
    expect(result).toEqual({ ok: false, reason: 'missingLink' });
    expect(editCorpTaxBook).not.toHaveBeenCalled();
  });
});

describe('retryMail', () => {
  it('puts a failed mail back at the end, waiting', async () => {
    readVerifyTokens.mockResolvedValue(
      new Map([
        ['s1', 't'],
        ['s2', 't'],
      ])
    );
    await enqueueStatements({ ...base, statements: [statement(1), statement(2)] });
    const [first] = (await db.corpMailQueue.toArray()).sort((a, b) => a.order - b.order);
    await db.corpMailQueue.put({ ...first, status: 'failed', failureReason: 'cspa' });
    await retryMail({ ...first, status: 'failed', failureReason: 'cspa' });
    const after = await db.corpMailQueue.get(first.id);
    expect(after).toMatchObject({ status: 'waiting' });
    expect(after?.order).toBeGreaterThan(first.order + 1);
    expect(after?.failureReason).toBeUndefined();
  });
});

describe('enqueueRemovalMails', () => {
  const input = {
    corporationId: 98000001,
    feederCorporationId: 98000002,
    senderCharacterId: 7,
    kind: 'removal' as const,
    recipients: [
      { id: 11, name: 'Ceo' },
      { id: 12, name: 'Payee' },
      { id: 13, name: 'Officer' },
    ],
    mail: { subject: 'S', body: 'B' },
  };

  it('queues one waiting mail per recipient, all about the same moon owner', async () => {
    expect(await enqueueRemovalMails(input)).toBe(3);
    const items = await db.corpMailQueue.toArray();
    expect(items.map((i) => i.recipientId).sort()).toEqual([11, 12, 13]);
    expect(items.every((i) => i.status === 'waiting' && i.kind === 'removal')).toBe(true);
    expect(items.every((i) => i.feederCorporationId === 98000002)).toBe(true);
    expect(items.every((i) => i.senderCharacterId === 7 && i.amount === 0)).toBe(true);
  });

  it('queues the cancellation as its own kind without touching the notice', async () => {
    await enqueueRemovalMails(input);
    await enqueueRemovalMails({
      ...input,
      kind: 'removalCancelled',
      recipients: [input.recipients[0]!],
    });
    const items = await db.corpMailQueue.toArray();
    expect(items.filter((i) => i.kind === 'removal')).toHaveLength(3);
    expect(items.filter((i) => i.kind === 'removalCancelled')).toHaveLength(1);
  });
});

describe('enqueueRateChangeMail', () => {
  const mail = (newPct: number, recordedAt: string) =>
    enqueueRateChangeMail({
      corporationId: 98000001,
      accountingCorporationName: 'Ore & Glory',
      senderCharacterId: 7,
      feederCorporationId: 98000002,
      change: { date: '2026-10-05', newPct, recordedAt },
      recipients: [{ id: 300, name: 'Owner CEO' }],
    });

  it('mails each change, even 8% to 6% and back to 8% on one day', async () => {
    await mail(8, '2026-10-05T10:00:00.000Z');
    await mail(6, '2026-10-05T11:00:00.000Z');
    expect(await mail(8, '2026-10-05T12:00:00.000Z')).toEqual({ queued: 1 });
    expect(await db.corpMailQueue.count()).toBe(3);
  });

  it('queues one change only once', async () => {
    await mail(8, '2026-10-05T10:00:00.000Z');
    expect(await mail(8, '2026-10-05T10:00:00.000Z')).toEqual({ queued: 0 });
  });
});

describe('enqueuePayeeChangeMail', () => {
  const base = {
    corporationId: 5,
    senderCharacterId: 1,
    feederCorporationId: 10,
    changedByName: 'B-UH Moons',
    moonOwnerName: 'Rock Holders',
    payeeName: 'Kara Vex',
    at: Date.parse('2026-10-21T12:00:00Z'),
    recipients: [
      { id: 501, name: 'Pilot 501' },
      { id: 700, name: 'Pilot 700' },
    ],
  };
  beforeEach(async () => {
    await db.corpMailQueue.clear();
  });

  it('queues one short mail for exactly each recipient', async () => {
    expect(await enqueuePayeeChangeMail(base)).toEqual({ queued: 2 });
    const rows = await db.corpMailQueue.toArray();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([501, 700]);
    for (const r of rows) {
      expect(r).toMatchObject({ kind: 'payee-change', senderCharacterId: 1, corporationId: 5 });
      expect(r.feederCorporationId).toBe(10);
      expect(r.body).toContain(`Hi ${r.recipientName},`);
      expect(r.body).toContain('now go to Kara Vex');
      expect(`${r.subject} ${r.body}`).not.toMatch(
        /%|rate|margin|miner|hour|48|remov|feeder|collector/i
      );
    }
  });

  it('mails one change once per recipient', async () => {
    await enqueuePayeeChangeMail(base);
    expect(await enqueuePayeeChangeMail(base)).toEqual({ queued: 0 });
    expect(await db.corpMailQueue.count()).toBe(2);
  });
});

describe('enqueueSrpResultMails', () => {
  beforeEach(async () => {
    await db.corpMailQueue.clear();
  });
  const mails = [1, 2, 3].map((id) => ({
    recipient: { id, name: `P${id}` },
    killmailIds: [id * 10],
    subject: 's',
    body: 'b',
  }));
  const input = { corporationId: 5, senderCharacterId: 1, kind: 'approved' as const, mails };

  it('queues one waiting srp-result row per pilot, in order, once per decision', async () => {
    expect(await enqueueSrpResultMails(input)).toEqual({ queued: 3 });
    expect(await enqueueSrpResultMails(input)).toEqual({ queued: 0 });
    const rows = (await db.corpMailQueue.toArray()).sort((a, b) => a.order - b.order);
    expect(rows.map((r) => [r.recipientId, r.kind, r.status])).toEqual([
      [1, 'srp-result', 'waiting'],
      [2, 'srp-result', 'waiting'],
      [3, 'srp-result', 'waiting'],
    ]);
  });

  it('a double submit a moment apart still queues once', async () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1000);
      await enqueueSrpResultMails(input);
      now.mockReturnValue(2000);
      expect(await enqueueSrpResultMails(input)).toEqual({ queued: 0 });
    } finally {
      now.mockRestore();
    }
    expect(await db.corpMailQueue.count()).toBe(3);
  });

  it('a different decision (kind or claims) is mailed', async () => {
    await enqueueSrpResultMails(input);
    expect(await enqueueSrpResultMails({ ...input, kind: 'rejected' })).toEqual({ queued: 3 });
    const other = mails.map((m) => ({ ...m, killmailIds: [m.killmailIds[0]! + 1] }));
    expect(await enqueueSrpResultMails({ ...input, mails: other })).toEqual({ queued: 3 });
  });
});
