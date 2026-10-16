import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';

const mocks = vi.hoisted(() => ({
  loadMailHeaders: vi.fn(),
  prefetchMailBodies: vi.fn<(characterId: number, headers: unknown) => Promise<void>>(
    async () => {}
  ),
  loadCalendarEvents: vi.fn(),
  prefetchCalendarEventDetails: vi.fn<(characterId: number, events: unknown) => Promise<void>>(
    async () => {}
  ),
}));

vi.mock('@/features/character/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/mail')>()),
  loadMailHeaders: mocks.loadMailHeaders,
  prefetchMailBodies: mocks.prefetchMailBodies,
}));
vi.mock('@/features/character/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/calendar')>()),
  loadCalendarEvents: mocks.loadCalendarEvents,
  prefetchCalendarEventDetails: mocks.prefetchCalendarEventDetails,
}));

import { PREFETCH_TASKS, prefetchRosterDetails } from './prefetch';

const task = (id: string) => {
  const found = PREFETCH_TASKS.find((t) => t.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
};

const live = <T>(data: T) => ({ cached: { data, fromCache: false }, needsReauth: false });

beforeEach(() => vi.clearAllMocks());

describe('boot prefetch of mail bodies and calendar details', () => {
  it('hands the synced mail headers on to the body prefetch', async () => {
    const headers = [{ mail_id: 1 }];
    mocks.loadMailHeaders.mockResolvedValue(live(headers));
    await task('mail-headers').run(7);
    expect(mocks.prefetchMailBodies).toHaveBeenCalledWith(7, headers);
  });

  it('prefetches nothing when the header sync gave nothing or needs a re-login', async () => {
    mocks.loadMailHeaders.mockResolvedValue({ cached: null, needsReauth: true });
    await task('mail-headers').run(7);
    mocks.loadMailHeaders.mockResolvedValue({ cached: { data: [] }, needsReauth: true });
    await task('mail-headers').run(7);
    expect(mocks.prefetchMailBodies).not.toHaveBeenCalled();
  });

  it('prefetches nothing from a list served from the cache: no sync landed', async () => {
    mocks.loadMailHeaders.mockResolvedValue({
      cached: { data: [{ mail_id: 1 }], fromCache: true },
      needsReauth: false,
    });
    mocks.loadCalendarEvents.mockResolvedValue({
      cached: { data: [{ event_id: 1 }], fromCache: true },
      needsReauth: false,
    });
    await task('mail-headers').run(7);
    await task('calendar').run(7);
    expect(mocks.prefetchMailBodies).not.toHaveBeenCalled();
    expect(mocks.prefetchCalendarEventDetails).not.toHaveBeenCalled();
  });

  it('hands the synced calendar events on to the detail prefetch', async () => {
    const events = [{ event_id: 1 }];
    mocks.loadCalendarEvents.mockResolvedValue(live(events));
    await task('calendar').run(7);
    expect(mocks.prefetchCalendarEventDetails).toHaveBeenCalledWith(7, events);
  });
});

describe('prefetchRosterDetails', () => {
  const MAIL = ESI_REGISTRY.getCharacterMailHeaders.scope;
  const CALENDAR = ESI_REGISTRY.getCharacterCalendar.scope;
  const token = (characterId: number, scopes: string[]) => ({
    characterId,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 600_000,
    scopes,
  });

  beforeEach(async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await db.tokens.clear();
    await db.tokens.bulkPut([
      token(1, [MAIL, CALENDAR]), // the active Character: its own tasks cover it
      token(2, [MAIL, CALENDAR]),
      token(3, [MAIL]), // no calendar grant
      token(4, []), // nothing granted: no list may be asked for
    ]);
    mocks.loadMailHeaders.mockImplementation(async () => live([{ mail_id: 1 }]));
    mocks.loadCalendarEvents.mockImplementation(async () => live([{ event_id: 1 }]));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('prefetches for every other Character that holds the scope, and no one else', async () => {
    await prefetchRosterDetails(1);

    expect(mocks.prefetchMailBodies.mock.calls.map((call) => call[0])).toEqual([2, 3]);
    expect(mocks.prefetchCalendarEventDetails.mock.calls.map((call) => call[0])).toEqual([2]);
    expect(mocks.loadMailHeaders.mock.calls.map((call) => call[0])).toEqual([2, 3]);
  });

  it('does nothing on a metered connection', async () => {
    vi.stubGlobal('navigator', { onLine: true, connection: { saveData: true } });
    await prefetchRosterDetails(1);
    expect(mocks.loadMailHeaders).not.toHaveBeenCalled();
  });

  it('stops when the run is cancelled, and a failing Character does not stop the rest', async () => {
    mocks.loadMailHeaders.mockRejectedValueOnce(new Error('boom'));
    await prefetchRosterDetails(1);
    expect(mocks.prefetchMailBodies.mock.calls.map((call) => call[0])).toEqual([3]);

    mocks.prefetchMailBodies.mockClear();
    await prefetchRosterDetails(1, { cancelled: true });
    expect(mocks.prefetchMailBodies).not.toHaveBeenCalled();
  });
});
