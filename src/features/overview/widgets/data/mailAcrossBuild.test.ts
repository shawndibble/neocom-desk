import { describe, expect, it } from 'vitest';
import { buildView, feedsOf, kindSumsAcrossCharacters } from './models';
import type { BuildContext, FeedState } from './types';
import type { MailBoardData } from '../../data/boardData';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const board = (unread: number): MailBoardData => ({
  unread,
  recent: [],
  inbox: [{ mailId: 5, subject: 'Hi', from: 'A', atMs: NOW, unread: true, ownerId: 22 }],
  needsReauth: false,
  fetchedAt: new Date(NOW),
});

describe('Mail across every Character', () => {
  it('reads its own feed when scoped to All', () => {
    expect(kindSumsAcrossCharacters('mail')).toBe(true);
    expect(feedsOf('mail', undefined, true)).toEqual(['mailAll']);
    expect(feedsOf('mail')).toEqual(['mail']);
  });

  it('draws the folded board, each row opening in its own inbox', () => {
    const view = buildView('mail', { mailAll: ok(board(7)), mail: ok(board(1)) }, ctx());
    expect(view.number.value).toBe('7');
    expect(view.table?.rows[0]?.to).toContain('22');
  });
});
