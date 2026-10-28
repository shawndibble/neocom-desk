import { afterEach, describe, expect, it } from 'vitest';
import type { BoardExtractionSource, BoardStructureSource } from '@/engine/corp/board';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import { formatDateOnly } from '@/lib/timestamp';
import type { MoonChunksBoardData, StructuresBoardData } from '../../data/boardData';
import type { CorpJobsFeed, CorpSovereigntyFeed, CorpStarbasesFeed } from './corpFeeds';
import { corpDeadlines, corpJobs } from './corpClockModels';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const MIN = 60_000;
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

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const loading = <T>(): FeedState<T> => ({ data: null, error: false, loading: true });

function structure(over: Partial<BoardStructureSource> = {}): BoardStructureSource {
  return {
    structureId: 1,
    name: 'Efa - Helios Prime',
    fuelExpiresMs: NOW + 20 * DAY,
    state: 'shield_vulnerable',
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    ...over,
  };
}

const structuresFeed = (list: BoardStructureSource[] | null, needsReauth = false) =>
  ok<StructuresBoardData>({
    structures: list,
    structureCount: list?.length ?? 0,
    needsReauth,
    fetchedAt: new Date(NOW - HOUR),
  });

/** A moon read: null is unreadable; each extraction arrives at `chunkArrivalMs`. */
const moonFeed = (extractions: BoardExtractionSource[] | null, needsReauth = false) =>
  ok<MoonChunksBoardData>({
    chunks: extractions === null ? null : [],
    extractions: extractions ?? undefined,
    needsReauth,
    fetchedAt: new Date(NOW - HOUR),
    loadedAt: NOW,
  });

function job(over: Partial<CorporationIndustryJob> = {}): CorporationIndustryJob {
  return {
    job_id: 1,
    installer_id: 77,
    activity_id: 1,
    blueprint_id: 1,
    blueprint_type_id: 500,
    blueprint_location_id: 1,
    output_location_id: 1,
    facility_id: 1,
    location_id: 1,
    runs: 2,
    start_date: new Date(NOW - 2 * HOUR).toISOString(),
    end_date: new Date(NOW + 2 * HOUR).toISOString(),
    status: 'active',
    product_type_id: 600,
    ...over,
  };
}

const jobsFeed = (jobs: CorporationIndustryJob[], over: Partial<CorpJobsFeed> = {}) =>
  ok<CorpJobsFeed>({
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(NOW - HOUR),
    fromCache: true,
    jobs,
    typeNames: new Map([
      [600, 'Rifter'],
      [601, 'Merlin'],
      [500, 'Rifter Blueprint'],
    ]),
    installerNames: new Map([[77, 'Ada Pilot']]),
    ...over,
  });

const unreadableJobs = (needsReauth = false) =>
  ok<CorpJobsFeed>({
    readable: false,
    needsReauth,
    fetchedAt: null,
    fromCache: false,
    jobs: [],
    typeNames: new Map(),
    installerNames: new Map(),
  });

