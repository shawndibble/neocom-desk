import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  NOTIFICATION_FEED_LIMIT,
  idsBeyondLimit,
  recordFeedEntry,
  readFeed,
  dismissFeedEntry,
  mergeFeedRecord,
  dismissFeedEntries,
  rowsWithinSyncWindow,
  FEED_SYNC_WINDOW_MAX_ROWS,
  FEED_SYNC_WINDOW_MS,
  feedHasOccurrence,
  deleteFeedForCharacter,
} from './feed';

beforeEach(async () => {
  await db.notificationFeed.clear();
});

describe('idsBeyondLimit', () => {
  it('keeps everything when the feed is within the cap', () => {
    expect(idsBeyondLimit([{ id: 'a' }, { id: 'b' }], 5)).toEqual([]);
  });

  it('drops the oldest once over the cap, given newest-first input', () => {
    const newestFirst = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    expect(idsBeyondLimit(newestFirst, 2)).toEqual(['a']);
  });

  it('drops everything when the cap is zero', () => {
    expect(idsBeyondLimit([{ id: 'a' }], 0)).toEqual(['a']);
  });
});

describe('rowsWithinSyncWindow', () => {
  const NOW = 1_756_000_000_000;

  it('keeps recent rows under the row cap', () => {
    const rows = [{ firedAt: NOW - 1 }, { firedAt: NOW - 2 }];
    expect(rowsWithinSyncWindow(rows, NOW)).toEqual(rows);
  });

  it('drops rows older than the 30-day window', () => {
    const recent = { firedAt: NOW - 1000 };
    const stale = { firedAt: NOW - FEED_SYNC_WINDOW_MS - 1 };
    expect(rowsWithinSyncWindow([recent, stale], NOW)).toEqual([recent]);
  });

  it('caps at 100 rows even when all are within 30 days', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ firedAt: NOW - i }));
    expect(rowsWithinSyncWindow(rows, NOW)).toHaveLength(FEED_SYNC_WINDOW_MAX_ROWS);
  });

  it('a row exactly at the 30-day boundary is included', () => {
    const boundary = { firedAt: NOW - FEED_SYNC_WINDOW_MS };
    expect(rowsWithinSyncWindow([boundary], NOW)).toEqual([boundary]);
  });
});

