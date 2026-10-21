import { describe, expect, it } from 'vitest';
import type { BoardExtractionSource, BoardStructureSource } from '@/engine/corp/board';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import type { MoonChunksBoardData, StructuresBoardData } from '../../data/boardData';
import type { CorpJobsFeed, CorpStarbasesFeed } from './corpFeeds';
import { corpDeadlines, corpJobs, corpServices } from './corpClockModels';
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
    // fuel in 5h, moon in 8h, finished job (overdue)
    expect(view.number.value).toBe('3');
    expect(view.number.unit).toBe('corp.standing.dueSoon');
    expect(view.number.tone).toBe('critical');
    expect(view.number.secondary?.text).toContain('Rifter');
    expect(view.number.notes).toEqual(['corp.standing.dueSoonOverdue{"count":1}']);
    expect(view.table?.rows).toHaveLength(4);
    expect(view.table?.rows[0]?.cells[0]).toBe('Rifter');
    expect(view.status.isEmpty).toBe(false);
    expect(view.to).toBeNull();
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

describe('corpServices', () => {
  const offline = (id: number, name: string, services: string[]) =>
    structure({
      structureId: id,
      name,
      services: services.map((service) => ({ name: service, state: 'offline' as const })),
    });

  it('counts offline services and names the structure with the most', () => {
    const view = corpServices(
      {
        structures: structuresFeed([
          offline(1, 'Efa - Helios', ['Reprocessing']),
          offline(2, 'Efa - Prime', ['Market', 'Cloning']),
          structure({ structureId: 3, services: [{ name: 'Moon', state: 'online' }] }),
        ]),
      },
      ctx
    );
    expect(view.number.value).toBe('3');
    expect(view.number.tone).toBe('warning');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpServices.most{"name":"Prime","count":2}'
    );
    expect(view.table?.rows.map((row) => row.cells)).toEqual([
      ['Helios', 'Reprocessing'],
      ['Prime', 'Cloning'],
      ['Prime', 'Market'],
    ]);
    expect(view.to).toBeNull();
  });

  it('is the empty state when read fine with none offline', () => {
    const view = corpServices({ structures: structuresFeed([structure()]) }, ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.number.value).toBe('0');
  });

  it('keeps unreadable and loading apart from none offline', () => {
    expect(corpServices({ structures: loading() }, ctx).status.loading).toBe(true);
    const lapsed = corpServices({ structures: structuresFeed(null, true) }, ctx);
    expect(lapsed.status.needsPermission).toBe(true);
    expect(lapsed.emptyMessage).toBe('overview.board.corpUnreadable');
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