describe('corpDeadlines', () => {
  it('counts what is due in 24h across all three feeds and names the next one', () => {
    const feeds: Feeds = {
      structures: structuresFeed([
        structure({ fuelExpiresMs: NOW + 5 * HOUR }),
        structure({ structureId: 2, name: 'Efa - Second', fuelExpiresMs: NOW + 10 * DAY }),
      ]),
      moonChunks: moonFeed([
        {
          structureId: 3,
          subject: 'Efa - Moon Drill',
          chunkArrivalMs: NOW + 8 * HOUR,
          naturalDecayMs: NOW + 11 * HOUR,
        },
      ]),
      corpJobs: jobsFeed([job({ status: 'ready', end_date: new Date(NOW - HOUR).toISOString() })]),
    };
    const view = corpDeadlines(feeds, ctx);
    // fuel in 5h, moon in 8h; a finished job is "Ready to deliver", not a deadline
    expect(view.number.value).toBe('2');
    expect(view.number.unit).toBe('corp.standing.dueSoon');
    expect(view.number.secondary?.text).toContain('Helios');
    expect(view.number.notes).toEqual(['corp.standing.dueSoonNoneLate']);
    expect(view.table?.rows).toHaveLength(3);
    expect(view.table?.rows[0]?.cells[0]).toContain('Helios');
    expect(view.status.isEmpty).toBe(false);
    expect(view.to).toBeNull();
  });

  it('names the soonest future item as Next, and leaves a decayed chunk out', () => {
    const view = corpDeadlines(
      {
        structures: structuresFeed([
          structure({ name: 'Dry - Athanor', fuelExpiresMs: null }),
          structure({ structureId: 2, name: 'Efa - Second', fuelExpiresMs: NOW + 5 * HOUR }),
        ]),
        moonChunks: moonFeed([
          {
            structureId: 3,
            subject: 'Efa - Moon 2',
            chunkArrivalMs: NOW - 4 * DAY,
            naturalDecayMs: NOW - 3 * DAY,
          },
        ]),
        corpJobs: jobsFeed([]),
      },
      ctx
    );
    expect(view.number.secondary?.text).toContain('Second');
    expect(view.table?.rows.map((row) => row.cells[0])).not.toContain('Moon 2');
  });

  it('adds the starbase fuel and reinforcement clocks, and waits for them while they load', () => {
    const towers = ok<CorpStarbasesFeed>({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      fromCache: false,
      starbases: [
        {
          starbaseId: 9,
          systemId: 100,
          typeId: 12235,
          state: 'online',
          reinforcedUntilMs: null,
          unanchorsAtMs: null,
          // 40 blocks an hour: 6 hours left.
          bay: { fuelBlocks: 240, strontium: 400 },
          bayReadAtMs: NOW,
        },
      ],
      typeNames: new Map([[12235, 'Caldari Control Tower']]),
      systemNames: new Map([[100, 'Efa']]),
    });
    const base: Feeds = {
      structures: structuresFeed([]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    };
    const view = corpDeadlines({ ...base, corpStarbases: towers }, ctx);
    expect(view.number.value).toBe('1');
    expect(view.table?.rows[0]?.cells[0]).toBe('Caldari Control Tower (Efa)');
    expect(view.table?.rows[0]?.cells[1]).toBe('corp.board.detail.fuel');

    const waiting = corpDeadlines({ ...base, corpStarbases: loading<CorpStarbasesFeed>() }, ctx);
    expect(waiting.status.loading).toBe(true);
  });

  it('surfaces a failed starbase read like any other failed feed', () => {
    const base: Feeds = {
      structures: structuresFeed([structure({ fuelExpiresMs: NOW + 5 * HOUR })]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    };
    const failedTowers: FeedState<CorpStarbasesFeed> = { data: null, error: true, loading: false };
    // Partial data still drawn, failure flagged.
    const partial = corpDeadlines({ ...base, corpStarbases: failedTowers }, ctx);
    expect(partial.number.value).toBe('1');
    expect(partial.status.error).toBe(true);
    // Nothing else readable: the failure is the answer.
    const none = corpDeadlines(
      {
        structures: ok({ ...structuresFeed([]).data!, structures: null }),
        moonChunks: ok({ ...moonFeed([]).data!, chunks: null }),
        corpJobs: ok({ ...jobsFeed([]).data!, readable: false }),
        corpStarbases: failedTowers,
      },
      ctx
    );
    expect(none.status.error).toBe(true);
  });

  it('flags any failed feed the same way while still drawing the rest', () => {
    const failed = { data: null, error: true, loading: false };
    const view = corpDeadlines(
      {
        structures: failed as Feeds['structures'],
        moonChunks: moonFeed([
          {
            structureId: 3,
            subject: 'Efa - Moon Drill',
            chunkArrivalMs: NOW + 3 * HOUR,
            naturalDecayMs: NOW + 6 * HOUR,
          },
        ]),
        corpJobs: jobsFeed([]),
      },
      ctx
    );
    expect(view.number.value).toBe('1');
    expect(view.status.error).toBe(true);
  });

  it('carries skyhook raid windows as sovRaid rows with severity from time remaining', () => {
    const hook = (key: string, startMs: number, endMs: number, planetName: string) => ({
      key,
      kind: 'skyhook' as const,
      structureId: 1,
      systemId: 1,
      planetName,
      windowStartMs: startMs,
      windowEndMs: endMs,
      reagents: null,
      state: null,
      hubBay: null,
    });
    const raids = ok<CorpSovereigntyFeed>({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      fromCache: false,
      rows: [
        hook('skyhook:1', NOW + 2 * HOUR, NOW + 4 * HOUR, 'X-7OMU IV'),
        hook('skyhook:2', NOW + 5 * DAY, NOW + 5 * DAY + HOUR, 'Efa VI'),
      ],
      systemNames: new Map(),
      typeNames: new Map(),
      prices: new Map(),
      jumps: new Map(),
    });
    const view = corpDeadlines(
      {
        structures: structuresFeed([]),
        moonChunks: moonFeed([]),
        corpJobs: jobsFeed([]),
        corpSovereignty: raids,
      },
      ctx
    );
    expect(view.rows.map((r) => [r.title, r.detail, r.tone])).toEqual([
      ['X-7OMU IV', 'corp.board.detail.sovRaid.skyhook.upcoming', 'critical'],
      ['Efa VI', 'corp.board.detail.sovRaid.skyhook.upcoming', 'watch'],
    ]);
    // Both land in the Deadline Strip's fortnight.
    const chart = view.chart;
    if (chart?.kind !== 'bars') throw new Error('expected the day-bar chart');
    expect(chart.values.reduce((a: number, b: number) => a + b, 0)).toBe(2);
  });

  it('is not blocked by a starbase read this Character may not make', () => {
    const feeds: Feeds = {
      structures: structuresFeed([structure({ fuelExpiresMs: NOW + 5 * HOUR })]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
      corpStarbases: ok<CorpStarbasesFeed>({
        readable: false,
        needsReauth: false,
        fetchedAt: null,
        fromCache: false,
        starbases: [],
        typeNames: new Map(),
        systemNames: new Map(),
      }),
    };
    expect(corpDeadlines(feeds, ctx).number.value).toBe('1');
  });

  it('never prints a countdown shorter than the one-hour cache window', () => {
    const feeds: Feeds = {
      structures: structuresFeed([structure({ stateTimerEndMs: NOW + 20 * MIN })]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    };
    const view = corpDeadlines(feeds, ctx);
    const timer = view.table?.rows.find((row) => row.key === 'state:1');
    expect(timer?.cells[2]).toBe('corp.board.underCacheWindow');
    expect(view.number.secondary?.text).toContain('corp.board.underCacheWindow');
  });

  it('draws a day bar per day of the strip', () => {
    const feeds: Feeds = {
      structures: structuresFeed([structure({ fuelExpiresMs: NOW + 5 * HOUR })]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    };
    const chart = corpDeadlines(feeds, ctx).chart;
    expect(chart?.kind).toBe('bars');
    if (chart?.kind !== 'bars') return;
    expect(chart.values).toHaveLength(14);
    expect(chart.values[0]).toBe(1);
    expect(chart.summary).toContain('corp.standing.strip.describe');
  });

  describe('on the Time format clock', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    // 05:00 UTC the next day is 22:00 tonight in Los Angeles: two days on two clocks.
    const feeds = (): Feeds => ({
      structures: structuresFeed([structure({ fuelExpiresMs: NOW + 17 * HOUR })]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    });
    const bars = (zone: 'UTC' | undefined) => {
      const chart = corpDeadlines(feeds(), { ...ctx, zone }).chart;
      if (chart?.kind !== 'bars') throw new Error('expected a bars chart');
      return chart;
    };

    it('buckets the day bars on the pilot local days by default', () => {
      process.env.TZ = 'America/Los_Angeles';
      expect(bars(undefined).values.slice(0, 3)).toEqual([1, 0, 0]);
    });

    it('buckets and labels the day bars on EVE days when the setting is eve', () => {
      process.env.TZ = 'America/Los_Angeles';
      const chart = bars('UTC');
      expect(chart.values.slice(0, 3)).toEqual([0, 1, 0]);
      expect(chart.tips?.[1]?.title).toBe(formatDateOnly(new Date(Date.UTC(2026, 9, 12)), 'UTC'));
    });
  });

  it('draws what it could read when one feed is unreadable', () => {
    const feeds: Feeds = {
      structures: structuresFeed([structure({ fuelExpiresMs: NOW + 5 * HOUR })]),
      moonChunks: moonFeed(null),
      corpJobs: unreadableJobs(),
    };
    const view = corpDeadlines(feeds, ctx);
    expect(view.number.value).toBe('1');
    expect(view.status.needsPermission).toBe(false);
  });

  it('is loading while a feed loads', () => {
    const feeds: Feeds = {
      structures: structuresFeed([]),
      moonChunks: loading(),
      corpJobs: jobsFeed([]),
    };
    expect(corpDeadlines(feeds, ctx).status).toMatchObject({ loading: true, hasData: false });
  });

  it('asks for a grant when every feed is unreadable and one lapsed', () => {
    const feeds: Feeds = {
      structures: structuresFeed(null, true),
      moonChunks: moonFeed(null),
      corpJobs: unreadableJobs(),
    };
    const view = corpDeadlines(feeds, ctx);
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('is empty with the unreadable message when no role covers any feed', () => {
    const feeds: Feeds = {
      structures: structuresFeed(null),
      moonChunks: moonFeed(null),
      corpJobs: unreadableJobs(),
    };
    const view = corpDeadlines(feeds, ctx);
    expect(view.status).toMatchObject({ needsPermission: false, isEmpty: true });
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('is empty when everything read fine and nothing has a clock', () => {
    const feeds: Feeds = {
      structures: structuresFeed([]),
      moonChunks: moonFeed([]),
      corpJobs: jobsFeed([]),
    };
    expect(corpDeadlines(feeds, ctx).status.isEmpty).toBe(true);
  });
});

describe('corpJobs', () => {
  const feeds = (): Feeds => ({
    corpJobs: jobsFeed([
      job({ job_id: 1, end_date: new Date(NOW + 5 * HOUR).toISOString() }),
      job({
        job_id: 2,
        product_type_id: 601,
        end_date: new Date(NOW + HOUR).toISOString(),
        start_date: new Date(NOW - HOUR).toISOString(),
      }),
      job({ job_id: 3, status: 'ready', end_date: new Date(NOW - 3 * HOUR).toISOString() }),
      job({ job_id: 4, status: 'delivered' }),
    ]),
  });

  it('never ticks a job down inside the one-hour cache window', () => {
    const view = corpJobs(
      { corpJobs: jobsFeed([job({ end_date: new Date(NOW + 20 * MIN).toISOString() })]) },
      ctx
    );
    expect(view.table?.rows[0]?.cells[1]).toMatchObject({ text: 'corp.board.underCacheWindow' });
    expect(view.number.secondary?.text).toContain('corp.board.underCacheWindow');
  });

  it('counts running jobs and flags the ones ready to deliver', () => {
    const view = corpJobs(feeds(), ctx);
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toBe('overview.widgets.corpJobs.ready{"count":1}');
    expect(view.number.tone).toBe('warning');
  });

  it('names the next job to finish when nothing waits', () => {
    const view = corpJobs(
      { corpJobs: jobsFeed([job({ end_date: new Date(NOW + HOUR).toISOString() })]) },
      ctx
    );
    expect(view.number.secondary?.text).toContain('overview.widgets.corpJobs.next');
    expect(view.number.secondary?.text).toContain('Rifter');
  });

  it('sorts ready first, then soonest end, with product, installer and a progress bar', () => {
    const view = corpJobs(feeds(), ctx);
    expect(view.table?.rows.map((row) => row.key)).toEqual(['3', '2', '1']);
    const merlin = view.table!.rows[1]!;
    expect(merlin.cells[0]).toBe('overview.board.jobSubject{"name":"Merlin","count":2}');
    const ends = merlin.cells[1];
    expect(ends).toMatchObject({ bar: 0.5 });
    expect(view.table!.columns.map((c) => c.key)).toEqual([
      'product',
      'ends',
      'installer',
      'activity',
    ]);
    expect(merlin.cells[2]).toBe('Ada Pilot');
  });

  it('charts the time left per job', () => {
    const chart = corpJobs(feeds(), ctx).chart;
    expect(chart?.kind).toBe('hbars');
    if (chart?.kind !== 'hbars') return;
    expect(chart.rows).toHaveLength(3);
  });

  it('is empty with no active or ready jobs, and unreadable apart from that', () => {
    expect(
      corpJobs({ corpJobs: jobsFeed([job({ status: 'delivered' })]) }, ctx).status.isEmpty
    ).toBe(true);
    const lapsed = corpJobs({ corpJobs: unreadableJobs(true) }, ctx);
    expect(lapsed.status.needsPermission).toBe(true);
    expect(lapsed.emptyMessage).toBe('overview.board.corpUnreadable');
    expect(corpJobs({ corpJobs: loading() }, ctx).status.loading).toBe(true);
  });
});

describe('corpJobs row detail', () => {
  it('names the product, activity, installer and when it ends', () => {
    const view = corpJobs(
      { corpJobs: jobsFeed([job({ end_date: new Date(NOW + 5 * HOUR).toISOString() })]) },
      ctx
    );
    const detail = view.table!.rows[0]!.detail!;
    const J = 'overview.widgets.corpJobs';
    expect(detail.title).toContain('Rifter');
    expect(detail.facts.map((f) => f.label)).toEqual([
      `${J}.col.activity`,
      `${J}.col.installer`,
      `${J}.col.ends`,
    ]);
    expect(detail.facts[1]!.value).toBe('Ada Pilot');
  });

  it('reads Ready for a finished job', () => {
    const view = corpJobs(
      {
        corpJobs: jobsFeed([
          job({ status: 'ready', end_date: new Date(NOW - HOUR).toISOString() }),
        ]),
      },
      ctx
    );
    const detail = view.table!.rows[0]!.detail!;
    expect(detail.status).toMatchObject({ badge: 'overview.board.ready', tone: 'warning' });
    expect(detail.facts[2]!.value).toBe('overview.board.ready');
  });
});
