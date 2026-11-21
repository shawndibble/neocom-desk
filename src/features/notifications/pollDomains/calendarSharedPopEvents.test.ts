import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPopView } from '@/sync/sharedPops';

const mocks = vi.hoisted(() => ({
  loadCalendarEvents: vi.fn(),
  alertedSharedPops: vi.fn(),
}));

vi.mock('@/features/character/calendar', () => ({
  loadCalendarEvents: mocks.loadCalendarEvents,
  prefetchCalendarEventDetails: async () => {},
}));
vi.mock('./sharedMoonPops', () => ({ alertedSharedPops: mocks.alertedSharedPops }));

import { calendarDomain } from './calendar';

const POP_AT = '2026-11-21T08:01:00.000Z';

const pop = {
  id: 'p1',
  structureId: 1035,
  refineryName: 'Ainsan - SSG Qpef',
  popTime: 'ready',
  popAt: POP_AT,
  fractured: false,
  startedAt: '2026-11-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
} as SharedPopView;

const event = (id: number, title: string, date: string) => ({
  event_id: id,
  title,
  event_date: date,
  event_response: 'accepted',
  importance: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-21T09:00:00.000Z'));
});

describe('calendar poll and Shared Pops', () => {
  const read = (events: unknown[]) =>
    mocks.loadCalendarEvents.mockResolvedValue({
      cached: { data: events, fromCache: true },
      needsReauth: false,
    });

  it('leaves out the event the pop already alerts about', async () => {
    const same = event(1, 'Ainsan Qpef', '2026-11-21T08:00:00.000Z');
    const other = event(2, 'Moro Moonpull', '2026-11-21T08:00:00.000Z');
    mocks.alertedSharedPops.mockResolvedValue([{ pop, moonName: null }]);
    read([same, other]);
    expect(await calendarDomain.load(7)).toEqual([other]);
  });

  it('keeps every event when no pop alerts this Character', async () => {
    const same = event(1, 'Ainsan Qpef', '2026-11-21T08:00:00.000Z');
    mocks.alertedSharedPops.mockResolvedValue([]);
    read([same]);
    expect(await calendarDomain.load(7)).toEqual([same]);
  });

  it('keeps a same-named event that starts at another time', async () => {
    const later = event(3, 'Ainsan Qpef', '2026-11-21T12:00:00.000Z');
    mocks.alertedSharedPops.mockResolvedValue([{ pop, moonName: null }]);
    read([later]);
    expect(await calendarDomain.load(7)).toEqual([later]);
  });
});
