import { HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { resolveWidget } from '../state';
import { buildView, feedsFor } from './models';
import type { BuildContext, FeedState, Feeds } from './types';

const NOW = Date.parse('2026-10-11T12:00:00Z');

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 91,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const stateOf = (view: ReturnType<typeof buildView>) => resolveWidget(view.status).state;

describe('feedsFor', () => {
  it('lists each feed once, for only the kinds given', () => {
    expect(feedsFor(['training', 'sp', 'wallet']).sort()).toEqual(
      ['accelerator', 'journal', 'skills', 'spExtras', 'wallet'].sort()
    );
  });

  it('is empty for kinds with no data yet', () => {
    expect(feedsFor(['unknownKindFromANewerBuild'])).toEqual([]);
  });
});

describe('buildView status', () => {
  it('is loading before the feed exists', () => {
    const view = buildView('wallet', {}, ctx());
    expect(stateOf(view)).toBe('loading');
  });

  it('is loading while the first read is in flight', () => {
    const feeds: Feeds = { wallet: { data: null, error: false, loading: true } };
    expect(stateOf(buildView('wallet', feeds, ctx()))).toBe('loading');
  });

  it('is failed, with nothing to dim, when the read threw and nothing was cached', () => {
    const feeds: Feeds = { wallet: { data: null, error: true, loading: false } };
    const view = buildView('wallet', feeds, ctx());
    expect(resolveWidget(view.status)).toEqual({
      state: 'failed',
      showLastGood: false,
      reauthNote: false,
    });
  });

  it('keeps the last good value when a refresh failed', () => {
    const feeds: Feeds = {
      wallet: {
        data: {
          result: { data: 5_000_000, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
          needsReauth: false,
        },
        error: true,
        loading: false,
      },
    };
    const view = buildView('wallet', feeds, ctx());
    expect(resolveWidget(view.status)).toEqual({
      state: 'failed',
      showLastGood: true,
      reauthNote: false,
    });
    expect(view.number.iskAmount).toBe(5_000_000);
  });

  it('needs permission when the read says the grant lapsed', () => {
    const feeds: Feeds = { wallet: ok({ result: null, needsReauth: true }) };
    expect(stateOf(buildView('wallet', feeds, ctx()))).toBe('needsPermission');
  });

  it('keeps a saved balance, with a sign-in note, when the grant lapsed over it', () => {
    const feeds: Feeds = {
      wallet: ok({
        result: { data: 5_000_000, fetchedAt: new Date(NOW), fromCache: true, truncated: false },
        needsReauth: true,
      }),
    };
    const view = buildView('wallet', feeds, ctx());
    expect(resolveWidget(view.status)).toMatchObject({ state: 'ok', reauthNote: true });
    expect(view.number.iskAmount).toBe(5_000_000);
  });
});

describe('placeholder kinds', () => {
  it('render empty for a kind this build does not know', () => {
    expect(stateOf(buildView('fromTheFuture', {}, ctx()))).toBe('empty');
  });
});

describe('wallet', () => {
  it('shows the balance as an ISK figure and no table without a journal', () => {
    const feeds: Feeds = {
      wallet: ok({
        result: {
          data: 3_820_000_000,
          fetchedAt: new Date(NOW - HOUR_MS),
          fromCache: true,
          truncated: false,
        },
        needsReauth: false,
      }),
    };
    const view = buildView('wallet', feeds, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.iskAmount).toBe(3_820_000_000);
    expect(view.number.unit).toBe('overview.isk');
    expect(view.rows).toEqual([]);
    expect(view.table).toBeUndefined();
    expect(view.number.secondary).toBeUndefined();
    expect(view.chart).toBeUndefined();
    expect(view.fetchedAt?.getTime()).toBe(NOW - HOUR_MS);
    expect(view.fromCache).toBe(true);
    expect(view.to).toBe('/wallet');
  });

  it('says how far the balance moved over the journal, and tables its newest entries', () => {
    const day = (n: number, balance: number, amount: number) => ({
      id: n,
      date: new Date(NOW - (30 - n) * 86_400_000).toISOString(),
      ref_type: 'bounty_prizes',
      description: '',
      amount,
      balance,
    });
    const feeds: Feeds = {
      wallet: ok({
        result: { data: 400, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
        needsReauth: false,
      }),
      journal: ok({
        result: {
          data: [day(1, 100, 10), day(15, 250, 150), day(29, 400, 150)],
          fetchedAt: new Date(NOW),
          fromCache: false,
          truncated: false,
        },
        needsReauth: false,
      }),
    };
    const view = buildView('wallet', feeds, ctx());
    expect(view.number.secondary).toMatchObject({ direction: 'up', tone: 'good' });
    expect(view.table!.rows.map((r) => r.key)).toEqual(['29', '15', '1']);
    expect(view.chart?.kind).toBe('area');
  });
});

describe('mail', () => {
  const mail = (unread: number) =>
    ok({
      unread,
      recent: [{ mailId: 1, subject: 'Hello', from: 'Aria', atMs: NOW - 2 * HOUR_MS }],
      needsReauth: false,
      fetchedAt: new Date(NOW),
    });

  it('counts unread with one row per recent unread mail', () => {
    const view = buildView('mail', { mail: mail(7) }, ctx());
    expect(view.number.value).toBe('7');
    expect(view.number.tone).toBe('watch');
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].title).toBe('Hello');
    expect(view.rows[0].detail).toBe('Aria');
  });

  it('is a quiet zero, not an empty widget, with nothing unread', () => {
    const feeds: Feeds = {
      mail: ok({ unread: 0, recent: [], needsReauth: false, fetchedAt: new Date(NOW) }),
    };
    const view = buildView('mail', feeds, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('0');
    expect(view.number.tone).toBe('clear');
  });
});

describe('structures and moon extractions', () => {
  it('say the roles do not cover it, rather than asking for a grant', () => {
    const feeds: Feeds = {
      structures: ok({ structures: null, structureCount: 0, needsReauth: false, fetchedAt: null }),
    };
    const view = buildView('structures', feeds, ctx());
    expect(stateOf(view)).toBe('empty');
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('ask for a grant when the read says it lapsed', () => {
    const feeds: Feeds = {
      moonChunks: ok({ chunks: null, needsReauth: true, fetchedAt: null, loadedAt: NOW }),
    };
    expect(stateOf(buildView('moonChunks', feeds, ctx()))).toBe('needsPermission');
  });
});

describe('moon extractions widget with a Feeder from a Corp Tax Book (#6116)', () => {
  it("names the Feeder's corporation on its row, after the short refinery name", () => {
    const feeds: Feeds = {
      moonChunks: ok({
        chunks: [
          {
            id: '7001',
            subject: 'Efa - Tatara [ABCD]',
            detail: 'arrival',
            deadlineMs: NOW + HOUR_MS,
          },
        ],
        needsReauth: false,
        fetchedAt: new Date(NOW - HOUR_MS),
        loadedAt: NOW,
        fromBook: true,
      }),
    };
    const view = buildView('moonChunks', feeds, ctx());
    expect(view.table?.rows[0]?.cells[0]).toBe('Tatara [ABCD]');
    expect(view.rows?.[0]?.title).toBe('Tatara [ABCD]');
  });
});

describe('structures row link', () => {
  const feeds = (): Feeds => ({
    structures: ok({
      structures: [
        {
          structureId: 1,
          name: 'Efa - Helios Prime',
          fuelExpiresMs: NOW + 20 * 24 * HOUR_MS,
          state: 'shield_vulnerable',
          stateTimerEndMs: null,
          unanchorsAtMs: null,
          services: [
            { name: 'Market', state: 'online' },
            { name: 'Reprocessing', state: 'offline' },
          ],
        },
      ],
      structureCount: 1,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    }),
  });

  it('links each row to its structure on the Structures page, on both boards', () => {
    for (const show of ['all', 'problems'] as const) {
      const row = buildView('structures', feeds(), ctx({ show })).table!.rows[0]!;
      expect(row.to).toBe('/corp/structures?structure=1');
      expect(row.detail).toBeUndefined();
    }
  });
});

describe('structures with a control tower', () => {
  const feeds = (): Feeds => ({
    structures: ok({
      structures: [],
      structureCount: 0,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    }),
    corpStarbases: ok({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      fromCache: false,
      starbases: [
        {
          starbaseId: 5,
          systemId: 100,
          typeId: 12235,
          state: 'online',
          reinforcedUntilMs: null,
          unanchorsAtMs: null,
          bay: { fuelBlocks: 960, strontium: 0 },
          bayReadAtMs: NOW,
        },
      ],
      typeNames: new Map([[12235, 'Caldari Control Tower']]),
      systemNames: new Map([[100, 'Efa']]),
    }),
  });

  it('lists the tower with its fuel clock, and flags it as low fuel', () => {
    const view = buildView('structures', feeds(), ctx({ show: 'all' }));
    const row = view.table!.rows[0]!;
    expect(row.cells[0]).toBe('Caldari Control Tower (Efa)');
    expect(row.tone).not.toBe('clear');
    expect(stateOf(view)).not.toBe('empty');
    expect(buildView('structures', feeds(), ctx({ show: 'problems' })).table!.rows).toHaveLength(1);
  });
});

describe('stock', () => {
  it('is empty with no Stock List', () => {
    const feeds: Feeds = { stock: ok({ board: null }) };
    expect(stateOf(buildView('stock', feeds, ctx()))).toBe('empty');
  });

  it('says the counts are unknown, as a settled answer and never a spinner, without cached orders', () => {
    const feeds: Feeds = {
      stock: ok({ board: { markets: [], totals: { out: 0, low: 0 }, counted: false } }),
    };
    const view = buildView('stock', feeds, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.status.loading).toBe(false);
    expect(view.number.value).toBe('—');
    expect(view.number.secondary?.text).toBe('overview.board.stockNotCounted');
    expect(view.rows).toEqual([]);
  });

  it('gives a kind with no page of its own no title link target', () => {
    expect(buildView('fromTheFuture', {}, ctx()).to).toBeNull();
  });

  it('counts out and low, tabling every market with its own state', () => {
    const summary = { out: 2, low: 1, ok: 4, over: 0, readyToList: 0, costToFill: 0 };
    const feeds: Feeds = {
      stock: ok({
        board: {
          markets: [{ listId: 'a', name: 'Jita IV - Moon 4', summary: summary as never }],
          totals: { out: 2, low: 1 },
          counted: true,
        },
      }),
    };
    const view = buildView('stock', feeds, ctx());
    expect(view.number.value).toBe('3');
    expect(view.number.tone).toBe('warning');
    expect(view.table?.rows).toHaveLength(1);
    expect(view.table?.rows[0]!.cells[0]).toBe('Jita IV');
    expect(view.table?.rows[0]!.to).toBe('/market/stock/a');
    expect(view.chart?.kind).toBe('stackRows');
  });
});

describe('training', () => {
  const skills = (queue: unknown[]) =>
    ok({
      skillsResult: null,
      queueResult: { data: queue, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
      queueNeedsReauth: false,
      totalSp: 5_000_000,
      catalog: { bySkillTypeID: new Map([[3300, { name: 'Gunnery' }]]) },
      maxOrders: 5,
    });

  it('counts down the skill training now and offers its finish as a deadline', () => {
    const finish = NOW + 4 * HOUR_MS;
    const queue = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 5,
        start_date: new Date(NOW - HOUR_MS).toISOString(),
        finish_date: new Date(finish).toISOString(),
      },
    ];
    const view = buildView('training', { skills: skills(queue) as never }, ctx());
    expect(view.number.value).toBe('4h 0m');
    expect(view.number.secondary?.text).toContain('Gunnery');
    expect(view.deadlines).toEqual([
      { at: finish, note: 'overview.board.nextSkill', severity: 'clear', to: '/skills/plans' },
    ]);
    expect(view.rows[0].title).toContain('Gunnery');
    expect(view.table?.rows[0]?.info).toEqual({ typeId: 3300 });
  });

  describe('accelerator', () => {
    const finish = NOW + 4 * HOUR_MS;
    const queue = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 5,
        start_date: new Date(NOW - HOUR_MS).toISOString(),
        finish_date: new Date(finish).toISOString(),
      },
    ];
    const accelerators = (expiresAt: number) => ({
      accelerator: ok(new Map([[91, { bonus: 12, expiresAt }]])),
    });
    const expiresAt = NOW + 20 * HOUR_MS;

    it('places the accelerator among the skills by time left and offers its expiry as a deadline by default', () => {
      const view = buildView(
        'training',
        { skills: skills(queue) as never, ...accelerators(expiresAt) },
        ctx()
      );
      expect(view.table?.rows.map((row) => row.key)).toEqual(['3300:0', 'accelerator']);
      expect(view.table?.rows[1]?.cells[1]).toBe('20h 0m');
      expect(view.rows.map((row) => row.key)).toEqual(['3300:0', 'accelerator']);
      expect(view.deadlines).toContainEqual({
        at: expiresAt,
        note: 'overview.board.acceleratorEnds',
        severity: 'clear',
        to: '/skills/plans',
      });
      expect(view.deadlines).toHaveLength(2);
    });

    it('leads with an accelerator that runs out before the skill finishes', () => {
      const view = buildView(
        'training',
        { skills: skills(queue) as never, ...accelerators(NOW + HOUR_MS) },
        ctx()
      );
      expect(view.table?.rows[0]?.key).toBe('accelerator');
      expect(view.rows[0]?.key).toBe('accelerator');
    });

    it('draws the skills alone when the widget is set to skills only', () => {
      const view = buildView(
        'training',
        { skills: skills(queue) as never, ...accelerators(expiresAt) },
        ctx({ show: 'skillsOnly' })
      );
      expect(view.table?.rows.some((row) => row.key === 'accelerator')).toBe(false);
      expect(view.deadlines).toHaveLength(1);
    });

    it("ignores an accelerator that has run out, and another Character's", () => {
      const feeds = { skills: skills(queue) as never };
      expect(
        buildView('training', { ...feeds, ...accelerators(NOW - HOUR_MS) }, ctx()).deadlines
      ).toHaveLength(1);
      expect(
        buildView(
          'training',
          { ...feeds, ...accelerators(expiresAt) },
          ctx({ activeCharacterId: 92 })
        ).deadlines
      ).toHaveLength(1);
    });

    it('still warns about the accelerator while nothing is training', () => {
      const view = buildView(
        'training',
        { skills: skills([]) as never, ...accelerators(expiresAt) },
        ctx()
      );
      expect(view.deadlines).toHaveLength(1);
      expect(view.deadlines[0]?.at).toBe(expiresAt);
    });
  });

  it('warns about an idle queue only where the not-training alert is on', () => {
    const quiet = buildView('training', { skills: skills([]) as never }, ctx());
    expect(quiet.number.tone).toBe('clear');
    const loud = buildView(
      'training',
      { skills: skills([]) as never },
      ctx({ notTrainingAlert: true })
    );
    expect(loud.number.tone).toBe('warning');
    expect(stateOf(loud)).toBe('ok');
  });
});

describe('comingUp (the Calendar widget)', () => {
  const board = (over: Record<string, unknown> = {}) =>
    ok({
      calendarEvents: [],
      industryJobs: [],
      corporations: [],
      sharedPops: [],
      readableRefineries: [],
      sharingCorporations: [],
      skyhookRaidDetails: [],
      readableKinds: ['calendarEvent', 'industryJob'],
      reauthKinds: [],
      oldestFetchedAt: new Date(NOW),
      fromCache: false,
      events: [],
      loadedAtMs: NOW,
      ...over,
    }) as never;
  const ev = (id: number, hours: number, response = 'accepted') => ({
    id: String(id),
    subject: `Event ${id}`,
    detail: '',
    deadlineMs: NOW + hours * HOUR_MS,
    response,
    important: false,
  });
  const job = (id: number, hours: number) => ({
    id: String(id),
    subject: `Job ${id}`,
    detail: 'active',
    deadlineMs: NOW + hours * HOUR_MS,
  });
  const subjects = (view: ReturnType<typeof buildView>) =>
    (view.table?.rows ?? []).map((row) => row.cells[0]);

  it('is empty with nothing ahead', () => {
    expect(stateOf(buildView('comingUp', { calendar: board() }, ctx()))).toBe('empty');
  });

  it('lists every kind of clock in deadline order, headed by the next one', () => {
    const feeds: Feeds = {
      calendar: board({ calendarEvents: [ev(1, 2)], industryJobs: [job(7, 1)] }),
    };
    const view = buildView('comingUp', feeds, ctx());
    expect(subjects(view)).toEqual(['Job 7', 'Event 1']);
    expect(view.number.value).toBe('1h 0m');
    expect(view.number.secondary?.text).toBe('Job 7');
    expect(view.number.unit).toContain('"count":1');
    expect(view.table?.columns.map((c) => c.key)).toEqual(['item', 'in', 'kind']);
    expect(view.table?.rows.map((row) => row.cells[2])).toEqual([
      'calendar.kind.industryJob',
      'calendar.kind.calendarEvent · overview.board.response.accepted',
    ]);
    expect(view.table?.rows.map((row) => row.to)).toEqual(['/calendar', '/calendar?open=1']);
  });

  it('applies the Events choice to calendar events only', () => {
    const feeds: Feeds = {
      calendar: board({ calendarEvents: [ev(1, 2, 'not_responded')], industryJobs: [job(7, 3)] }),
    };
    expect(subjects(buildView('comingUp', feeds, ctx()))).toEqual(['Job 7']);
    expect(subjects(buildView('comingUp', feeds, ctx({ calendarEvents: 'all' })))).toEqual([
      'Event 1',
      'Job 7',
    ]);
  });

  it('leaves out the kinds the widget hides', () => {
    const feeds: Feeds = {
      calendar: board({ calendarEvents: [ev(1, 2)], industryJobs: [job(7, 1)] }),
    };
    const view = buildView('comingUp', feeds, ctx({ hiddenKinds: ['industryJob'] }));
    expect(subjects(view)).toEqual(['Event 1']);
  });

  it('keeps a recently overdue clock with its past label, and drops one overdue from before today', () => {
    const feeds: Feeds = {
      calendar: board({ industryJobs: [job(7, -1), job(8, -72), job(9, 4)] }),
    };
    const view = buildView('comingUp', feeds, ctx({ zone: 'UTC' }));
    expect(subjects(view)).toEqual(['Job 7', 'Job 9']);
    expect(view.table?.rows[0]?.cells[1]).toBe('calendar.detail.industryJob.ready');
    expect(view.number.secondary?.text).toBe('Job 9');
  });

  it('gives Next deadline the next committed event only: the other clocks have their own widgets', () => {
    const feeds: Feeds = {
      calendar: board({
        calendarEvents: [ev(1, 2, 'not_responded'), ev(2, 5)],
        industryJobs: [job(7, 1)],
      }),
    };
    const view = buildView('comingUp', feeds, ctx({ calendarEvents: 'all' }));
    expect(view.deadlines.map((d) => d.at)).toEqual([NOW + 5 * HOUR_MS]);
  });

  it('keeps the readable clocks with a sign-in note, and asks for the grant when none read', () => {
    const lapsed = board({ readableKinds: ['industryJob'], reauthKinds: ['calendarEvent'] });
    expect(resolveWidget(buildView('comingUp', { calendar: lapsed }, ctx()).status)).toMatchObject({
      reauthNote: true,
    });
    const none = board({
      calendarEvents: undefined,
      industryJobs: undefined,
      readableKinds: [],
      reauthKinds: ['calendarEvent'],
    });
    expect(resolveWidget(buildView('comingUp', { calendar: none }, ctx()).status)).toMatchObject({
      state: 'needsPermission',
    });
  });

  it('asks no sign-in for a kind the widget hides, and names the corporation behind a clock', () => {
    const lapsed = board({
      readableKinds: ['industryJob'],
      reauthKinds: ['calendarEvent'],
      industryJobs: [{ ...job(7, 1), corporation: { id: 1, name: 'Tax Corp', ticker: 'TAX' } }],
    });
    const view = buildView(
      'comingUp',
      { calendar: lapsed },
      ctx({ hiddenKinds: ['calendarEvent'] })
    );
    expect(resolveWidget(view.status)).toMatchObject({ state: 'ok', reauthNote: false });
    expect(view.table?.rows[0]?.cells[2]).toBe('calendar.kind.industryJob · Tax Corp');
  });
});

describe('priceWatch', () => {
  it('is empty with no targets set', () => {
    const feeds: Feeds = { priceAlerts: ok({ alerts: [], checkedAt: null }) };
    expect(stateOf(buildView('priceWatch', feeds, ctx()))).toBe('empty');
  });

  it('counts the targets that were hit', () => {
    const alerts = [
      {
        typeId: 1,
        name: 'Tritanium',
        targetPrice: 4.2,
        direction: 'below',
        price: 4.1,
        crossed: true,
      },
      {
        typeId: 2,
        name: 'PLEX',
        targetPrice: 5_100_000,
        direction: 'above',
        price: null,
        crossed: false,
      },
    ];
    const feeds: Feeds = { priceAlerts: ok({ alerts, checkedAt: NOW }) as never };
    const view = buildView('priceWatch', feeds, ctx());
    expect(view.number.value).toBe('1');
    expect(view.number.tone).toBe('warning');
    expect(view.rows).toEqual([]);
    expect(view.table?.rows.map((r) => r.cells[0])).toEqual(['Tritanium', 'PLEX']);
  });
});

describe('industry', () => {
  it('is empty with no jobs and says ready first when some are done', () => {
    const empty: Feeds = {
      industry: ok({
        jobs: [],
        productNames: new Map(),
        needsReauth: false,
        fetchedAt: new Date(NOW),
      }),
    };
    expect(stateOf(buildView('industry', empty, ctx()))).toBe('empty');

    const jobs = [
      {
        job_id: 1,
        activity_id: 1,
        runs: 2,
        blueprint_type_id: 5,
        product_type_id: 6,
        end_date: new Date(NOW - HOUR_MS).toISOString(),
        status: 'active',
      },
      {
        job_id: 2,
        activity_id: 1,
        runs: 1,
        blueprint_type_id: 5,
        product_type_id: 6,
        end_date: new Date(NOW + 5 * HOUR_MS).toISOString(),
        status: 'active',
      },
    ];
    const feeds: Feeds = {
      industry: ok({
        jobs,
        productNames: new Map(),
        needsReauth: false,
        fetchedAt: new Date(NOW),
      }) as never,
    };
    const view = buildView('industry', feeds, ctx());
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toBe('overview.widgets.industry.ready');
    expect(view.rows[0].tone).toBe('warning');
    expect(view.table?.rows.map((r) => r.to)).toEqual([
      '/industry?highlight=1',
      '/industry?highlight=2',
    ]);
    expect(view.deadlines.map((d) => d.at)).toEqual([NOW + 5 * HOUR_MS]);
  });
});

describe('sp', () => {
  it('lists Unallocated SP among its rows now the header chip is gone', () => {
    const feeds = {
      skills: ok({
        totalSp: 80_000_000,
        skillsResult: {
          data: { total_sp: 80_000_000, unallocated_sp: 1_450_000, skills: [] },
          fetchedAt: new Date(NOW),
          fromCache: false,
        },
      }),
      spExtras: ok({ monitoring: false, thresholdSp: 500_000, price: null }),
    } as unknown as Feeds;
    const view = buildView('sp', feeds, ctx());
    const row = view.rows.find((r) => r.key === 'unallocated');
    expect(row).toMatchObject({
      title: 'skills.unallocatedSp',
      value: (1_450_000).toLocaleString(),
    });
  });
});

describe('the Number view says one new thing', () => {
  const summary = (over: Record<string, number>) => ({
    out: 0,
    low: 0,
    ok: 0,
    over: 0,
    readyToList: 0,
    costToFill: 0,
    ...over,
  });
  const stockFeeds = (totals: { out: number; low: number }, costToFill = 0): Feeds => ({
    stock: ok({
      board: {
        markets: [
          { listId: 'a', name: 'Jita IV - Moon 4', summary: summary({ ...totals, costToFill }) },
        ],
        totals,
        counted: true,
      } as never,
    }),
  });

  it('mail names the newest sender instead of repeating the unread count', () => {
    const feeds: Feeds = {
      mail: ok({
        unread: 3,
        recent: [{ mailId: 1, subject: 'Hi', from: 'Aria', atMs: NOW - 2 * HOUR_MS }],
        needsReauth: false,
        fetchedAt: new Date(NOW),
      }),
    };
    const view = buildView('mail', feeds, ctx());
    expect(view.number.secondary?.text).toContain('overview.widgets.mail.latest');
    expect(view.number.secondary?.text).toContain('Aria');
    expect(view.summary).toContain('mailUnread');
  });

  it('mail has no secondary with nothing to name', () => {
    const feeds: Feeds = {
      mail: ok({ unread: 0, recent: [], needsReauth: false, fetchedAt: new Date(NOW) }),
    };
    expect(buildView('mail', feeds, ctx()).number.secondary).toBeUndefined();
  });

  it('mining tax gives the age of the debt, not the amount again', () => {
    const data = {
      unpaidIsk: 10_900_000,
      oldestUnpaidDays: 13,
      payeeCount: 2,
      unassignedCount: 0,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    };
    const view = buildView('miningTax', { mining: ok(data) as never }, ctx());
    expect(view.number.secondary?.text).toContain('"days":13');
    expect(view.number.secondary?.text).not.toContain('miningUnpaid');
  });

  it('mining tax tables who is owed what, and has no table from a cache older than the payee list', () => {
    const data = {
      unpaidIsk: 10_900_000,
      oldestUnpaidDays: 13,
      payeeCount: 1,
      unassignedCount: 2,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    };
    const payees = [
      { payeeId: 'p1', name: 'Corp Tax', unpaidIsk: 10_900_000, oldestDays: 13, entries: 4 },
    ];
    const withPayees = buildView('miningTax', { mining: ok({ ...data, payees }) as never }, ctx());
    expect(withPayees.rows).toEqual([]);
    expect(withPayees.table?.rows[0]!.cells[0]).toBe('Corp Tax');
    expect(withPayees.table?.footer).toContain('"count":2');
    expect(buildView('miningTax', { mining: ok(data) as never }, ctx()).table).toBeUndefined();
  });

  describe('mining tax with a Character whose ledger cannot be read', () => {
    const base = {
      unpaidIsk: 10_900_000,
      oldestUnpaidDays: 13,
      payeeCount: 1,
      unassignedCount: 0,
      fetchedAt: new Date(NOW),
      characterCount: 2,
    };
    const build = (data: object, patch = {}) =>
      buildView('miningTax', { mining: ok({ ...base, ...data }) as never }, ctx(patch));

    it('shows the Characters that could be read, in a calm tone, and asks about none', () => {
      const view = build({
        needsReauth: false,
        missingCharacterNames: ['Shadow Ruler'],
        missingCharacterIds: [2],
      });
      expect(view.status.needsPermission).toBe(false);
      expect(view.number.iskAmount).toBe(10_900_000);
      expect(view.number.tone).not.toBe('warning');
      expect(view.summary).not.toContain('reauth');
      expect(view.grantEndpoints).toBeUndefined();
      expect(view.grantCharacterId).toBeUndefined();
    });

    it('when none can be read, asks a Character that failed, by name', () => {
      const view = build({
        needsReauth: true,
        missingCharacterNames: ['Shadow Ruler', 'Krish Mero'],
        missingCharacterIds: [2, 3],
      });
      expect(view.status.needsPermission).toBe(true);
      expect(view.grantCharacterId).toBe(2);
      expect(view.grantCharacterName).toBe('Shadow Ruler');
    });

    it('prefers the active Character when it is among those that failed', () => {
      const view = build(
        {
          needsReauth: true,
          missingCharacterNames: ['Shadow Ruler', 'Krish Mero'],
          missingCharacterIds: [2, 3],
        },
        { activeCharacterId: 3 }
      );
      expect(view.grantCharacterId).toBe(3);
      expect(view.grantCharacterName).toBe('Krish Mero');
    });

    it('a snapshot cached before the ids were kept asks as before', () => {
      const view = build({ needsReauth: true, missingCharacterNames: [] });
      expect(view.status.needsPermission).toBe(true);
      expect(view.grantCharacterId).toBeUndefined();
    });
  });

  it('price watch names the nearest target that has not been hit', () => {
    const alerts = [
      { typeId: 1, name: 'Tritanium', targetPrice: 4, direction: 'below', price: 3, crossed: true },
      {
        typeId: 2,
        name: 'Nocxium',
        targetPrice: 100,
        direction: 'above',
        price: 87,
        crossed: false,
      },
      { typeId: 3, name: 'PLEX', targetPrice: 100, direction: 'above', price: 40, crossed: false },
    ];
    const view = buildView(
      'priceWatch',
      { priceAlerts: ok({ alerts, checkedAt: NOW }) as never },
      ctx()
    );
    expect(view.number.secondary?.text).toContain('Nocxium');
    expect(view.number.secondary?.text).toContain('"pct":13');
  });

  it('price watch has no secondary when every price is unknown or crossed', () => {
    const alerts = [
      { typeId: 1, name: 'Tritanium', targetPrice: 4, direction: 'below', price: 3, crossed: true },
    ];
    const view = buildView(
      'priceWatch',
      { priceAlerts: ok({ alerts, checkedAt: NOW }) as never },
      ctx()
    );
    expect(view.number.secondary).toBeUndefined();
  });

  it('industry gives the next job to finish, not the ready count again', () => {
    const jobs = [
      { job_id: 1, activity_id: 1, runs: 2, end_date: new Date(NOW - HOUR_MS).toISOString() },
      { job_id: 2, activity_id: 1, runs: 6, end_date: new Date(NOW + 5 * HOUR_MS).toISOString() },
    ];
    const feeds: Feeds = {
      industry: ok({
        jobs,
        productNames: new Map([[2, 'Vexor']]),
        needsReauth: false,
        fetchedAt: new Date(NOW),
      }) as never,
    };
    const view = buildView('industry', feeds, ctx());
    expect(view.number.secondary?.text).toContain('overview.widgets.industry.next');
    expect(view.number.secondary?.text).toContain('5h');
  });

  it('stock leads with the shortfall and prices it', () => {
    const view = buildView('stock', stockFeeds({ out: 0, low: 2 }, 35_000_000), ctx());
    expect(view.number.value).toBe('2');
    expect(view.number.tone).toBe('warning');
    expect(view.number.secondary?.text).toContain('stockToSource');
  });

  it('stock with nothing short is a plain zero, not a warning', () => {
    const view = buildView('stock', stockFeeds({ out: 0, low: 0 }), ctx());
    expect(view.number.value).toBe('0');
    expect(view.number.tone).toBe('clear');
    expect(view.number.secondary).toBeUndefined();
  });

  it('never tones a zero headline, whatever the domain severity says', () => {
    const feeds: Feeds = {
      mail: ok({ unread: 0, recent: [], needsReauth: false, fetchedAt: new Date(NOW) }),
    };
    const view = buildView('mail', feeds, ctx());
    expect(view.number.tone).toBe('clear');
  });
});

describe('mail table', () => {
  it('tables the newest mail, read or not, with the unread ones marked', () => {
    const data = {
      unread: 1,
      recent: [{ mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR_MS, unread: true }],
      inbox: [
        { mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR_MS, unread: true },
        { mailId: 2, subject: 'Old', from: null, atMs: NOW - 5 * HOUR_MS, unread: false },
      ],
      needsReauth: false,
      fetchedAt: new Date(NOW),
    };
    const view = buildView('mail', { mail: ok(data) }, ctx());
    expect(view.table?.columns.map((c) => c.key)).toEqual(['from', 'age', 'subject']);
    expect(view.table?.rows.map((r) => [r.cells[0], r.cells[2], r.tone])).toEqual([
      ['Aria', 'New', 'watch'],
      ['overview.widgets.mail.unknownSender', 'Old', 'clear'],
    ]);
  });

  it('each row opens its mail in the reader, for the mailbox owner', () => {
    const data = {
      unread: 1,
      recent: [],
      inbox: [{ mailId: 7, subject: 'New', from: 'Aria', atMs: NOW - HOUR_MS, unread: true }],
      needsReauth: false,
      fetchedAt: new Date(NOW),
    };
    const rows = buildView('mail', { mail: ok(data) }, ctx()).table?.rows ?? [];
    expect(rows.map((r) => r.to)).toEqual(['/mail?open=7&owner=91']);
    expect(rows.every((r) => r.detail === undefined)).toBe(true);
  });

  it('falls back to the unread mail when the read has no inbox', () => {
    const data = {
      unread: 1,
      recent: [{ mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR_MS }],
      needsReauth: false,
      fetchedAt: new Date(NOW),
    };
    const view = buildView('mail', { mail: ok(data) }, ctx());
    expect(view.table?.rows).toHaveLength(1);
    expect(view.table?.rows[0]?.tone).toBe('watch');
  });
});

describe('contracts table', () => {
  const noItems = {
    inProgress: 2,
    exchanges: 0,
    outstanding: 0,
    dueSoon: 0,
    overdue: 0,
    soonest: null,
    items: [],
    rows: [],
  };
  const data = (over: Record<string, unknown> = {}) => ({
    summary: { ...noItems, ...over },
    route: null,
    needsReauth: false,
    fetchedAt: new Date(NOW),
  });
  const courier = (over: Record<string, unknown> = {}) => ({
    contractId: 1,
    kind: 'courier' as const,
    state: 'in_progress' as const,
    atMs: NOW + 3 * HOUR_MS,
    overdue: false,
    title: null,
    reward: 2_000_000,
    collateral: 90_000_000,
    price: null,
    ...over,
  });

  it('lists the outstanding contracts as their own tile', () => {
    const view = buildView(
      'contracts',
      { contracts: ok(data({ outstanding: 3 })) as never },
      ctx()
    );
    const tile = view.rows.find((row) => row.key === 'outstanding');
    expect(tile?.value).toBe('3');
    expect(tile?.tone).toBe('watch');
  });

  it('with nothing on a clock, counts the hauls in progress', () => {
    const view = buildView('contracts', { contracts: ok(data()) as never }, ctx());
    expect(view.number.value).toBe('2');
    expect(view.number.unit).toBe('overview.widgets.contracts.unit');
    expect(view.table?.rows).toEqual([]);
  });

  it('with no hauls but outstanding contracts, headlines them rather than 0', () => {
    const view = buildView(
      'contracts',
      { contracts: ok(data({ inProgress: 0, outstanding: 1 })) as never },
      ctx()
    );
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toBe('overview.widgets.contracts.outstandingUnit');
    expect(view.number.secondary?.text).toBe('overview.board.contractsNothingDue');
    const withOffer = buildView(
      'contracts',
      {
        contracts: ok(
          data({
            inProgress: 0,
            outstanding: 1,
            rows: [courier({ state: 'outstanding', atMs: NOW + 3 * HOUR_MS })],
          })
        ) as never,
      },
      ctx()
    );
    expect(withOffer.number.secondary?.text).toContain('outstandingExpires');
  });

  it('leads with the soonest deadline and counts the hauls as the secondary', () => {
    const soonest = courier();
    const feeds = { contracts: ok(data({ soonest, items: [soonest] })) };
    const view = buildView('contracts', feeds as never, ctx());
    expect(view.number.value).toBe('3h 0m');
    expect(view.number.secondary?.text).toContain('overview.widgets.contracts.inProgress');
    expect(view.number.secondary?.text).toContain('"count":2');
  });

  it('says overdue when the soonest courier is past its deliver-by', () => {
    const soonest = courier({ atMs: NOW - HOUR_MS, overdue: true });
    const feeds = { contracts: ok(data({ overdue: 1, soonest, items: [soonest] })) };
    const view = buildView('contracts', feeds as never, ctx());
    expect(view.number.tone).toBe('critical');
    expect(view.number.value).toBe('overview.widgets.contracts.overdue');
  });

  it('tables each contract: route, expiry, status, reward and collateral', () => {
    const hauls = courier({ contractId: 1 });
    const late = courier({ contractId: 2, atMs: NOW - HOUR_MS, overdue: true, reward: null });
    const listing = courier({
      contractId: 3,
      kind: 'listing',
      state: 'outstanding',
      atMs: NOW + 20 * HOUR_MS,
      title: 'Spare hulls',
      reward: null,
      collateral: null,
      price: 5_000_000,
    });
    const feeds = {
      contracts: ok({
        ...data({ soonest: late, items: [late, hauls, listing], rows: [late, hauls, listing] }),
        routes: {
          1: ['Jita IV - Moon 4 - Caldari Navy Assembly Plant', 'Amarr VIII (Oris) - Emperor'],
        },
      }),
    };
    const table = buildView('contracts', feeds as never, ctx()).table;
    expect(table?.columns.map((c) => c.key)).toEqual([
      'contract',
      'expires',
      'status',
      'reward',
      'collateral',
    ]);
    expect(table?.rows.map((r) => r.cells[0])).toEqual([
      'overview.widgets.contracts.courier',
      'Jita → Amarr',
      'Spare hulls',
    ]);
    expect(table?.rows[0]?.cells[1]).toBe('overview.widgets.contracts.overdue');
    expect(table?.rows[0]?.tone).toBe('critical');
    expect(table?.rows.map((r) => r.to)).toEqual([
      '/contracts/history?open=2',
      '/contracts/history?open=1',
      '/contracts/history?open=3',
    ]);
    expect(table?.rows[1]?.cells[3]).toMatchObject({ iskAmount: 2_000_000 });
    expect(table?.rows[2]?.cells[2]).toBe('overview.widgets.contracts.statusOutstanding');
    expect(table?.rows[2]?.cells[3]).toMatchObject({ iskAmount: 5_000_000 });
  });
});

describe('training table', () => {
  const skills = (queue: unknown[]) =>
    ok({
      skillsResult: null,
      queueResult: { data: queue, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
      queueNeedsReauth: false,
      totalSp: 5_000_000,
      catalog: { bySkillTypeID: new Map([[3300, { name: 'Gunnery' }]]) },
      maxOrders: 5,
    });

  it('tables the queue: skill, when it ends, how long it trains, level and SP per hour', () => {
    const queue = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 5,
        start_date: new Date(NOW - HOUR_MS).toISOString(),
        finish_date: new Date(NOW + 3 * HOUR_MS).toISOString(),
        training_start_sp: 100_000,
        level_end_sp: 260_000,
      },
      {
        skill_id: 3300,
        queue_position: 1,
        finished_level: 5,
        finish_date: new Date(NOW + 5 * HOUR_MS).toISOString(),
      },
    ];
    const view = buildView('training', { skills: skills(queue) as never }, ctx());
    expect(view.table?.columns.map((c) => c.key)).toEqual([
      'skill',
      'endsIn',
      'takes',
      'level',
      'spPerHour',
    ]);
    expect(view.table?.rows[0]?.cells).toEqual(['Gunnery', '3h 0m', '4h 0m', '5', '40K']);
    expect(view.table?.rows[1]?.cells[4]).toBe('—');
  });
});

