import { describe, expect, it } from 'vitest';
import {
  classifyMailFailure,
  displayStatus,
  estimateMinutes,
  holdQueue,
  isAlreadyQueued,
  markFailed,
  markSent,
  nextStep,
  reminderAllowed,
  removalMailsToDrop,
  retryItem,
  sendGapMs,
  stampRemovalEffectiveAt,
  startsRemovalClock,
  summarize,
  type MailQueueItem,
  removalNoticeStillDue,
} from './mailQueue';

function item(n: number, patch: Partial<MailQueueItem> = {}): MailQueueItem {
  return {
    id: `m${n}`,
    batchId: 'b1',
    corporationId: 98000001,
    statementId: `s${n}`,
    kind: 'statement',
    senderCharacterId: 1,
    recipientId: 100 + n,
    recipientName: `Miner ${n}`,
    amount: 1_000_000 * n,
    subject: 'Statement',
    body: 'body',
    order: n,
    status: 'waiting',
    createdAt: 0,
    attempts: 0,
    ...patch,
  };
}

describe('pacing', () => {
  it('says N mails take ceil(N / 5) minutes', () => {
    expect(estimateMinutes(19)).toBe(4);
    expect(estimateMinutes(5)).toBe(1);
    expect(estimateMinutes(6)).toBe(2);
    expect(estimateMinutes(0)).toBe(0);
  });

  it('spaces sends 12 to 15 seconds apart', () => {
    expect(sendGapMs(0)).toBe(12_000);
    expect(sendGapMs(0.999)).toBeLessThanOrEqual(15_000);
    expect(sendGapMs(0.5)).toBe(13_500);
  });
});

describe('nextStep', () => {
  it('is idle with nothing waiting', () => {
    expect(nextStep([], 0)).toEqual({ kind: 'idle' });
    expect(nextStep([item(1, { status: 'sent' }), item(2, { status: 'failed' })], 0)).toEqual({
      kind: 'idle',
    });
  });

  it('sends the lowest order first, skipping settled mails', () => {
    const step = nextStep([item(3), item(1, { status: 'sent' }), item(2)], 0);
    expect(step).toEqual({ kind: 'send', item: expect.objectContaining({ id: 'm2' }) });
  });

  it('lets another sender’s mail go while one sender is held', () => {
    const items = [item(1, { notBefore: 5000 }), item(2, { senderCharacterId: 2 })];
    expect(nextStep(items, 1000)).toEqual({
      kind: 'send',
      item: expect.objectContaining({ id: 'm2' }),
    });
  });

  it('waits out a held queue until its hold ends', () => {
    const items = [item(1, { notBefore: 5000 }), item(2, { notBefore: 5000 })];
    expect(nextStep(items, 1000)).toEqual({ kind: 'wait', until: 5000 });
    expect(nextStep(items, 5000).kind).toBe('send');
  });
});

describe('transitions', () => {
  it('marks a mail sent with its id and clears any hold or failure', () => {
    const failed = markFailed(item(1, { notBefore: 9 }), 'other', 'x');
    const sent = markSent(failed, 777, 1234);
    expect(sent).toMatchObject({ status: 'sent', mailId: 777, sentAt: 1234, attempts: 2 });
    expect(sent.failureReason).toBeUndefined();
    expect(sent.notBefore).toBeUndefined();
  });

  it('retries a failure at the back of the line', () => {
    const retried = retryItem(markFailed(item(1), 'cspa', 'charges'), 9);
    expect(retried).toMatchObject({ status: 'waiting', order: 9 });
    expect(retried.failureReason).toBeUndefined();
  });

  it('holds only the sender’s waiting mails', () => {
    const held = holdQueue(
      [item(1), item(2, { status: 'sent' }), item(3, { senderCharacterId: 2 })],
      1,
      9000,
      'rateLimit'
    );
    expect(held.map((i) => [i.id, i.notBefore, i.holdReason])).toEqual([['m1', 9000, 'rateLimit']]);
  });
});

describe('classifyMailFailure', () => {
  it('waits out remainingTime (seconds) on a 520, plus a second', () => {
    expect(
      classifyMailFailure({ status: 520, body: { error: 'MailStopSpamming', remainingTime: 48 } })
    ).toEqual({ kind: 'rateLimit', waitMs: 49_000 });
  });

  it('reads an implausibly large remainingTime as milliseconds', () => {
    expect(classifyMailFailure({ status: 520, body: { remainingTime: 48_000 } })).toEqual({
      kind: 'rateLimit',
      waitMs: 49_000,
    });
  });

  it('falls back to a minute when a 520 names no time, and caps the wait', () => {
    expect(classifyMailFailure({ status: 520 })).toEqual({ kind: 'rateLimit', waitMs: 61_000 });
    expect(classifyMailFailure({ status: 520, body: { remainingTime: 3000 } })).toEqual({
      kind: 'rateLimit',
      waitMs: 600_000,
    });
  });

  it('treats a network failure as retry-later, not a failed mail', () => {
    expect(classifyMailFailure({ status: 0, offline: true }).kind).toBe('offline');
  });

  it('names the reason a mail was refused', () => {
    expect(classifyMailFailure({ status: 403, message: 'forbidden' })).toMatchObject({
      reason: 'auth',
    });
    expect(
      classifyMailFailure({ status: 400, body: { error: 'Contact costs 5,000 ISK (CSPA)' } })
    ).toMatchObject({ reason: 'cspa' });
    expect(classifyMailFailure({ status: 400, body: { error: 'nope' } })).toMatchObject({
      reason: 'other',
      detail: 'nope',
    });
  });
});

