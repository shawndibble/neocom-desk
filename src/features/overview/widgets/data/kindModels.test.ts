import { describe, expect, it } from 'vitest';
import { resolveWidget } from '../state';
import { buildView, feedsFor, KIND_FEEDS } from './models';
import { humanizeRefType } from './kindModels';
import type { BuildContext, FeedState, Feeds } from './types';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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
const iso = (ms: number) => new Date(ms).toISOString();

describe('feeds for the later kinds', () => {
  it('reads each kind from its own feed, and wallet from the journal as well', () => {
    expect(KIND_FEEDS.netWorth).toEqual(['netWorth']);
    expect(KIND_FEEDS.walletFlow).toEqual(['journal']);
    expect(feedsFor(['wallet', 'walletFlow']).sort()).toEqual(['journal', 'wallet']);
  });
});

describe('humanizeRefType', () => {
  it('reads an ESI ref type as words', () => {
    expect(humanizeRefType('bounty_prize')).toBe('Bounty prize');
  });
});

describe('walletFlow', () => {
  const entry = (id: number, ago: number, amount: number, refType: string) => ({
    id,
    date: iso(NOW - ago),
    ref_type: refType,
    description: '',
    amount,
  });
  const journal = (entries: ReturnType<typeof entry>[]): Feeds => ({
    journal: ok({
      result: { data: entries, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
      needsReauth: false,
    }),
  });

  it('nets income against spending over the range, as paired weekly bars and a table by type', () => {
    const view = buildView(
      'walletFlow',
      journal([
        entry(1, DAY, 300, 'bounty_prize'),
        entry(2, 2 * DAY, -100, 'market_fee'),
        entry(3, 20 * DAY, 1000, 'market_transaction'),
      ]),
      ctx({ range: 7 })
    );
    expect(stateOf(view)).toBe('ok');
    expect(view.number.iskAmount).toBe(200);
    expect(view.chart?.kind).toBe('diverging');
    if (view.chart?.kind !== 'diverging') return;
    // Seven daily bars: 300 came in yesterday, 100 went out the day before.
    expect(view.chart.up).toEqual([0, 0, 0, 0, 0, 300, 0]);
    expect(view.chart.down).toEqual([0, 0, 0, 0, 100, 0, 0]);
    // The 20-day-old entry is outside a 7-day range.
    expect(view.table?.rows.map((r) => r.key)).toEqual(['bounty_prize', 'market_fee']);
    expect(view.rows).toEqual([]);
  });

  it('compares with the previous window when the journal is long enough, else names the top source', () => {
    const long = buildView(
      'walletFlow',
      journal([entry(1, DAY, 300, 'a'), entry(2, 9 * DAY, 100, 'a'), entry(3, 20 * DAY, 1, 'a')]),
      ctx({ range: 7 })
    );
    expect(long.number.secondary).toMatchObject({ direction: 'up', tone: 'good' });
    const short = buildView('walletFlow', journal([entry(1, DAY, 300, 'a')]), ctx({ range: 30 }));
    expect(short.number.secondary?.direction).toBeUndefined();
    expect(short.number.secondary?.text).toContain('walletFlow.top');
  });

  it('applies the widget range over the same data, not in the loader', () => {
    const feeds = journal([entry(1, DAY, 300, 'a'), entry(2, 20 * DAY, 1000, 'b')]);
    expect(buildView('walletFlow', feeds, ctx({ range: 7 })).number.iskAmount).toBe(300);
    expect(buildView('walletFlow', feeds, ctx({ range: 30 })).number.iskAmount).toBe(1300);
  });

  it('says how far the journal really reaches when the range asks for more', () => {
    const view = buildView('walletFlow', journal([entry(1, 29 * DAY, 5, 'a')]), ctx({ range: 90 }));
    expect(view.chart?.note).toContain('noteCovered');
    expect(view.chart?.note).toContain('"covered":29');
  });

  it('asks for the grant when the journal says so, and is empty with no entries', () => {
    const lapsed: Feeds = { journal: ok({ result: null, needsReauth: true }) };
    expect(stateOf(buildView('walletFlow', lapsed, ctx()))).toBe('needsPermission');
    expect(stateOf(buildView('walletFlow', journal([]), ctx()))).toBe('empty');
  });
});

describe('wallet chart', () => {
  const wallet = ok({
    result: { data: 500, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
    needsReauth: false,
  });

  it('draws the journal-derived daily balance over the range', () => {
    const feeds: Feeds = {
      wallet,
      journal: ok({
        result: {
          data: [
            { id: 1, date: iso(NOW - 3 * DAY), ref_type: 'x', description: '', balance: 100 },
            { id: 2, date: iso(NOW - DAY), ref_type: 'x', description: '', balance: 500 },
          ],
          fetchedAt: new Date(NOW),
          fromCache: false,
          truncated: false,
        },
        needsReauth: false,
      }),
    };
    const view = buildView('wallet', feeds, ctx({ range: 7 }));
    expect(view.chart?.kind).toBe('area');
    if (view.chart?.kind !== 'area') return;
    // Days before the first entry are unknown, not zero.
    expect(view.chart.values).toEqual([100, 100, 500, 500]);
  });

  it('keeps the Number whole while the journal loads or fails', () => {
    for (const journal of [
      { data: null, error: false, loading: true },
      { data: null, error: true, loading: false },
    ]) {
      const view = buildView('wallet', { wallet, journal }, ctx());
      expect(stateOf(view)).toBe('ok');
      expect(view.number.iskAmount).toBe(500);
      expect(view.chart).toBeUndefined();
    }
  });
});

describe('netWorth', () => {
  const char = (characterId: number, covered = true, day = '2026-10-10') => ({
    characterId,
    day,
    covered,
    layers: { isk: 1000, assets: 9000, escrow: 0, sellOrders: 2000 },
    history: [],
  });

  it('stacks the recorded layers in bar order with a legend, and no contracts layer', () => {
    const view = buildView('netWorth', { netWorth: ok({ characters: [char(91)] }) }, ctx());
    expect(view.number.iskAmount).toBe(12_000);
    expect(view.chart?.kind).toBe('stack');
    if (view.chart?.kind !== 'stack') return;
    // Empty escrow is left out; the rest keep the Net Worth page's hues.
    expect(view.chart.parts.map((p) => [p.key, p.color])).toEqual([
      ['assets', 's1'],
      ['sellOrders', 's4'],
      ['isk', 's3'],
    ]);
    expect(view.chart.parts.some((p) => p.color === 'iskNeg' || p.color === 'warning')).toBe(false);
  });

  it('draws the layers over time and says how the total moved when there is a history', () => {
    const history = [
      { day: '2026-10-09', layers: { isk: 500, assets: 8000, escrow: 0, sellOrders: 1500 } },
      { day: '2026-10-10', layers: { isk: 1000, assets: 9000, escrow: 0, sellOrders: 2000 } },
    ];
    const view = buildView(
      'netWorth',
      { netWorth: ok({ characters: [{ ...char(91), history }] }) },
      ctx()
    );
    expect(view.chart?.kind).toBe('stackedArea');
    if (view.chart?.kind !== 'stackedArea') return;
    expect(view.chart.layers.map((l) => [l.key, l.values])).toEqual([
      ['assets', [8000, 9000]],
      ['sellOrders', [1500, 2000]],
      ['isk', [500, 1000]],
    ]);
    expect(view.number.secondary).toMatchObject({ direction: 'up', tone: 'good' });
    expect(view.table?.rows.map((r) => r.key)).toEqual(['assets', 'sellOrders', 'isk']);
    expect(view.table?.rows[0]!.cells[3]).toBe('+1K');
    expect(view.rows).toEqual([]);
  });

  it('falls back to one bar of the latest layers with no history, and offers no change', () => {
    const view = buildView('netWorth', { netWorth: ok({ characters: [char(91)] }) }, ctx());
    expect(view.chart?.kind).toBe('stack');
    expect(view.number.secondary).toBeUndefined();
    expect(view.table?.rows[0]!.cells[3]).toBe('—');
  });

  it('sums every Character only when scoped to all, and counts only those with every permission', () => {
    const feeds: Feeds = {
      netWorth: ok({ characters: [char(91), char(92), char(93, false)] }),
    };
    expect(buildView('netWorth', feeds, ctx()).number.iskAmount).toBe(12_000);
    expect(buildView('netWorth', feeds, ctx({ scopeAll: true })).number.iskAmount).toBe(24_000);
  });

  it('asks for the grant when the Character has a snapshot but lost a permission, and is empty with none', () => {
    const lost: Feeds = { netWorth: ok({ characters: [char(91, false)] }) };
    expect(stateOf(buildView('netWorth', lost, ctx()))).toBe('needsPermission');
    expect(stateOf(buildView('netWorth', { netWorth: ok({ characters: [] }) }, ctx()))).toBe(
      'empty'
    );
  });
});

describe('profit', () => {
  const run = (id: string, ago: number, profit: number, productTypeID = 1, status = 'closed') => ({
    runId: id,
    productTypeID,
    quantity: 2,
    loggedAt: NOW - ago,
    profit,
    status: status as 'closed',
  });
  const feeds = (runs: ReturnType<typeof run>[]): Feeds => ({
    profit: ok({
      runs,
      names: new Map([
        [1, 'Raven'],
        [2, 'Drake'],
      ]),
    }),
  });

  it('totals the range and buckets by week, newest last', () => {
    const view = buildView(
      'profit',
      feeds([run('a', 1 * DAY, 100), run('b', 9 * DAY, 50), run('c', 60 * DAY, 999)]),
      ctx({ range: 30 })
    );
    expect(view.number.iskAmount).toBe(150);
    expect(view.chart?.kind).toBe('bars');
    if (view.chart?.kind !== 'bars') return;
    expect(view.chart.values).toHaveLength(5);
    expect(view.chart.values.at(-1)).toBe(100);
    expect(view.chart.values.at(-2)).toBe(50);
    expect(view.chart.xStart).toContain('weeksAgo');
  });

  it('is range-aware: a 7 day range reads by day and drops older runs from the total', () => {
    const view = buildView(
      'profit',
      feeds([run('a', DAY, 100), run('b', 9 * DAY, 50)]),
      ctx({ range: 7 })
    );
    expect(view.number.iskAmount).toBe(100);
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.values).toHaveLength(7);
    expect(view.chart.xStart).toContain('daysAgo');
  });

  it('lists products by profit and is empty only with no runs logged at all', () => {
    const view = buildView('profit', feeds([run('a', DAY, 10, 1), run('b', DAY, 90, 2)]), ctx());
    expect(view.rows.map((r) => r.title)).toEqual(['Drake', 'Raven']);
    expect(stateOf(buildView('profit', feeds([]), ctx()))).toBe('empty');
  });
});

describe('miningYield', () => {
  const row = (characterId: number, date: string, isk: number, ores = [{ typeId: 1, isk }]) => ({
    characterId,
    date,
    isk,
    ores,
  });
  const data = (rows: ReturnType<typeof row>[]) =>
    ok({
      rows,
      typeNames: new Map([[1, 'Veldspar']]),
      trackedIds: [91, 92],
      reauthIds: [],
      oldestSaved: '2026-09-01',
      fetchedAt: new Date(NOW),
    });

  it('averages ISK per day over the range and draws one bar per day', () => {
    const view = buildView(
      'miningYield',
      { miningYield: data([row(91, '2026-10-11', 700), row(91, '2026-10-09', 700)]) },
      ctx({ range: 7 })
    );
    expect(view.number.iskAmount).toBe(200);
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.values).toHaveLength(7);
    expect(view.chart.values.at(-1)).toBe(700);
    expect(view.rows[0]!.title).toBe('Veldspar');
  });

  it('filters to the header Character unless scoped to all', () => {
    const feeds = { miningYield: data([row(91, '2026-10-11', 70), row(92, '2026-10-11', 30)]) };
    expect(buildView('miningYield', feeds, ctx({ range: 7 })).number.iskAmount).toBe(10);
    expect(
      buildView('miningYield', feeds, ctx({ range: 7, scopeAll: true })).number.iskAmount
    ).toBe(14.285714285714286);
  });

  it('says where saved history starts when the range reaches past it', () => {
    const feeds = {
      miningYield: ok({
        rows: [row(91, '2026-10-10', 10)],
        typeNames: new Map(),
        trackedIds: [91],
        reauthIds: [],
        oldestSaved: '2026-10-05',
        fetchedAt: null,
      }),
    };
    const view = buildView('miningYield', feeds, ctx({ range: 30 }));
    expect(view.number.secondary?.text).toContain('bestDay');
    expect(view.chart?.note).toContain('noteSince');
  });

  it('needs the grant when the Character is unreadable, and has no chart when nothing was mined in range', () => {
    const lapsed = {
      miningYield: ok({
        rows: [],
        typeNames: new Map(),
        trackedIds: [91],
        reauthIds: [91],
        oldestSaved: null,
        fetchedAt: null,
      }),
    };
    expect(stateOf(buildView('miningYield', lapsed, ctx()))).toBe('needsPermission');
    const quiet = buildView(
      'miningYield',
      { miningYield: data([row(91, '2026-01-01', 5)]) },
      ctx({ range: 7 })
    );
    expect(quiet.chart).toBeUndefined();
  });
});