describe('sp table', () => {
  const spFeeds = (
    over: { unallocated?: number; monitoring?: boolean; net?: number | null } = {}
  ) =>
    ({
      skills: ok({
        totalSp: 80_000_000,
        skillsResult: {
          data: { total_sp: 80_000_000, unallocated_sp: over.unallocated ?? 1_450_000, skills: [] },
          fetchedAt: new Date(NOW),
          fromCache: false,
        },
      }),
      spExtras: ok({
        monitoring: over.monitoring ?? true,
        thresholdSp: 100_000_000,
        price: { hubName: 'Jita', loaded: true, net: over.net ?? null },
      }),
    }) as unknown as Feeds;

  it('puts the unallocated SP under the total in the Number view', () => {
    const view = buildView('sp', spFeeds(), ctx());
    expect(view.number.secondary?.text).toContain('overview.widgets.sp.unallocated');
    expect(view.number.secondary?.text).toContain('1.5M');
  });

  it('keeps the extraction summary when nothing is unallocated', () => {
    const view = buildView('sp', spFeeds({ unallocated: 0 }), ctx());
    expect(view.number.secondary?.text).not.toContain('overview.widgets.sp.unallocated');
  });

  it('tables total, unallocated and extractable SP, with a bar toward the extraction threshold', () => {
    const view = buildView('sp', spFeeds({ net: 200_000 }), ctx());
    expect(view.table?.rows.map((r) => r.key)).toEqual([
      'total',
      'unallocated',
      'extractable',
      'threshold',
      'value',
    ]);
    expect(view.table?.rows[1]?.cells.slice(0, 2)).toEqual([
      'skills.unallocatedSp',
      (1_450_000).toLocaleString(),
    ]);
    expect(view.table?.rows[3]?.cells[1]).toEqual({ text: '75%', bar: 0.75 });
    expect(view.table?.rows[3]?.cells[2]).toContain('overview.widgets.sp.ofThreshold');
    expect(view.table?.rows[4]?.cells[1]).toMatchObject({ iskAmount: 150 * 200_000 });
  });

  it('leaves the threshold and value rows out when monitoring is off and nothing is priced', () => {
    const view = buildView('sp', spFeeds({ monitoring: false }), ctx());
    expect(view.table?.rows.map((r) => r.key)).toEqual(['total', 'unallocated', 'extractable']);
  });
});

