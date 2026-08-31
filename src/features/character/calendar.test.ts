import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCalendarEvents, loadCalendarEvent } from './calendar';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
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
    expect(result.cached).toEqual({ data: events, fetchedAt: new Date(3), fromCache: true });
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
