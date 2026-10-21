import { describe, expect, it } from 'vitest';
import type { CorpStarbaseRow, CorpStarbasesFeed } from './corpFeeds';
import { corpStarbases, toBoardStarbases } from './corpStarbaseModels';
import type { BuildContext, FeedState } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ctx: BuildContext = {
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};

// 12235 is a large tower (40 blocks/hour); 20060 a small one (10); 1 is unknown to the table.
const LARGE = 12235;
const SMALL = 20060;

function tower(over: Partial<CorpStarbaseRow> = {}): CorpStarbaseRow {
  return {
    starbaseId: 1,
    systemId: 100,
    typeId: LARGE,
    state: 'online',
    reinforcedUntilMs: null,
    unanchorsAtMs: null,
    bay: { fuelBlocks: 40 * 100, strontium: 400 },
    ...over,
  };
}

const feedOf = (
  starbases: CorpStarbaseRow[],
  over: Partial<CorpStarbasesFeed> = {}
): CorpStarbasesFeed => ({
  readable: true,
  needsReauth: false,
  fetchedAt: new Date(NOW),
  fromCache: false,
  starbases,
  typeNames: new Map([
    [LARGE, 'Caldari Control Tower'],
    [SMALL, 'Caldari Control Tower Small'],
  ]),
  systemNames: new Map([
    [100, 'Efa'],
    [200, 'Jita'],
  ]),
  ...over,
});

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const build = (feed: FeedState<CorpStarbasesFeed> | undefined) =>
  corpStarbases({ corpStarbases: feed }, ctx);

describe('corpStarbases', () => {
  it('is loading until the feed answers', () => {
    expect(build(undefined).status.loading).toBe(true);
  });

  it('says so when this Character may not read towers', () => {
    const view = build(ok(feedOf([], { readable: false })));
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('is empty for a corporation with no towers', () => {
    const view = build(ok(feedOf([])));
    expect(view.status.isEmpty).toBe(true);
    expect(view.number.value).toBe('0');
  });

  it('counts towers and names the one that runs dry first', () => {
    const view = build(
      ok(
        feedOf([
          tower({ starbaseId: 1, systemId: 100, bay: { fuelBlocks: 40 * 200, strontium: 0 } }),
          tower({ starbaseId: 2, systemId: 200, bay: { fuelBlocks: 40 * 100, strontium: 0 } }),
        ])
      )
    );
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpStarbases.lowest{"name":"Jita","duration":"4d 4h"}'
    );
    expect(view.table?.rows.map((row) => row.key)).toEqual(['2', '1']);
    expect(view.number.tone).toBe('clear');
  });

  it('warns when a tower has under 48 hours of fuel', () => {
    const view = build(ok(feedOf([tower({ bay: { fuelBlocks: 40 * 47, strontium: 0 } })])));
    expect(view.number.tone).toBe('warning');
    expect(view.table?.rows[0]?.tone).toBe('warning');
  });

  it('does not warn at exactly 48 hours', () => {
    const view = build(ok(feedOf([tower({ bay: { fuelBlocks: 40 * 48, strontium: 0 } })])));
    expect(view.number.tone).toBe('clear');
  });

  it('marks an empty bay critical and out of fuel', () => {
    const view = build(ok(feedOf([tower({ bay: { fuelBlocks: 0, strontium: 0 } })])));
    expect(view.table?.rows[0]?.tone).toBe('critical');
    expect(view.table?.rows[0]?.cells[3]).toContain('corp.board.dry');
  });

  it('never prints a countdown shorter than the cache window', () => {
    const view = build(ok(feedOf([tower({ bay: { fuelBlocks: 20, strontium: 0 } })])));
    expect(view.table?.rows[0]?.cells[3]).toContain('corp.board.underCacheWindow');
  });

  it('counts the countdown from when the bay was read, not from now', () => {
    const view = build(
      ok(
        feedOf([tower({ bay: { fuelBlocks: 40 * 10, strontium: 0 } })], {
          fetchedAt: new Date(NOW - 5 * HOUR),
        })
      )
    );
    // 10 h of fuel read 5 h ago leaves 5 h.
    expect(view.table?.rows[0]?.cells[3]).toContain('"duration":"5h 0m"');
  });

  it('shows quantities only for a tower type with no known burn rate', () => {
    const view = build(ok(feedOf([tower({ typeId: 1, bay: { fuelBlocks: 1200, strontium: 5 } })])));
    expect(view.table?.rows[0]?.cells[3]).toBe('1,200');
    expect(view.number.secondary).toBeUndefined();
    expect(view.number.tone).toBe('clear');
  });

  it('shows the unknown dash where no bay was read, never a zero', () => {
    const view = build(ok(feedOf([tower({ state: 'offline', bay: null })])));
    const cells = view.table?.rows[0]?.cells;
    expect(cells?.[3]).toBe('—');
    expect(cells?.[4]).toBe('—');
  });

  it('shows a reinforced tower with its timer and a warning tone', () => {
    const view = build(
      ok(feedOf([tower({ state: 'reinforced', bay: null, reinforcedUntilMs: NOW + 3 * DAY })]))
    );
    const row = view.table?.rows[0];
    expect(row?.cells[2]).toBe('overview.widgets.corpStarbases.state.reinforced');
    expect(row?.cells[5]).toBe('3d 0h');
    expect(row?.tone).toBe('warning');
  });
});

describe('toBoardStarbases', () => {
  it('turns a bay into a fuel deadline from the read time and passes the timers through', () => {
    const [source] = toBoardStarbases(
      feedOf([tower({ bay: { fuelBlocks: 400, strontium: 0 }, reinforcedUntilMs: NOW + DAY })], {
        fetchedAt: new Date(NOW - HOUR),
      }),
      NOW
    );
    expect(source).toEqual({
      starbaseId: 1,
      name: 'Caldari Control Tower (Efa)',
      fuelExpiresMs: NOW - HOUR + 10 * HOUR,
      reinforcedUntilMs: NOW + DAY,
      unanchorsAtMs: null,
    });
  });

  it('has no fuel clock for an unknown rate, an unread bay or a tower that is not online', () => {
    const sources = toBoardStarbases(
      feedOf([
        tower({ starbaseId: 1, typeId: 1 }),
        tower({ starbaseId: 2, bay: null }),
        tower({ starbaseId: 3, state: 'offline' }),
      ]),
      NOW
    );
    expect(sources.map((s) => s.fuelExpiresMs)).toEqual([null, null, null]);
  });
});