describe('summarize and displayStatus', () => {
  const items = [
    item(1, { status: 'sent' }),
    item(2, { status: 'failed' }),
    item(3, { notBefore: 50_000 }),
    item(4),
  ];

  it('counts, percent and ETA', () => {
    expect(summarize(items, 2000)).toMatchObject({
      total: 4,
      sent: 1,
      failed: 1,
      waiting: 2,
      paused: 1,
      percent: 50,
      done: false,
      minutesLeft: 1,
      pausedSeconds: 48,
    });
  });

  it('is done at 100% with failures still counted', () => {
    const done = summarize([item(1, { status: 'sent' }), item(2, { status: 'failed' })], 0);
    expect(done).toMatchObject({ done: true, percent: 100, minutesLeft: 0, failed: 1 });
  });

  it('an empty queue is not done', () => {
    expect(summarize([], 0)).toMatchObject({ done: false, percent: 0 });
  });

  it('shows only the head of a held queue as Paused', () => {
    expect(displayStatus(items, items[2], 2000)).toBe('paused');
    expect(displayStatus(items, items[3], 2000)).toBe('waiting');
    expect(displayStatus(items, items[2], 60_000)).toBe('waiting');
    expect(displayStatus(items, items[3], 2000, 'm4')).toBe('sending');
    expect(displayStatus(items, items[0], 0)).toBe('sent');
  });
});

describe('Stop reminders (D27)', () => {
  it('allows reminders freely when not opted out', () => {
    expect(reminderAllowed({ remindersStopped: false, manualRemindersSent: 5 })).toBe(true);
  });
  it('allows exactly one to an opted-out Miner', () => {
    expect(reminderAllowed({ remindersStopped: true, manualRemindersSent: 0 })).toBe(true);
    expect(reminderAllowed({ remindersStopped: true, manualRemindersSent: 1 })).toBe(false);
  });
});

describe('isAlreadyQueued', () => {
  it('never queues a Statement mail twice, whatever its state', () => {
    expect(isAlreadyQueued([item(1, { status: 'sent' })], 's1', 'statement')).toBe(true);
    expect(isAlreadyQueued([item(1)], 's2', 'statement')).toBe(false);
  });
  it('lets a reminder be queued again once the earlier one went out', () => {
    const r = item(1, { kind: 'reminder', status: 'sent' });
    expect(isAlreadyQueued([r], 's1', 'reminder')).toBe(false);
    expect(isAlreadyQueued([{ ...r, status: 'waiting' }], 's1', 'reminder')).toBe(true);
  });
});

describe('removal notices (#4617)', () => {
  const notice = (n: number, patch: Partial<MailQueueItem> = {}) =>
    item(n, { kind: 'removal', feederCorporationId: 5, ...patch });

  it('only a copy to the moon owner side starts the 24 hours', () => {
    expect(startsRemovalClock(notice(1, { startsClock: true }))).toBe(true);
    expect(startsRemovalClock(notice(1, { startsClock: false }))).toBe(false);
    // Queued before the flag existed: as before, any copy starts it.
    expect(startsRemovalClock(notice(1))).toBe(true);
    expect(startsRemovalClock(item(1))).toBe(false);
    expect(startsRemovalClock(notice(1, { kind: 'removalCancelled' }))).toBe(false);
  });

  it('a cancel drops the unsent notices for that moon owner only', () => {
    const items = [
      notice(1),
      notice(2, { status: 'failed' }),
      notice(3, { status: 'sent' }),
      notice(4, { feederCorporationId: 6 }),
      notice(5, { corporationId: 1 }),
      notice(6, { kind: 'removalCancelled' }),
      item(7),
    ];
    expect(removalMailsToDrop(items, 98000001, 5)).toEqual(['m1', 'm2']);
  });

  it('once the clock starts, every unsent copy carries the recorded time', () => {
    const items = [
      notice(1, { status: 'sent' }),
      notice(2),
      notice(3, { status: 'failed' }),
      notice(4, { feederCorporationId: 6 }),
      notice(5, { effectiveAt: 99 }),
    ];
    expect(
      stampRemovalEffectiveAt(items, 98000001, 5, 99).map((i) => [i.id, i.effectiveAt])
    ).toEqual([
      ['m2', 99],
      ['m3', 99],
    ]);
  });
});

describe('removalNoticeStillDue (#4621)', () => {
  const notice = (patch: Partial<MailQueueItem> = {}) =>
    item(1, { kind: 'removal', feederCorporationId: 98000002, removalStartedAt: 500, ...patch });
  it('sends while the same removal is still pending', () => {
    expect(
      removalNoticeStillDue(notice(), { status: 'pending-removal', removal: { startedAt: 500 } })
    ).toBe(true);
  });
  it('drops it once cancelled, ended or disconnected, by anyone', () => {
    for (const status of ['active', 'removed', 'left', 'disconnected']) {
      expect(removalNoticeStillDue(notice(), { status })).toBe(false);
    }
    expect(removalNoticeStillDue(notice(), undefined)).toBe(false);
  });
  it('drops a notice for an earlier removal when a new one started', () => {
    expect(
      removalNoticeStillDue(notice(), { status: 'pending-removal', removal: { startedAt: 900 } })
    ).toBe(false);
  });
  it('an item queued before the removal was recorded on it only needs a pending removal', () => {
    expect(
      removalNoticeStillDue(notice({ removalStartedAt: undefined }), {
        status: 'pending-removal',
        removal: { startedAt: 900 },
      })
    ).toBe(true);
  });
  it('never holds back any other kind of mail', () => {
    expect(removalNoticeStillDue(item(1), undefined)).toBe(true);
    expect(removalNoticeStillDue(item(1, { kind: 'removalCancelled' }), undefined)).toBe(true);
  });
});
