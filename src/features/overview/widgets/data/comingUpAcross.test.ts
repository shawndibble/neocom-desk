import { describe, expect, it } from 'vitest';
import { buildView, feedsOf, kindSumsAcrossCharacters } from './models';
import type { BuildContext, FeedState } from './types';
import type { CalendarBoardData } from '@/features/character/calendarBoardData';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const board = (over: Partial<CalendarBoardData> = {}): CalendarBoardData => ({
  corporations: [],
  sharedPops: [],
  readableRefineries: [],
  sharingCorporations: [],
  skyhookRaidDetails: [],
  readableKinds: ['orderExpiry'],
  reauthKinds: [],
  oldestFetchedAt: new Date(NOW),
  fromCache: false,
  events: [],
  loadedAtMs: NOW,
  ...over,
});

describe('Calendar across every Character', () => {
  it('reads its own feed when scoped to All', () => {
    expect(kindSumsAcrossCharacters('comingUp')).toBe(true);
    expect(feedsOf('comingUp', undefined, true)).toEqual(['calendarAll']);
    expect(feedsOf('comingUp')).toEqual(['calendar']);
  });

  it("names the Character a clock belongs to in the row's detail", () => {
    const view = buildView(
      'comingUp',
      {
        calendarAll: ok(
          board({
            orderExpiries: [
              {
                id: '1',
                subject: 'Order',
                detail: '',
                deadlineMs: NOW + 3_600_000,
                characterName: 'Pilot Two',
              },
            ],
          })
        ),
      },
      ctx()
    );
    expect(view.rows[0]?.detail).toContain('Pilot Two');
  });
});
