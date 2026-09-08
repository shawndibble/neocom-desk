import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCalendarEvents, loadCalendarEvent } from './calendar';
import { calendarDomain } from '@/features/notifications/pollDomains';
import type { CalendarSnapshot } from '@/engine/notificationDiffs';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  // `shouldAdvanceTime` so msw's own timers still run under a faked clock.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  vi.useRealTimers();
});
afterAll(() => server.close());

describe('loadCalendarEvents', () => {
  it('fetches events and caches them', async () => {
    const events = [
      {
        event_id: 1,
        event_date: '2026-09-01T18:00:00Z',
        title: 'Fleet Op',
        importance: 1,
        event_response: 'accepted' as const,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json(events))
    );
    const result = await loadCalendarEvents(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(events);
  });

  it('falls back to cache offline', async () => {
    const events = [{ event_id: 1, title: 'Fleet Op' }];
    await db.esiCache.put({ characterId: CHAR_ID, key: 'calendar', value: events, fetchedAt: 3 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.error())
    );
    const result = await loadCalendarEvents(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: events,
      fetchedAt: new Date(3),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the calendar scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCalendarEvents(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

describe('loadCalendarEvents retention', () => {
  function summary(eventId: number, date: Date, title: string) {
    return {
      event_id: eventId,
      event_date: date.toISOString(),
      title,
      importance: 0,
      event_response: 'accepted' as const,
    };
  }

  it('keeps an event ESI dropped after it started, until its local day is over', async () => {
    const now = new Date(2026, 8, 8, 14, 0, 0);
    vi.setSystemTime(now);
    const running = summary(1, new Date(2026, 8, 8, 12, 0, 0), 'Fleet Op');
    const upcoming = summary(2, new Date(2026, 8, 8, 20, 0, 0), 'Structure Timer');

    // First read: ESI still lists both.
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([running, upcoming])
      )
    );
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([running, upcoming]);

    // Second read: the op has started, so ESI no longer returns it.
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([upcoming])
      )
    );
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([running, upcoming]);

    // Next day: the op is done being today's news.
    vi.setSystemTime(new Date(2026, 8, 9, 9, 0, 0));
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([upcoming]);
  });

  it('keeps an event whose date will not parse — unplaceable on a clock, still listed', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 14, 0, 0));
    const undated = {
      ...summary(1, new Date(2026, 8, 8, 20, 0, 0), 'Odd One'),
      event_date: 'nope',
    };
    const dated = summary(2, new Date(2026, 8, 8, 20, 0, 0), 'Structure Timer');
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([undated, dated])
      )
    );
    // Present, and sunk to the end rather than sorted against a NaN.
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([dated, undated]);
  });

  it('does not rewrite the seen row when the union has not changed', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 14, 0, 0));
    const upcoming = summary(1, new Date(2026, 8, 8, 20, 0, 0), 'Structure Timer');
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([upcoming])
      )
    );
    await loadCalendarEvents(CHAR_ID);
    const first = await db.esiCache.get([CHAR_ID, 'calendar:seen']);

    // A second load a minute later reads the same events; the poller does this
    // every five minutes per character and must not pay a write for it.
    vi.setSystemTime(new Date(2026, 8, 8, 14, 1, 0));
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    await loadCalendarEvents(CHAR_ID);
    expect((await db.esiCache.get([CHAR_ID, 'calendar:seen']))?.fetchedAt).toEqual(
      first?.fetchedAt
    );
  });

  it('carries a late-evening op past midnight, then drops it once its run is over', async () => {
    const lastNight = summary(1, new Date(2026, 8, 7, 22, 0, 0), 'Late Op');
    vi.setSystemTime(new Date(2026, 8, 7, 21, 30, 0));
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([lastNight])
      )
    );
    await loadCalendarEvents(CHAR_ID);

    // 01:00, an hour past midnight: ESI has dropped it, the op is still going.
    vi.setSystemTime(new Date(2026, 8, 8, 1, 0, 0));
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([]))
    );
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([lastNight]);

    // 05:00: past the assumed run, so the morning is not showing last night.
    vi.setSystemTime(new Date(2026, 8, 8, 5, 0, 0));
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([]);
  });

  it('drops an event that vanished before it started — a cancellation, not ESI trimming', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 14, 0, 0));
    const upcoming = summary(1, new Date(2026, 8, 8, 20, 0, 0), 'Cancelled Op');
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json([upcoming])
      )
    );
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([upcoming]);

    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([]))
    );
    expect((await loadCalendarEvents(CHAR_ID)).cached?.data).toEqual([]);
  });

  it('leaves the re-login state alone when nothing could be read at all', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 14, 0, 0));
    const running = summary(1, new Date(2026, 8, 8, 12, 0, 0), 'Fleet Op');
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([running]))
    );
    await loadCalendarEvents(CHAR_ID);

    // Scope revoked: the seen-list must not resurrect a list to show.
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCalendarEvents(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

/**
 * The seam, end to end. `diffCalendarEventStarting` looks for an entry whose
 * start is newly in the past — which, before retention, was an entry ESI had
 * already dropped from the list the poller reads. The unit tests either side
 * of this one each prove half: that retention keeps the event, and that the
 * diff fires given a snapshot containing it. Only driving the real
 * `loadCalendarEvents` through the domain's own `toSnapshot` and `diff` shows
 * that the half the poller actually gets is the half the diff needs.
 */
describe('the calendar poll domain, fed by the real loader', () => {
  it('fires calendarEventStarting for an event ESI dropped the moment it began', async () => {
    const event = {
      event_id: 1,
      event_date: new Date(2026, 8, 8, 13, 0, 0).toISOString(),
      title: 'Fleet Op',
      importance: 0,
      event_response: 'accepted' as const,
    };

    // Poll one, half an hour before the op: ESI still lists it.
    const before = new Date(2026, 8, 8, 12, 30, 0).getTime();
    vi.setSystemTime(before);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([event]))
    );
    const first = await calendarDomain.load(CHAR_ID);
    const prev = calendarDomain.toSnapshot(first!, before) as CalendarSnapshot;

    // Poll two, half an hour after it started: ESI returns nothing at all.
    const after = new Date(2026, 8, 8, 13, 30, 0).getTime();
    vi.setSystemTime(after);
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([]))
    );
    const second = await calendarDomain.load(CHAR_ID);
    const next = calendarDomain.toSnapshot(second!, after) as CalendarSnapshot;

    expect(
      calendarDomain.diff(CHAR_ID, prev, next, new Set(['calendarEventStarting'] as const))
    ).toEqual([
      {
        eventId: 'calendarEventStarting',
        characterId: CHAR_ID,
        calendarEventId: 1,
        title: 'Fleet Op',
      },
    ]);
  });

  it('does not re-announce a retained event as new', async () => {
    const event = {
      event_id: 1,
      event_date: new Date(2026, 8, 8, 13, 0, 0).toISOString(),
      title: 'Fleet Op',
      importance: 0,
      event_response: 'accepted' as const,
    };
    const before = new Date(2026, 8, 8, 12, 30, 0).getTime();
    vi.setSystemTime(before);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([event]))
    );
    const prev = calendarDomain.toSnapshot(
      (await calendarDomain.load(CHAR_ID))!,
      before
    ) as CalendarSnapshot;

    const after = new Date(2026, 8, 8, 13, 30, 0).getTime();
    vi.setSystemTime(after);
    await db.esiCache.delete([CHAR_ID, 'calendar']);
    server.resetHandlers();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([]))
    );
    const next = calendarDomain.toSnapshot(
      (await calendarDomain.load(CHAR_ID))!,
      after
    ) as CalendarSnapshot;

    // It re-enters the list this device reads, but its id is below the
    // high-water mark, which is exactly what that mark is for.
    expect(
      calendarDomain.diff(CHAR_ID, prev, next, new Set(['newCalendarEvent'] as const))
    ).toEqual([]);
  });
});

describe('loadCalendarEvent', () => {
  it('fetches one event detail and caches it under a per-event key', async () => {
    const detail = {
      event_id: 1,
      title: 'Fleet Op',
      date: '2026-09-01T18:00:00Z',
      duration: 60,
      importance: 1,
      owner_id: 1,
      owner_name: 'FC',
      owner_type: 'character' as const,
      response: 'accepted',
      text: 'Bring your ship',
    };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => HttpResponse.json(detail))
    );
    const result = await loadCalendarEvent(CHAR_ID, 1);
    expect(result?.data).toEqual(detail);
    expect((await db.esiCache.get([CHAR_ID, 'calendar:1']))?.value).toEqual(detail);
  });
});
