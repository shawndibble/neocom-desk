import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  NOTIFICATION_FEED_LIMIT,
  idsBeyondLimit,
  recordFeedEntry,
  readFeed,
  dismissFeedEntry,
  dismissFeedEntries,
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

describe('recordFeedEntry / readFeed', () => {
  it('stores an entry and reads it back', async () => {
    await recordFeedEntry({
      characterId: 1,
      eventId: 'newMail',
      title: 'New mail',
      body: 'Pilot has new mail.',
      firedAt: 1000,
    });
    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ characterId: 1, eventId: 'newMail', firedAt: 1000 });
    expect(feed[0].id).toEqual(expect.any(String));
  });

  it('reads newest first', async () => {
    for (const firedAt of [1000, 3000, 2000]) {
      await recordFeedEntry({
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
});

describe('dismissing', () => {
  it('dismisses one entry, leaving the rest', async () => {
    await recordFeedEntry({
      characterId: 1,
      eventId: 'newMail',
      title: 'a',
      body: 'b',
      firedAt: 1,
    });
    await recordFeedEntry({
      characterId: 1,
      eventId: 'newMail',
      title: 'c',
      body: 'd',
      firedAt: 2,
    });
    const [newest] = await readFeed();

    await dismissFeedEntry(newest.id);

    const feed = await readFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('a');
  });

  it('dismisses the given ids in bulk, leaving the others', async () => {
    for (let i = 0; i < 4; i++) {
      await recordFeedEntry({
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

    const left = await readFeed();
    expect(left).toHaveLength(1);
    expect(left[0].characterId).toBe(3);
  });
});
