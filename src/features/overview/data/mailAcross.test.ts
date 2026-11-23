import { describe, expect, it } from 'vitest';
import type { BoardMail, MailBoardData } from './boardData';
import { mergeMailBoards } from './mailAcross';

const mail = (mailId: number, atMs: number, ownerId: number, over: Partial<BoardMail> = {}) => ({
  mailId,
  subject: `s${mailId}`,
  from: 'Someone',
  atMs,
  ownerId,
  ...over,
});
const board = (over: Partial<MailBoardData> = {}): MailBoardData => ({
  unread: 0,
  recent: [],
  inbox: [],
  needsReauth: false,
  fetchedAt: null,
  ...over,
});

describe('mergeMailBoards', () => {
  it('adds the unread counts and interleaves rows newest first, keeping each row its owner', () => {
    const merged = mergeMailBoards([
      board({ unread: 2, recent: [mail(1, 100, 11), mail(2, 50, 11)], inbox: [mail(1, 100, 11)] }),
      board({ unread: 3, recent: [mail(3, 75, 22)], inbox: [mail(3, 75, 22)] }),
    ]);
    expect(merged.unread).toBe(5);
    expect(merged.recent.map((m) => [m.mailId, m.ownerId])).toEqual([
      [1, 11],
      [3, 22],
      [2, 11],
    ]);
    expect(merged.inbox?.map((m) => m.mailId)).toEqual([1, 3]);
  });

  it('lists a mail sent to two of the Characters once', () => {
    const merged = mergeMailBoards([
      board({ unread: 1, recent: [mail(7, 100, 11)], inbox: [mail(7, 100, 11)] }),
      board({ unread: 1, recent: [mail(7, 100, 22)], inbox: [mail(7, 100, 22)] }),
    ]);
    expect(merged.recent).toHaveLength(1);
    expect(merged.inbox).toHaveLength(1);
  });

  it('keeps the unread rows to four and the inbox to twelve', () => {
    const many = (owner: number) =>
      Array.from({ length: 12 }, (_, i) => mail(owner * 100 + i, i, owner));
    const merged = mergeMailBoards([
      board({ recent: many(1).slice(0, 4), inbox: many(1) }),
      board({ recent: many(2).slice(0, 4), inbox: many(2) }),
    ]);
    expect(merged.recent).toHaveLength(4);
    expect(merged.inbox).toHaveLength(12);
  });

  it('needs a sign-in only when every Character does, and is as fresh as the stalest read', () => {
    const first = new Date(1000);
    const second = new Date(5000);
    expect(
      mergeMailBoards([board({ needsReauth: true }), board({ unread: 1, fetchedAt: second })])
        .needsReauth
    ).toBe(false);
    expect(
      mergeMailBoards([board({ needsReauth: true }), board({ needsReauth: true })]).needsReauth
    ).toBe(true);
    expect(
      mergeMailBoards([board({ fetchedAt: second }), board({ fetchedAt: first })]).fetchedAt
    ).toEqual(first);
  });
});
