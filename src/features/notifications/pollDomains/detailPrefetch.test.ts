import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadMailHeaders: vi.fn(),
  prefetchMailBodies: vi.fn(async () => {}),
  loadCalendarEvents: vi.fn(),
  prefetchCalendarEventDetails: vi.fn(async () => {}),
}));

vi.mock('@/features/character/mail', () => ({
  loadMailHeaders: mocks.loadMailHeaders,
  prefetchMailBodies: mocks.prefetchMailBodies,
}));
vi.mock('@/features/character/calendar', () => ({
  loadCalendarEvents: mocks.loadCalendarEvents,
  prefetchCalendarEventDetails: mocks.prefetchCalendarEventDetails,
}));

import { useActiveCharacter } from '@/stores/activeCharacter';
import { calendarDomain } from './calendar';
import { mailDomain } from './mail';

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 7 });
});

describe('poll domains and the detail prefetch', () => {
  it('mail: prefetches bodies after a header read that reached ESI', async () => {
    const headers = [{ mail_id: 1 }];
    mocks.loadMailHeaders.mockResolvedValue({
      cached: { data: headers, fromCache: false },
      needsReauth: false,
    });
    expect(await mailDomain.load(7)).toBe(headers);
    expect(mocks.prefetchMailBodies).toHaveBeenCalledWith(7, headers);
  });

  it("mail: not for a Character that is not the active one (an alt's bodies are fetched when opened)", async () => {
    mocks.loadMailHeaders.mockResolvedValue({
      cached: { data: [{ mail_id: 1 }], fromCache: false },
      needsReauth: false,
    });
    expect(await mailDomain.load(8)).toEqual([{ mail_id: 1 }]);
    expect(mocks.prefetchMailBodies).not.toHaveBeenCalled();
  });

  it('mail: not after a cached read, a re-login, or nothing', async () => {
    mocks.loadMailHeaders.mockResolvedValueOnce({
      cached: { data: [{ mail_id: 1 }], fromCache: true },
      needsReauth: false,
    });
    await mailDomain.load(7);
    mocks.loadMailHeaders.mockResolvedValueOnce({ cached: null, needsReauth: true });
    await mailDomain.load(7);
    expect(mocks.prefetchMailBodies).not.toHaveBeenCalled();
  });

  it('calendar: prefetches details after a read that reached ESI', async () => {
    const events = [{ event_id: 1, event_date: '2026-10-17T18:00:00Z' }];
    mocks.loadCalendarEvents.mockResolvedValue({
      cached: { data: events, fromCache: false },
      needsReauth: false,
    });
    await calendarDomain.load(7);
    expect(mocks.prefetchCalendarEventDetails).toHaveBeenCalledWith(7, events);
  });

  it('calendar: not after a cached read', async () => {
    mocks.loadCalendarEvents.mockResolvedValue({
      cached: { data: [{ event_id: 1 }], fromCache: true },
      needsReauth: false,
    });
    await calendarDomain.load(7);
    expect(mocks.prefetchCalendarEventDetails).not.toHaveBeenCalled();
  });
});