describe('a lapsed grant over saved data', () => {
  const resolved = (kind: string, feeds: Feeds) =>
    resolveWidget(buildView(kind, feeds, ctx()).status);
  const saved = { needsReauth: true, fetchedAt: new Date(NOW) };
  const unsaved = { needsReauth: true, fetchedAt: null };

  it('keeps saved mail with a sign-in note, and asks for the grant when nothing was read', () => {
    const mail = { unread: 3, recent: [] };
    expect(resolved('mail', { mail: ok({ ...mail, ...saved }) })).toMatchObject({
      state: 'ok',
      reauthNote: true,
    });
    expect(resolved('mail', { mail: ok({ ...mail, ...unsaved }) })).toMatchObject({
      state: 'needsPermission',
      reauthNote: false,
    });
  });

  it('keeps saved contracts with a sign-in note, and asks for the grant when nothing was read', () => {
    const summary = {
      inProgress: 2,
      exchanges: 0,
      outstanding: 0,
      dueSoon: 0,
      overdue: 0,
      soonest: null,
      items: [],
      rows: [],
    };
    const contracts = (over: Record<string, unknown>) =>
      ({ contracts: ok({ summary, route: null, ...over }) as never }) satisfies Feeds;
    expect(resolved('contracts', contracts(saved))).toMatchObject({
      state: 'ok',
      reauthNote: true,
    });
    expect(resolved('contracts', contracts(unsaved))).toMatchObject({ state: 'needsPermission' });
  });

  it('keeps saved orders with a sign-in note, and asks for the grant when there are none', () => {
    const order = {
      order_id: 1,
      type_id: 34,
      region_id: 10000002,
      location_id: 60003760,
      is_buy_order: false,
      is_corporation: false,
      price: 5,
      volume_remain: 10,
      volume_total: 10,
      issued: new Date(NOW - HOUR_MS).toISOString(),
      duration: 90,
      range: 'station',
    };
    const orders = (list: unknown[]) =>
      ({
        orders: ok({
          openOrders: {
            entries: [
              {
                characterId: 91,
                characterName: 'Pilot',
                orders: list,
                fetchedAt: list.length ? NOW : 0,
                fromCache: true,
                needsReauth: true,
              },
            ],
            skipped: [],
          },
          typeNames: new Map(),
          npcStations: new Map(),
          stationsLoaded: true,
          stationPrices: new Map(),
          costBases: new Map(),
          walletBasisGaps: new Map(),
          problemSamples: new Map(),
          skillsByCharacter: new Map(),
          now: NOW,
        }) as never,
      }) satisfies Feeds;
    expect(resolved('orders', orders([order]))).toMatchObject({ reauthNote: true });
    expect(resolved('orders', orders([]))).toMatchObject({ state: 'needsPermission' });
  });
});