describe('recordFeedEntry / readFeed', () => {
  it('stores an entry, keyed by the caller-supplied id, and reads it back', async () => {
    await recordFeedEntry({
      id: 'occurrence-1',
      characterId: 1,
      eventId: 'newMail',
      title: 'New mail',
      body: 'Pilot has new mail.',
      firedAt: 1000,
    });
    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      id: 'occurrence-1',
      characterId: 1,
      eventId: 'newMail',
      firedAt: 1000,
    });
  });

  it('reads newest first', async () => {
    for (const firedAt of [1000, 3000, 2000]) {
      await recordFeedEntry({
        id: `occurrence-${firedAt}`,
        characterId: 1,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt,
      });
    }
    expect((await readFeed()).map((e) => e.firedAt)).toEqual([3000, 2000, 1000]);
  });

  it('trims the oldest entries past the cap', async () => {
    for (let i = 0; i < NOTIFICATION_FEED_LIMIT + 3; i++) {
      await recordFeedEntry({
        id: `occurrence-${i}`,
        characterId: 1,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt: i,
      });
    }
    const feed = await readFeed();
    expect(feed).toHaveLength(NOTIFICATION_FEED_LIMIT);
    expect(feed[feed.length - 1].firedAt).toBe(3);
  });

  it('recording the same occurrence twice collapses to one feed row (issue #348)', async () => {
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'First observer',
      body: 'b',
      firedAt: 1000,
    });
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'Second observer',
      body: 'b',
      firedAt: 1500,
    });
    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Second observer');
  });

  it("keeps the first observer's firedAt, so a second observer cannot re-date the row to its own poll", async () => {
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'First observer',
      body: 'b',
      firedAt: 1000,
    });
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'Second observer',
      body: 'b',
      firedAt: 1500,
    });
    expect((await readFeed())[0].firedAt).toBe(1000);
  });

  it("takes the earlier firedAt whichever observer arrives first, so a push stamping its own arrival cannot beat the poller's real occurrence time", async () => {
    const entry = {
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'walletBalanceChanged',
      title: 't',
      body: 'b',
    };
    // The push lands first, stamping its own arrival; the poller follows with
    // the journal entry's real date.
    await recordFeedEntry({ ...entry, firedAt: 5000 });
    await recordFeedEntry({ ...entry, firedAt: 1000 });
    expect((await readFeed())[0].firedAt).toBe(1000);
  });

  it('keeps a back-dated row it just wrote, rather than trimming it away in the same call', async () => {
    for (let i = 0; i < NOTIFICATION_FEED_LIMIT; i++) {
      await recordFeedEntry({
        id: `newer-${i}`,
        characterId: 1,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt: 10_000 + i,
      });
    }
    // Older than every row already stored — the trim's own cut line.
    await recordFeedEntry({
      id: 'back-dated',
      characterId: 1,
      eventId: 'walletBalanceChanged',
      title: 'Wallet balance changed',
      body: 'b',
      firedAt: 1,
    });
    expect(await db.notificationFeed.get('back-dated')).toBeDefined();
  });

  it('keeps a dismissal, so a second observer re-recording the occurrence cannot resurface it', async () => {
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'First observer',
      body: 'b',
      firedAt: 1000,
    });
    await dismissFeedEntry('same-occurrence');
    await recordFeedEntry({
      id: 'same-occurrence',
      characterId: 1,
      eventId: 'newMail',
      title: 'Second observer',
      body: 'b',
      firedAt: 1500,
    });
    expect((await readFeed())[0].dismissedAt).toBeTypeOf('number');
  });
});

describe('mergeFeedRecord', () => {
  const incoming = {
    id: 'k',
    characterId: 1,
    eventId: 'walletBalanceChanged',
    title: 'Newer copy',
    body: 'b',
    firedAt: 5000,
  };

  it('is the incoming row when nothing is stored yet', () => {
    expect(mergeFeedRecord(undefined, incoming)).toEqual(incoming);
  });

  it('takes the earlier firedAt and the newer copy, whichever side is older', () => {
    const stored = { ...incoming, title: 'Older copy', firedAt: 1000 };
    expect(mergeFeedRecord(stored, incoming)).toMatchObject({ firedAt: 1000, title: 'Newer copy' });
    expect(mergeFeedRecord(incoming, { ...stored, title: 'Newer copy' })).toMatchObject({
      firedAt: 1000,
    });
  });

  it('takes the later dismissal from either side, so a re-record keeps one and a pull applies one', () => {
    const dismissedLocally = { ...incoming, firedAt: 1000, dismissedAt: 9000 };
    // A re-record carries no dismissal of its own; the stored one survives.
    expect(mergeFeedRecord(dismissedLocally, incoming).dismissedAt).toBe(9000);
    // A pull carrying a newer dismissal applies it.
    expect(
      mergeFeedRecord({ ...incoming, dismissedAt: 100 }, { ...incoming, dismissedAt: 9000 })
        .dismissedAt
    ).toBe(9000);
  });

  it('leaves dismissedAt off entirely when neither side has one', () => {
    expect(mergeFeedRecord({ ...incoming, firedAt: 1 }, incoming)).not.toHaveProperty(
      'dismissedAt'
    );
  });
});

describe('legacy rows', () => {
  it('a feed row written with a pre-#348 random-UUID id stays readable and dismissible', async () => {
    const legacyId = crypto.randomUUID();
    await db.notificationFeed.put({
      id: legacyId,
      characterId: 1,
      eventId: 'newMail',
      title: 'Old row',
      body: 'b',
      firedAt: 1000,
    });
    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].id).toBe(legacyId);
    expect(feed[0].dismissedAt).toBeUndefined();

    await dismissFeedEntry(legacyId);
    const afterDismiss = await readFeed();
    expect(afterDismiss).toHaveLength(1);
    expect(afterDismiss[0].dismissedAt).toBeTypeOf('number');
  });
});

