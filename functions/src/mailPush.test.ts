import { describe, expect, it } from 'vitest';
import {
  MAX_SUBJECT_CHARS,
  buildMailPush,
  mailOccurrenceKey,
  mailPushedEntry,
  selectNewMail,
  type MailHeader,
} from './mailPush.js';

const h = (mailId: number, over: Partial<MailHeader> = {}): MailHeader => ({
  mailId,
  fromId: 900,
  subject: `s${mailId}`,
  sentMs: 1_000 + mailId,
  ...over,
});

describe('selectNewMail', () => {
  it('seeds silently on the first poll, at the highest id (own mail included)', () => {
    expect(selectNewMail(1, null, [h(5), h(9, { fromId: 1 }), h(7)])).toEqual({
      fires: [],
      highWaterId: 9,
    });
  });

  it('seeds an empty inbox at 0 so the first mail after it fires', () => {
    expect(selectNewMail(1, null, [])).toEqual({ fires: [], highWaterId: 0 });
    expect(selectNewMail(1, 0, [h(1)]).fires.map((f) => f.mailId)).toEqual([1]);
  });

  it('fires per id above the mark, oldest first, skipping mail the Character sent', () => {
    const out = selectNewMail(1, 5, [h(9), h(5), h(7, { fromId: 1 }), h(6)]);
    expect(out.fires.map((f) => f.mailId)).toEqual([6, 9]);
    expect(out.highWaterId).toBe(9);
  });

  it('never moves the mark down when the window slides', () => {
    expect(selectNewMail(1, 50, [h(10), h(11)])).toEqual({ fires: [], highWaterId: 50 });
  });

  it('carries sender id, subject and sent time; cuts a long subject', () => {
    const [fire] = selectNewMail(1, 0, [h(2, { subject: 'x'.repeat(500) })]).fires;
    expect(fire).toMatchObject({ eventId: 'newMail', characterId: 1, mailId: 2, fromId: 900 });
    expect([...fire.subject!]).toHaveLength(MAX_SUBJECT_CHARS);
  });
});

describe('buildMailPush', () => {
  const fire = selectNewMail(1, 0, [h(2)]).fires[0];

  it('keys the push and carries the raw fire, with a generic floor that names nothing', () => {
    const { data } = buildMailPush(fire, 5_000);
    expect(data).toMatchObject({
      characterId: '1',
      eventId: 'newMail',
      occurrenceKey: '1:newMail:2',
      title: 'New mail',
      fireAt: '1002',
    });
    expect(data.body).not.toContain('s2');
    expect(JSON.parse(data.fire)).toEqual(fire);
  });

  it('dates a mail from the future by now', () => {
    expect(buildMailPush({ ...fire, sentMs: 9_999 }, 5_000).data.fireAt).toBe('5000');
  });

  it('logs a push by device and Occurrence Key only', () => {
    expect(mailOccurrenceKey(fire)).toBe('1:newMail:2');
    expect(mailPushedEntry('phone', fire)).toBe('phone|1:newMail:2');
  });
});
