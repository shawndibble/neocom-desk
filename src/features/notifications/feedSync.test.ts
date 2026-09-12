import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { readFeed } from './feed';
import {
  charactersOf,
  dismissFeedEntriesAndSync,
  dismissFeedKeysAndSync,
  recordFeedEntryAndSync,
} from './feedSync';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const CHAR_B = 2;

function row(id: string, characterId: number) {
  return {
    id,
    characterId,
    eventId: 'someEvent',
    title: 'Title',
    body: 'Body',
    firedAt: 1_756_000_000_000,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.notificationFeed.clear();
});

describe('charactersOf', () => {
  it('collapses repeats so one character gets one sync', () => {
    expect(charactersOf([row('a', CHAR_A), row('b', CHAR_A)])).toEqual([CHAR_A]);
  });

  it('keeps every distinct character', () => {
    expect(charactersOf([row('a', CHAR_A), row('b', CHAR_B)])).toEqual([CHAR_A, CHAR_B]);
  });

  it('schedules nothing for an empty dismissal', () => {
    expect(charactersOf([])).toEqual([]);
  });
});

describe('dismissFeedEntriesAndSync', () => {
  it('dismisses locally and pushes the dismissal', async () => {
    await db.notificationFeed.bulkPut([row('a', CHAR_A)]);

    await dismissFeedEntriesAndSync([row('a', CHAR_A)]);

    expect((await readFeed())[0]?.dismissedAt).toBeGreaterThan(0);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('pushes once per character when one action spans several', async () => {
    await db.notificationFeed.bulkPut([row('a', CHAR_A), row('b', CHAR_B), row('c', CHAR_A)]);

    await dismissFeedEntriesAndSync([row('a', CHAR_A), row('b', CHAR_B), row('c', CHAR_A)]);

    expect(syncMock.scheduleSync.mock.calls).toEqual([[CHAR_A], [CHAR_B]]);
  });

  it('leaves rows it was not given alone', async () => {
    await db.notificationFeed.bulkPut([row('a', CHAR_A), row('b', CHAR_A)]);

    await dismissFeedEntriesAndSync([row('a', CHAR_A)]);

    const byId = new Map((await readFeed()).map((entry) => [entry.id, entry]));
    expect(byId.get('b')?.dismissedAt).toBeUndefined();
  });
});

describe('dismissFeedKeysAndSync', () => {
  it('dismisses by Occurrence Key and pushes for the character given', async () => {
    await db.notificationFeed.bulkPut([row('a', CHAR_A)]);

    await dismissFeedKeysAndSync(CHAR_A, ['a']);

    expect((await readFeed())[0]?.dismissedAt).toBeGreaterThan(0);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });
});

describe('recordFeedEntryAndSync', () => {
  it('records the row and pushes it', async () => {
    await recordFeedEntryAndSync(row('a', CHAR_A));

    expect(await readFeed()).toHaveLength(1);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });
});
