import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadMailHeaders: vi.fn(),
  prefetchMailBodies: vi.fn(async () => {}),
  loadCalendarEvents: vi.fn(),
  prefetchCalendarEventDetails: vi.fn(async () => {}),
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

import { PREFETCH_TASKS } from './prefetch';

const task = (id: string) => {
  const found = PREFETCH_TASKS.find((t) => t.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
};

beforeEach(() => vi.clearAllMocks());

describe('boot prefetch of mail bodies and calendar details', () => {
  it('hands the synced mail headers on to the body prefetch', async () => {
    const headers = [{ mail_id: 1 }];
    mocks.loadMailHeaders.mockResolvedValue({ cached: { data: headers }, needsReauth: false });
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

  it('hands the synced calendar events on to the detail prefetch', async () => {
    const events = [{ event_id: 1 }];
    mocks.loadCalendarEvents.mockResolvedValue({ cached: { data: events }, needsReauth: false });
    await task('calendar').run(7);
    expect(mocks.prefetchCalendarEventDetails).toHaveBeenCalledWith(7, events);
  });
});