describe('lp', () => {
  const lp = (entries: { corporationId: number; name: string | null; points: number }[]) =>
    ok({ entries, everMarks: 0, needsReauth: false, fetchedAt: new Date(NOW) });

  it('totals the balances and charts the largest corporations by name', () => {
    const view = buildView(
      'lp',
      {
        lp: lp([
          { corporationId: 1, name: 'Sisters of EVE', points: 800 },
          { corporationId: 2, name: null, points: 400 },
        ]),
      },
      ctx()
    );
    expect(view.number.value).toBe('1.2K');
    expect(view.rows).toEqual([]);
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['Sisters of EVE', '800', '67%'],
      [expect.stringContaining('lp.corporation'), '400', '33%'],
    ]);
    if (view.chart?.kind !== 'hbars') throw new Error('hbars');
    expect(view.chart.rows.map((r) => r.share)).toEqual([1, 0.5]);
  });

  it('is empty with no balances and needs the grant when it lapsed', () => {
    expect(stateOf(buildView('lp', { lp: lp([]) }, ctx()))).toBe('empty');
    const lapsed = { lp: ok({ entries: [], everMarks: 0, needsReauth: true, fetchedAt: null }) };
    expect(stateOf(buildView('lp', lapsed, ctx()))).toBe('needsPermission');
  });
});