describe('orders widget', () => {
  const ordersFeed = (list: unknown[]) =>
    ({
      orders: ok({
        openOrders: {
          entries: [
            {
              characterId: 91,
              characterName: 'Pilot',
              orders: list,
              fetchedAt: NOW,
              fromCache: false,
              needsReauth: false,
            },
          ],
          skipped: [],
        },
        typeNames: new Map(),
        npcStations: new Map(),
        stationsLoaded: true,
        stationPrices: new Map(),
        costBases: new Map(),
        walletBasisGaps: new Map(),
        problemSamples: new Map(),
        skillsByCharacter: new Map(),
        now: NOW,
      }) as never,
    }) satisfies Feeds;
  const order = (duration: number) => ({
    order_id: duration,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    price: 5,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(NOW - HOUR_MS).toISOString(),
    duration,
    range: 'station',
  });

  it('links its number to Open Orders with the work-through queue started, for its own Character', () => {
    const view = buildView('orders', ordersFeed([order(2), order(90)]), ctx());
    expect(view.number?.link).toEqual({
      label: 'overview.widgets.orders.workThrough{"total":1}',
      to: '/market/orders?orders.characters=91&orders.workThrough=1',
    });
  });

  it('has no work-through link when nothing needs a fix', () => {
    const view = buildView('orders', ordersFeed([order(90)]), ctx());
    expect(view.number?.link).toBeUndefined();
  });

  it('is failed, never "no open orders", when the read landed nothing and the grant is fine', () => {
    const feeds = ordersFeed([]);
    const read = feeds.orders as unknown as {
      data: { openOrders: { entries: { fetchedAt: number }[] } };
    };
    read.data.openOrders.entries[0]!.fetchedAt = 0;
    const view = buildView('orders', feeds, ctx());
    expect(stateOf(view)).toBe('failed');
    expect(view.fetchedAt).toBeNull();
  });

  it('stamps the data age with the real read, not the moment the view was built', () => {
    const feeds = ordersFeed([order(90)]);
    const read = feeds.orders as unknown as {
      data: { openOrders: { entries: { fetchedAt: number }[] } };
    };
    read.data.openOrders.entries[0]!.fetchedAt = NOW - 3_600_000;
    expect(buildView('orders', feeds, ctx()).fetchedAt).toEqual(new Date(NOW - 3_600_000));
  });
});