describe('dismissing', () => {
  it('flags one entry with dismissedAt, leaving the rest untouched and every row still readable', async () => {
    await recordFeedEntry({
      id: 'a',
      characterId: 1,
      eventId: 'newMail',
      title: 'a',
      body: 'b',
      firedAt: 1,
    });
    await recordFeedEntry({
      id: 'b',
      characterId: 1,
      eventId: 'newMail',
      title: 'c',
      body: 'd',
      firedAt: 2,
    });
    const [newest] = await readFeed();

    await dismissFeedEntry(newest.id);

    const feed = await readFeed();
    expect(feed).toHaveLength(2);
    const dismissed = feed.find((e) => e.id === newest.id);
    const untouched = feed.find((e) => e.id !== newest.id);
    expect(dismissed?.dismissedAt).toBeTypeOf('number');
    expect(untouched?.title).toBe('a');
    expect(untouched?.dismissedAt).toBeUndefined();
  });

  it('flags the given ids in bulk, leaving the others unflagged and every row still readable', async () => {
    for (let i = 0; i < 4; i++) {
      await recordFeedEntry({
        id: `occurrence-${i}`,
        characterId: i,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt: i,
      });
    }
    const feed = await readFeed();
    const doomed = feed.filter((e) => e.characterId !== 3).map((e) => e.id);

    await dismissFeedEntries(doomed);

    const after = await readFeed();
    expect(after).toHaveLength(4);
    const survivor = after.find((e) => e.characterId === 3);
    expect(survivor?.dismissedAt).toBeUndefined();
    for (const id of doomed) {
      expect(after.find((e) => e.id === id)?.dismissedAt).toBeTypeOf('number');
    }
  });

  it('the 300-row cap still trims a dismissed row once it ages past the limit', async () => {
    for (let i = 0; i < NOTIFICATION_FEED_LIMIT; i++) {
      await recordFeedEntry({
        id: `occurrence-${i}`,
        characterId: 1,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt: i,
      });
    }
    const oldestId = 'occurrence-0';
    await dismissFeedEntry(oldestId);
    expect((await readFeed()).find((e) => e.id === oldestId)?.dismissedAt).toBeTypeOf('number');

    for (let i = NOTIFICATION_FEED_LIMIT; i < NOTIFICATION_FEED_LIMIT + 3; i++) {
      await recordFeedEntry({
        id: `occurrence-${i}`,
        characterId: 1,
        eventId: 'newMail',
        title: 't',
        body: 'b',
        firedAt: i,
      });
    }

    const feed = await readFeed();
    expect(feed).toHaveLength(NOTIFICATION_FEED_LIMIT);
    expect(feed.find((e) => e.id === oldestId)).toBeUndefined();
  });
});

describe('feedHasOccurrence', () => {
  it('is false for an occurrence never recorded', async () => {
    expect(await feedHasOccurrence('never-seen')).toBe(false);
  });

  it('is true once that Occurrence Key has been recorded', async () => {
    await recordFeedEntry({
      id: 'occurrence-1',
      characterId: 1,
      eventId: 'newMail',
      title: 't',
      body: 'b',
      firedAt: 1000,
    });
    expect(await feedHasOccurrence('occurrence-1')).toBe(true);
  });
});

describe('deleteFeedForCharacter', () => {
  it("deletes only the given Character's rows, leaving other Characters' feed intact", async () => {
    await recordFeedEntry({
      id: 'a',
      characterId: 1,
      eventId: 'newMail',
      title: 't',
      body: 'b',
      firedAt: 1,
    });
    await recordFeedEntry({
      id: 'b',
      characterId: 2,
      eventId: 'newMail',
      title: 't',
      body: 'b',
      firedAt: 2,
    });

    await deleteFeedForCharacter(1);

    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].characterId).toBe(2);
  });
});