describe('clones', () => {
  const base = {
    needsReauth: false,
    note: null,
    cloneCount: 2,
    cooldownReadyAt: null,
    fetchedAt: new Date(NOW),
  };

  it('names the best clone and how much sooner the queue finishes', () => {
    const view = buildView(
      'clones',
      {
        clones: ok({
          ...base,
          verdict: 'jump' as const,
          bestId: 7,
          savedSeconds: 3 * 86_400,
          rows: [
            { id: 'worn', label: null, totalSeconds: 9, deltaSeconds: 0 },
            { id: 7, label: 'Jita Alpha', totalSeconds: 6, deltaSeconds: -3 * 86_400 },
          ],
        }),
      },
      ctx()
    );
    expect(view.number.value).toBe('Jita Alpha');
    expect(view.number.secondary?.text).toContain('"duration":"3d');
    expect(view.rows.map((r) => r.title)).toEqual([
      expect.stringContaining('current'),
      'Jita Alpha',
    ]);
  });

  it('says to stay when no jump clone is sooner', () => {
    const view = buildView(
      'clones',
      {
        clones: ok({
          ...base,
          verdict: 'stay' as const,
          bestId: 'worn',
          savedSeconds: null,
          rows: [{ id: 'worn', label: null, totalSeconds: 9, deltaSeconds: 0 }],
        }),
      },
      ctx()
    );
    expect(view.number.value).toContain('stay');
  });

  it("gives the page's own reason when there is no verdict", () => {
    const view = buildView(
      'clones',
      {
        clones: ok({
          ...base,
          note: 'paused' as const,
          verdict: null,
          bestId: null,
          savedSeconds: null,
          rows: [],
        }),
      },
      ctx()
    );
    expect(view.number.secondary?.text).toBe('clones.verdict.notePaused');
  });

  it('needs the grant, and is empty with no jump clones', () => {
    const lapsed = ok({
      ...base,
      needsReauth: true,
      note: null,
      verdict: null,
      bestId: null,
      savedSeconds: null,
      rows: [],
    });
    expect(stateOf(buildView('clones', { clones: lapsed }, ctx()))).toBe('needsPermission');
    const none = ok({
      ...base,
      cloneCount: 0,
      verdict: null,
      bestId: null,
      savedSeconds: null,
      rows: [],
    });
    expect(stateOf(buildView('clones', { clones: none }, ctx()))).toBe('empty');
  });
});

