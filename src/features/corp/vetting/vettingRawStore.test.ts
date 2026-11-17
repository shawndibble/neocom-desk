import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VettingRawPage } from '@/engine/vetting';
import {
  clearVettingRawStore,
  loadRawPages,
  rawEntry,
  VETTING_CACHE_TTL_MS,
} from './vettingRawStore';
import {
  forgetVettingReview,
  recallVettingReview,
  rememberVettingReview,
} from './vettingReviewCache';
import { clearVettingSession } from './vettingSession';
import type { VettingReview } from '@/engine/vetting';

const page = (next: string | null | undefined): VettingRawPage =>
  ({
    reviewId: 'r',
    source: 'wallet',
    rows: [{ characterId: 1, at: null, what: 'x' }],
    parties: [],
    next,
  }) as VettingRawPage;

const settled = async (key: string) => {
  const entry = rawEntry(key);
  await vi.waitFor(() => expect(entry.running).toBe(false));
  return entry;
};

afterEach(() => {
  vi.useRealTimers();
  clearVettingSession();
});

describe('loadRawPages', () => {
  it('reads each page after the last cursor, and stops at null', async () => {
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<VettingRawPage>>()
      .mockResolvedValueOnce(page('1'))
      .mockResolvedValueOnce(page(null));
    loadRawPages(rawEntry('a'), fetchPage);
    const entry = await settled('a');
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([undefined, '1']);
    expect(entry.rows).toHaveLength(2);
  });

  it('treats a missing cursor as the last page, not as the first again', async () => {
    const fetchPage = vi.fn(async () => page(undefined));
    loadRawPages(rawEntry('b'), fetchPage);
    const entry = await settled('b');
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(entry.next).toBeNull();
  });

  it('stops when the server repeats a cursor', async () => {
    const fetchPage = vi.fn(async () => page('same'));
    loadRawPages(rawEntry('c'), fetchPage);
    const entry = await settled('c');
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(entry.error).toBe(false);
  });
});

describe('what is held in memory', () => {
  it('serves rows within the TTL and reads again after it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = rawEntry('k');
    first.rows = [{ characterId: 1, at: null, what: 'x' }];
    expect(rawEntry('k')).toBe(first);
    vi.setSystemTime(Date.now() + VETTING_CACHE_TTL_MS + 1);
    const again = rawEntry('k');
    expect(again).not.toBe(first);
    expect(again.rows).toHaveLength(0);
  });

  it('forgets the opened review after the TTL', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    rememberVettingReview(1, 2, { id: 'r' } as VettingReview);
    expect(recallVettingReview(1, 2, 'r')).not.toBeNull();
    vi.setSystemTime(Date.now() + VETTING_CACHE_TTL_MS + 1);
    expect(recallVettingReview(1, 2, 'r')).toBeNull();
  });

  it('clears both on the session reset', () => {
    rememberVettingReview(1, 2, { id: 'r' } as VettingReview);
    rawEntry('k').rows = [{ characterId: 1, at: null, what: 'x' }];
    clearVettingSession();
    expect(recallVettingReview(1, 2, 'r')).toBeNull();
    expect(rawEntry('k').rows).toHaveLength(0);
    forgetVettingReview();
    clearVettingRawStore();
  });
});
