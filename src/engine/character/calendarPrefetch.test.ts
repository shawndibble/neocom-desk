import { DAY_MS, HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { selectCalendarEventsToPrefetch } from './calendarPrefetch';

const NOW = Date.UTC(2026, 9, 16, 12);
const event = (event_id: number, startMs: number) => ({
  event_id,
  event_date: new Date(startMs).toISOString(),
});
const pick = (
  events: ReturnType<typeof event>[],
  options: { cached?: number[]; limit?: number; horizonDays?: number } = {}
) =>
  selectCalendarEventsToPrefetch(events, {
    nowMs: NOW,
    horizonMs: (options.horizonDays ?? 14) * DAY_MS,
    cachedIds: new Set(options.cached ?? []),
    limit: options.limit ?? 20,
  });

describe('selectCalendarEventsToPrefetch', () => {
  it('takes events inside the horizon, soonest first', () => {
    expect(
      pick([event(3, NOW + 5 * DAY_MS), event(1, NOW + DAY_MS), event(2, NOW + 2 * DAY_MS)])
    ).toEqual([1, 2, 3]);
  });

  it('leaves out events past the horizon', () => {
    expect(pick([event(1, NOW + 14 * DAY_MS), event(2, NOW + 14 * DAY_MS + 1)])).toEqual([1]);
  });

  it('keeps one that started hours ago while the calendar still shows it, but not an old one', () => {
    expect(pick([event(1, NOW - 5 * HOUR_MS), event(2, NOW - 15 * DAY_MS)])).toEqual([1]);
  });

  it('never asks again for details already cached', () => {
    expect(pick([event(1, NOW + DAY_MS), event(2, NOW + 2 * DAY_MS)], { cached: [1] })).toEqual([
      2,
    ]);
  });

  it('bounds the window before it drops what is cached', () => {
    const events = [1, 2, 3, 4].map((id) => event(id, NOW + id * DAY_MS));
    expect(pick(events, { limit: 2, cached: [1] })).toEqual([2]);
  });

  it('skips an event whose date cannot be read', () => {
    expect(pick([{ event_id: 1, event_date: 'soon' }, event(2, NOW + DAY_MS)])).toEqual([2]);
  });
});