describe('location', () => {
  it('leads with the system, its security and the ship, and says nothing about docking', () => {
    const view = buildView(
      'location',
      {
        location: ok({
          needsReauth: false,
          system: { id: 30000142, name: 'Jita', security: 0.9459 },
          shipTypeId: 1,
          shipName: 'Muninn',
        }),
      },
      ctx()
    );
    expect(view.number.value).toBe('Jita');
    expect(view.number.secondary?.text).toBe('Muninn');
    expect(view.number.unit).toContain('"value":"0.9"');
    expect(view.rows.map((r) => r.key)).toEqual(['system', 'ship']);
  });

  it('is empty when the location cannot be read and needs the grant when it lapsed', () => {
    const none = { needsReauth: false, system: null, shipTypeId: null, shipName: null };
    expect(stateOf(buildView('location', { location: ok(none) }, ctx()))).toBe('empty');
    expect(
      stateOf(buildView('location', { location: ok({ ...none, needsReauth: true }) }, ctx()))
    ).toBe('needsPermission');
  });
});

describe('charts on the existing kinds', () => {
  it('charts the queue as one bar, a part per skill sized by its training time', () => {
    const feeds: Feeds = {
      skills: ok({
        skillsResult: null,
        queueResult: {
          data: [
            {
              skill_id: 3300,
              queue_position: 0,
              finished_level: 5,
              start_date: iso(NOW - HOUR),
              finish_date: iso(NOW + 4 * HOUR),
            },
            {
              skill_id: 3300,
              queue_position: 1,
              finished_level: 5,
              start_date: iso(NOW + 4 * HOUR),
              finish_date: iso(NOW + 24 * HOUR),
            },
          ],
          fetchedAt: new Date(NOW),
          fromCache: false,
          truncated: false,
        },
        queueNeedsReauth: false,
        totalSp: 1,
        catalog: { bySkillTypeID: new Map([[3300, { name: 'Gunnery' }]]) },
        maxOrders: 5,
      }) as never,
    };
    const view = buildView('training', feeds, ctx());
    if (view.chart?.kind !== 'stack') throw new Error('stack');
    expect(view.chart.parts.map((p) => p.value)).toEqual([4 * 3600, 20 * 3600]);
    expect(view.chart.note).toContain('overview.widgets.chart.training.note');
  });

  it('charts each market as a bar split Out, Low, OK, Over, worst market first', () => {
    const feeds: Feeds = {
      stock: ok({
        board: {
          markets: [
            {
              listId: 'b',
              name: 'Amarr VIII',
              summary: { out: 0, low: 0, ok: 3, over: 1 } as never,
            },
            {
              listId: 'a',
              name: 'Jita IV - Moon 4',
              summary: { out: 1, low: 1, ok: 2, over: 0 } as never,
            },
          ],
          totals: { out: 1, low: 1 },
          counted: true,
        },
      }),
    };
    const view = buildView('stock', feeds, ctx());
    if (view.chart?.kind !== 'stackRows') throw new Error('stackRows');
    expect(view.chart.rows.map((r) => [r.label, r.parts.map((p) => p.value)])).toEqual([
      ['Jita IV', [1, 1, 2, 0]],
      ['Amarr VIII', [0, 0, 3, 1]],
    ]);
    expect(view.table?.rows.map((r) => r.key)).toEqual(['a', 'b']);
  });
});

describe('clones table', () => {
  const SDAY = 86_400;
  const base = {
    needsReauth: false,
    note: null,
    cloneCount: 2,
    cooldownReadyAt: null,
    fetchedAt: new Date(NOW),
  };

  it('compares the clones: finish, saving against the current one, implants, where', () => {
    const view = buildView(
      'clones',
      {
        clones: ok({
          ...base,
          verdict: 'jump' as const,
          bestId: 7,
          savedSeconds: 3 * SDAY,
          rows: [
            { id: 'worn', label: null, implantCount: 5, totalSeconds: 9 * SDAY, deltaSeconds: 0 },
            {
              id: 7,
              label: 'Hauling alt',
              location: 'Jita IV',
              implantCount: 2,
              totalSeconds: 6 * SDAY,
              deltaSeconds: -3 * SDAY,
            },
            { id: 8, label: 'Far', implantCount: 0, totalSeconds: 10 * SDAY, deltaSeconds: SDAY },
          ],
        }),
      },
      ctx()
    );
    const table = view.table;
    expect(table?.columns.map((c) => c.key)).toEqual([
      'clone',
      'vs',
      'finishes',
      'implants',
      'location',
    ]);
    expect(table?.rows[1]?.cells).toEqual([
      'Hauling alt',
      { text: expect.stringContaining('soonerBy'), tone: 'good' },
      '6d 0h',
      '2',
      'Jita IV',
    ]);
    expect(table?.rows[0]?.cells[1]).toBe('—');
    expect(table?.rows[2]?.cells[1]).toEqual(expect.stringContaining('laterBy'));
  });

  it('names the nearest rival when the answer is to stay', () => {
    const view = buildView(
      'clones',
      {
        clones: ok({
          ...base,
          verdict: 'stay' as const,
          bestId: 'worn',
          savedSeconds: null,
          rows: [
            { id: 'worn', label: null, totalSeconds: 9, deltaSeconds: 0 },
            { id: 7, label: 'Far', totalSeconds: 12, deltaSeconds: 3 * SDAY },
            { id: 8, label: 'Farther', totalSeconds: 13, deltaSeconds: 5 * SDAY },
          ],
        }),
      },
      ctx()
    );
    expect(view.number.secondary?.text).toContain('overview.widgets.data.clones.nextBest');
    expect(view.number.secondary?.text).toContain('"duration":"3d');
  });
});

describe('location table', () => {
  it.each([
    [0.9459, 'good'],
    [0.3, 'caution'],
    [-0.2, 'bad'],
  ])('colours security %s by its band', (security, tone) => {
    const view = buildView(
      'location',
      {
        location: ok({
          needsReauth: false,
          system: { id: 1, name: 'Sys', security },
          shipTypeId: 1,
          shipName: 'Muninn',
        }),
      },
      ctx()
    );
    expect(view.table?.rows.map((r) => r.key)).toEqual(['system', 'security', 'ship']);
    expect(view.table?.rows[1]?.cells[1]).toMatchObject({ tone });
    expect(view.table?.rows[0]?.cells).toEqual([expect.any(String), 'Sys']);
  });
});
