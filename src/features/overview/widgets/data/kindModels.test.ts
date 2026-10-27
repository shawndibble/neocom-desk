import { describe, expect, it } from 'vitest';
import { summarizeSurvey } from '@/engine/survey/series';
import { formatDuration } from '@/lib/duration';
import { resolveWidget } from '../state';
import { buildView, endpointsOf, feedsFor, feedsOf, kindSumsAcrossCharacters } from './models';
import { scopePresentation } from '../scope';
import { humanizeRefType } from './kindModels';
import type {
  BelowMarketWidgetData,
  JumpTimersWidgetData,
  HaulingWidgetData,
  KillsWidgetData,
  OmegaWidgetData,
  RouteSafetyWidgetData,
  SurveyWidgetData,
  TradingProfitWidgetData,
} from './kindLoaders';
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
    expect(feedsOf('netWorth')).toEqual(['netWorth']);
    // Its Flow reads the journal only, its Balance the wallet too: the kind reads both.
    expect(feedsOf('wallet')).toEqual(['wallet', 'journal']);
    expect(feedsFor(['wallet', 'netWorth']).sort()).toEqual(['journal', 'netWorth', 'wallet']);
  });
});

describe('humanizeRefType', () => {
  it('reads an ESI ref type as words', () => {
    expect(humanizeRefType('bounty_prize')).toBe('Bounty prize');
  });
});

describe('wallet, Show Flow', () => {
  const flowView = (feeds: Feeds, c: BuildContext) =>
    buildView('wallet', feeds, { ...c, show: 'flow' });
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

  it('nets income against spending over the range, as net bars and a table by type', () => {
    const view = flowView(
      journal([
        entry(1, DAY, 300, 'bounty_prize'),
        entry(2, 2 * DAY, -100, 'market_fee'),
        entry(3, 20 * DAY, 1000, 'market_transaction'),
      ]),
      ctx({ range: 7 })
    );
    expect(stateOf(view)).toBe('ok');
    expect(view.number.iskAmount).toBe(200);
    expect(view.chart?.kind).toBe('bars');
    if (view.chart?.kind !== 'bars') return;
    // Seven daily bars of net: 300 came in yesterday, 100 went out the day before.
    expect(view.chart.values).toEqual([0, 0, 0, 0, -100, 300, 0]);
    expect(view.chart.gains).toBe(true);
    expect(view.chart.tips).toHaveLength(7);
    // The 20-day-old entry is outside a 7-day range.
    expect(view.table?.rows.map((r) => r.key)).toEqual(['bounty_prize', 'market_fee']);
    expect(view.rows).toEqual([]);
  });

  it('compares with the previous window when the journal is long enough, else names the top source', () => {
    const long = flowView(
      journal([entry(1, DAY, 300, 'a'), entry(2, 9 * DAY, 100, 'a'), entry(3, 20 * DAY, 1, 'a')]),
      ctx({ range: 7 })
    );
    expect(long.number.secondary).toMatchObject({ direction: 'up', tone: 'good' });
    const short = flowView(journal([entry(1, DAY, 300, 'a')]), ctx({ range: 30 }));
    expect(short.number.secondary?.direction).toBeUndefined();
    expect(short.number.secondary?.text).toContain('walletFlow.top');
  });

  it('applies the widget range over the same data, not in the loader', () => {
    const feeds = journal([entry(1, DAY, 300, 'a'), entry(2, 20 * DAY, 1000, 'b')]);
    expect(flowView(feeds, ctx({ range: 7 })).number.iskAmount).toBe(300);
    expect(flowView(feeds, ctx({ range: 30 })).number.iskAmount).toBe(1300);
  });

  it('says how far the journal really reaches when the range asks for more', () => {
    const view = flowView(journal([entry(1, 29 * DAY, 5, 'a')]), ctx({ range: 90 }));
    expect(view.chart?.note).toContain('noteCovered');
    expect(view.chart?.note).toContain('"covered":29');
  });

  it('asks for the grant when the journal says so, and is empty with no entries', () => {
    const lapsed: Feeds = { journal: ok({ result: null, needsReauth: true }) };
    expect(stateOf(flowView(lapsed, ctx()))).toBe('needsPermission');
    expect(stateOf(flowView(journal([]), ctx()))).toBe('empty');
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
    layers: { isk: 1000, assets: 9000, escrow: 0, sellOrders: 2000, contracts: 0 },
    history: [],
  });

  it('is history, not a cached read: it never sets fromCache, so the header notice stays off online', () => {
    const view = buildView('netWorth', { netWorth: ok({ characters: [char(91)] }) }, ctx());
    expect(view.fromCache).toBe(false);
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
      {
        day: '2026-10-09',
        layers: { isk: 500, assets: 8000, escrow: 0, sellOrders: 1500, contracts: 0 },
      },
      {
        day: '2026-10-10',
        layers: { isk: 1000, assets: 9000, escrow: 0, sellOrders: 2000, contracts: 0 },
      },
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
    expect(view.table?.rows[0]!.cells[3]).toEqual({ text: '+1K', tone: 'good' });
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
      ['Sisters of EVE', '800', { text: '67%', bar: 800 / 1200 }],
      [expect.stringContaining('lp.corporation'), '400', { text: '33%', bar: 400 / 1200 }],
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
          fetchedAt: new Date(1_700_000_000_000),
        }),
      },
      ctx()
    );
    expect(view.fetchedAt).toEqual(new Date(1_700_000_000_000));
    expect(view.number.value).toBe('Jita');
    expect(view.number.secondary?.text).toBe('Muninn');
    expect(view.number.unit).toContain('"value":"0.9"');
    expect(view.rows.map((r) => r.key)).toEqual(['system', 'ship']);
  });

  it('is empty when the location cannot be read and needs the grant when it lapsed', () => {
    const none = {
      needsReauth: false,
      system: null,
      shipTypeId: null,
      shipName: null,
      fetchedAt: null,
    };
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
          fetchedAt: new Date(1_700_000_000_000),
        }),
      },
      ctx()
    );
    expect(view.table?.rows.map((r) => r.key)).toEqual(['system', 'security', 'ship']);
    expect(view.table?.rows[1]?.cells[1]).toMatchObject({ tone });
    expect(view.table?.rows[0]?.cells).toEqual([expect.any(String), 'Sys']);
  });
});

describe('survey', () => {
  const scan = (at: number, rocks: [string, number][]) => ({
    at,
    rocks: rocks.map(([ore, volume]) => ({ ore, volume })),
  });
  // 1,500 m³ mined in the hour between the scans, 1,500 left: another hour from the last scan, 30 minutes ago.
  const summary = () =>
    summarizeSurvey([
      scan(NOW - 1.5 * HOUR, [
        ['Arkonor', 500],
        ['Veldspar', 2500],
      ]),
      scan(NOW - HOUR / 2, [['Veldspar', 1500]]),
    ]);
  const data = (over: Partial<SurveyWidgetData> = {}): SurveyWidgetData => ({
    hasSurvey: true,
    location: 'Efa',
    summary: summary(),
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('reads from its own feed and links to the Mining Survey tab', () => {
    expect(feedsOf('survey')).toEqual(['survey']);
    expect(buildView('survey', { survey: ok(data()) }, ctx()).to).toBe('/mining/survey');
  });

  it('leads with the time left until the field is mined out, and says when it finishes', () => {
    const view = buildView('survey', { survey: ok(data()) }, ctx());
    expect(stateOf(view)).toBe('ok');
    const etaAt = summary()?.etaAt ?? 0;
    expect(view.number.value).toBe(formatDuration((etaAt - NOW) / 1000));
    expect(view.number.secondary?.text).toContain('secondaryAt');
    expect(view.number.secondary?.text).toContain('Efa');
  });

  it('says the field is due, not zero minutes, once its estimate has passed', () => {
    const late = buildView('survey', { survey: ok(data()) }, ctx({ now: NOW + 5 * HOUR }));
    expect(late.number.value).toBe('overview.widgets.data.survey.overdue');
    expect(late.number.unit).toBeUndefined();
  });

  it('drops the place from the finish line when the survey has none', () => {
    const view = buildView('survey', { survey: ok(data({ location: null })) }, ctx());
    expect(view.number.secondary?.text).toContain('overview.widgets.data.survey.secondary{');
  });

  it('tables what is left of each ore and leaves out an ore that is finished', () => {
    const view = buildView('survey', { survey: ok(data()) }, ctx());
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['Veldspar', expect.stringContaining('1.5K')],
    ]);
  });

  it('draws the Survey tab volume chart once there are two scans', () => {
    const view = buildView('survey', { survey: ok(data()) }, ctx());
    expect(view.chart?.kind).toBe('survey');
    const one = summarizeSurvey([scan(NOW, [['Veldspar', 100]])]);
    expect(
      buildView('survey', { survey: ok(data({ summary: one })) }, ctx()).chart
    ).toBeUndefined();
  });

  it('is empty with no survey or no scans', () => {
    const none = data({ hasSurvey: false, summary: null, location: null });
    expect(stateOf(buildView('survey', { survey: ok(none) }, ctx()))).toBe('empty');
    expect(stateOf(buildView('survey', { survey: ok(data({ summary: null })) }, ctx()))).toBe(
      'empty'
    );
  });

  it('is loading before the first read and failed, keeping the last value, when a read fails', () => {
    expect(
      stateOf(buildView('survey', { survey: { data: null, error: false, loading: true } }, ctx()))
    ).toBe('loading');
    const failed = buildView(
      'survey',
      { survey: { data: data(), error: true, loading: false } },
      ctx()
    );
    const resolved = resolveWidget(failed.status);
    expect(resolved.state).toBe('failed');
    expect(resolved.showLastGood).toBe(true);
    expect(failed.number.value).not.toBe('—');
  });
});

describe('routeSafety', () => {
  const kills = (n: number, ago = 60_000) => Array.from({ length: n }, (_, i) => NOW - ago - i);
  const data = (over: Partial<RouteSafetyWidgetData> = {}): RouteSafetyWidgetData => ({
    hasRoute: true,
    href: '/travel/route?from=1&stops=3',
    systems: [
      { systemId: 1, name: 'Efa', kills: [] },
      { systemId: 2, name: 'Niarja', kills: kills(6) },
      { systemId: 3, name: 'Amarr', kills: kills(1, 5 * HOUR) },
      { systemId: 4, name: 'Unread', kills: null },
    ],
    raidable: [],
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('adds a condition row per live raidable skyhook on the route, after the kill rows', () => {
    const raidable = [
      {
        key: '3:9',
        systemId: 3,
        name: 'Amarr',
        jumps: 2,
        window: { startMs: NOW + HOUR, endMs: NOW + 5 * HOUR },
      },
      {
        key: '2:8',
        systemId: 2,
        name: 'Niarja',
        jumps: 1,
        window: { startMs: NOW - HOUR, endMs: NOW + HOUR },
      },
      {
        key: '1:7',
        systemId: 1,
        name: 'Efa',
        jumps: 0,
        window: { startMs: NOW - 5 * HOUR, endMs: NOW - HOUR },
      },
    ];
    const view = buildView('routeSafety', { routeSafety: ok(data({ raidable })) }, ctx());
    const rows = view.table?.rows ?? [];
    expect(rows.slice(4).map((r) => [r.key, r.cells[0], r.cells[1]])).toEqual([
      ['raid:2:8', 'Niarja', ''],
      ['raid:3:9', 'Amarr', ''],
    ]);
    const text = (i: number) => rows[i]?.cells[2] as { text: string; tone: string };
    expect(text(4).text).toContain('travel.sovRaids.routeRow');
    expect(text(4).text).toContain('travel.sovRaids.windowOpen');
    expect(text(5).text).toContain('travel.sovRaids.windowIn');
    expect(text(4).tone).toBe('caution');
  });

  it('reads from its own feed and links to Route Safety on the saved route', () => {
    expect(feedsOf('routeSafety')).toEqual(['routeSafety']);
    expect(buildView('routeSafety', { routeSafety: ok(data()) }, ctx()).to).toBe(
      '/travel/route?from=1&stops=3'
    );
  });

  it('leads with the busy systems and adds what the headline lacks', () => {
    const view = buildView('routeSafety', { routeSafety: ok(data()) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toContain('"count":1');
    // 7 kills over the three systems that were read, one system unread.
    expect(view.number.secondary?.text).toContain('"count":7');
    expect(view.number.secondary?.text).toContain('"unread":1');
  });

  it('tables system, kills and a condition word, busiest first, unknown kept apart from zero', () => {
    const view = buildView('routeSafety', { routeSafety: ok(data()) }, ctx());
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['Niarja', '6', { text: 'overview.widgets.routeSafety.level.busy', tone: 'caution' }],
      ['Amarr', '1', 'overview.widgets.routeSafety.level.some'],
      ['Efa', '0', 'overview.widgets.routeSafety.level.quiet'],
      ['Unread', '—', '—'],
    ]);
  });

  it('charts kills per hour with its max, its range and a text summary', () => {
    const view = buildView('routeSafety', { routeSafety: ok(data()) }, ctx());
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.values).toHaveLength(24);
    expect(view.chart.values[23]).toBe(6);
    expect(view.chart.values[18]).toBe(1);
    expect(view.chart.max).toContain('"count":6');
    expect(view.chart.xStart).toBe('overview.widgets.chart.routeSafety.xStart');
    expect(view.chart.xEnd).toBe('overview.widgets.chart.routeSafety.xEnd');
    expect(view.chart.summary).toContain('"count":7');
    expect(view.chart.summary).toContain('unread');
  });

  it('draws no chart when nothing died, and says so with a zero rather than an unknown', () => {
    const quiet = data({ systems: [{ systemId: 1, name: 'Efa', kills: [] }] });
    const view = buildView('routeSafety', { routeSafety: ok(quiet) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.chart).toBeUndefined();
    expect(view.number.value).toBe('0');
  });

  it('is empty, with a way to Route Safety, when no route is saved', () => {
    const none = data({ hasRoute: false, href: null, systems: [] });
    const view = buildView('routeSafety', { routeSafety: ok(none) }, ctx());
    expect(stateOf(view)).toBe('empty');
    expect(view.to).toBe('/travel/route');
    expect(view.emptyLinkLabel).toBe('overview.widgets.routeSafety.emptyLink');
  });

  it('is loading before the first read and failed, keeping the last value, when a read fails', () => {
    expect(
      stateOf(
        buildView(
          'routeSafety',
          { routeSafety: { data: null, error: false, loading: true } },
          ctx()
        )
      )
    ).toBe('loading');
    const failed = buildView(
      'routeSafety',
      { routeSafety: { data: data(), error: true, loading: false } },
      ctx()
    );
    const resolved = resolveWidget(failed.status);
    expect(resolved.state).toBe('failed');
    expect(resolved.showLastGood).toBe(true);
    expect(failed.number.value).toBe('1');
  });
});

describe('hauling', () => {
  const data = (over: Partial<HaulingWidgetData> = {}): HaulingWidgetData => ({
    hasScan: true,
    routes: [
      { from: 'Jita', to: 'Amarr', item: 'Tritanium', profit: 48_000_000, jumps: 12 },
      { from: 'Jita', to: 'Dodixie', item: 'Pyerite', profit: 30_000_000, jumps: null },
    ],
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('reads from its own feed and links to the Hauling tab', () => {
    expect(feedsOf('hauling')).toEqual(['hauling']);
    expect(buildView('hauling', { hauling: ok(data()) }, ctx()).to).toBe('/market/hauling');
  });

  it('leads with the best profit and tables each route with jumps and ISK per jump', () => {
    const view = buildView('hauling', { hauling: ok(data()) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('48M');
    expect(view.number.secondary?.text).toContain('Tritanium');
    expect(view.number.secondary?.text).toContain('Jita → Amarr');
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['Jita → Amarr', '48M', '12', '4M'],
      ['Jita → Dodixie', '30M', '—', '—'],
    ]);
    expect(view.fetchedAt).toEqual(new Date(NOW));
  });

  it('is empty before any scan has run', () => {
    const none = data({ hasScan: false, routes: [], fetchedAt: null });
    expect(stateOf(buildView('hauling', { hauling: ok(none) }, ctx()))).toBe('empty');
  });

  it('is loading before the first read and failed, keeping the last value, when a read fails', () => {
    expect(
      stateOf(buildView('hauling', { hauling: { data: null, error: false, loading: true } }, ctx()))
    ).toBe('loading');
    const failed = buildView(
      'hauling',
      { hauling: { data: data(), error: true, loading: false } },
      ctx()
    );
    const resolved = resolveWidget(failed.status);
    expect(resolved.state).toBe('failed');
    expect(resolved.showLastGood).toBe(true);
    expect(failed.number.value).toBe('48M');
  });
});

describe('belowMarket', () => {
  const data = (over: Partial<BelowMarketWidgetData> = {}): BelowMarketWidgetData => ({
    hasView: true,
    count: 5,
    contracts: [
      { contractId: 1, item: 'Rifter', more: 12, profit: 42_000_000, jumps: 3 },
      { contractId: 2, item: 'Tengu', more: 0, profit: 18_600_000, jumps: null },
    ],
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('reads from its own feed and links to Item search with Below market on', () => {
    expect(feedsOf('belowMarket')).toEqual(['belowMarket']);
    expect(buildView('belowMarket', { belowMarket: ok(data()) }, ctx()).to).toBe(
      '/contracts/search/items?items.belowMarket=1'
    );
  });

  it('counts the contracts, names the best profit and its jumps, and tables each', () => {
    const view = buildView('belowMarket', { belowMarket: ok(data()) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('5');
    expect(view.number.secondary).toEqual({
      text: 'overview.widgets.data.belowMarket.secondary{"profit":"42M","jumps":"3"}',
      tone: 'good',
    });
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['overview.widgets.data.belowMarket.item{"item":"Rifter","count":12}', '+42M', '3'],
      ['Tengu', '+18.6M', '—'],
    ]);
    expect(view.fetchedAt).toEqual(new Date(NOW));
  });

  it('drops the jumps from the headline when the best contract has none', () => {
    const [, tengu] = data().contracts;
    const view = buildView('belowMarket', { belowMarket: ok(data({ contracts: [tengu] })) }, ctx());
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.data.belowMarket.secondaryNoJumps{"profit":"18.6M"}'
    );
  });

  it('is empty before Below market has run, or when nothing was below market', () => {
    const none = data({ hasView: false, count: 0, contracts: [], fetchedAt: null });
    expect(stateOf(buildView('belowMarket', { belowMarket: ok(none) }, ctx()))).toBe('empty');
    const nothing = data({ count: 0, contracts: [] });
    expect(stateOf(buildView('belowMarket', { belowMarket: ok(nothing) }, ctx()))).toBe('empty');
  });
});

describe('jumpTimers', () => {
  const HOUR = 3_600_000;
  const data = (over: Partial<JumpTimersWidgetData> = {}): JumpTimersWidgetData => ({
    clone: { state: 'read', endsAt: NOW + 3 * HOUR },
    fatigue: { state: 'read', endsAt: NOW + 5 * HOUR },
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('reads from its own feed and links to the Clones page', () => {
    expect(feedsOf('jumpTimers')).toEqual(['jumpTimers']);
    expect(buildView('jumpTimers', { jumpTimers: ok(data()) }, ctx()).to).toBe('/clones');
  });

  it('leads with the longest timer and tables each', () => {
    const view = buildView('jumpTimers', { jumpTimers: ok(data()) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('5h 0m');
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['overview.widgets.jumpTimers.clone', '3h 0m'],
      ['overview.widgets.jumpTimers.fatigue', '5h 0m'],
    ]);
    expect(view.grantEndpoints).toBeUndefined();
  });

  it('says Ready, and No fatigue, when nothing is running or a timer has passed', () => {
    const idle = data({
      clone: { state: 'read', endsAt: null },
      fatigue: { state: 'read', endsAt: NOW - 1 },
    });
    const view = buildView('jumpTimers', { jumpTimers: ok(idle) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('overview.widgets.jumpTimers.ready');
    expect(view.table?.rows.map((r) => r.cells[1])).toEqual([
      'overview.widgets.jumpTimers.ready',
      'overview.widgets.jumpTimers.none',
    ]);
  });

  it('keeps the readable timer and asks only for the missing endpoint on a partial grant', () => {
    const partial = data({ fatigue: { state: 'needsPermission' } });
    const view = buildView('jumpTimers', { jumpTimers: ok(partial) }, ctx());
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('3h 0m');
    expect(view.grantEndpoints).toEqual(['getCharacterFatigue']);
  });

  it('needs permission when neither timer can be read', () => {
    const none = data({
      clone: { state: 'needsPermission' },
      fatigue: { state: 'needsPermission' },
      fetchedAt: null,
    });
    expect(stateOf(buildView('jumpTimers', { jumpTimers: ok(none) }, ctx()))).toBe(
      'needsPermission'
    );
  });

  it('is loading before the first read and failed, keeping the last value, when a read fails', () => {
    expect(
      stateOf(
        buildView('jumpTimers', { jumpTimers: { data: null, error: false, loading: true } }, ctx())
      )
    ).toBe('loading');
    const failed = buildView(
      'jumpTimers',
      { jumpTimers: { data: data(), error: true, loading: false } },
      ctx()
    );
    const resolved = resolveWidget(failed.status);
    expect(resolved.state).toBe('failed');
    expect(resolved.showLastGood).toBe(true);
    expect(failed.number.value).toBe('5h 0m');
  });
});

describe('kills', () => {
  const entry = (
    id: number,
    agoMs: number,
    over: Partial<KillsWidgetData['entries'][number]> = {}
  ): KillsWidgetData['entries'][number] => ({
    characterId: 91,
    killmailId: id,
    side: 'kill',
    timeMs: NOW - agoMs,
    systemId: 30000142,
    shipTypeId: 626,
    value: 5_000_000,
    ...over,
  });
  const data = (over: Partial<KillsWidgetData> = {}): KillsWidgetData => ({
    entries: [
      entry(1, HOUR),
      entry(2, 2 * DAY, { side: 'loss', value: null }),
      entry(3, 10 * DAY),
      entry(4, 40 * DAY),
      entry(5, HOUR, { characterId: 92 }),
    ],
    reach: { 91: null, 92: null },
    failedIds: [],
    trackedIds: [91, 92],
    systemNames: new Map([[30000142, 'Jita']]),
    typeNames: new Map([[626, 'Vexor']]),
    fetchedAt: new Date(NOW),
    ...over,
  });

  it('reads from its own feed', () => {
    expect(feedsOf('kills')).toEqual(['kills']);
  });

  it('counts the header Character’s kills and losses in the range, with the split beneath', () => {
    const view = buildView('kills', { kills: ok(data()) }, ctx({ range: 7 }));
    expect(stateOf(view)).toBe('ok');
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toContain('"kills":1');
    expect(view.number.secondary?.text).toContain('"losses":1');
    expect(buildView('kills', { kills: ok(data()) }, ctx({ range: 30 })).number.value).toBe('3');
  });

  it('counts every Character when scoped to all, and a shared killmail once', () => {
    const shared = data({
      entries: [
        entry(1, HOUR),
        entry(1, HOUR, { characterId: 92 }),
        entry(2, HOUR, { characterId: 92 }),
      ],
    });
    const view = buildView('kills', { kills: ok(shared) }, ctx({ scopeAll: true }));
    expect(view.number.value).toBe('2');
  });

  it('tables ship, system, value and a kill or loss word, newest first, naming what it can', () => {
    const view = buildView('kills', { kills: ok(data()) }, ctx({ range: 7 }));
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      [
        'Vexor',
        'Jita',
        { text: '5M', iskAmount: 5_000_000 },
        { text: 'overview.widgets.kills.side.kill', tone: 'good' },
      ],
      ['Vexor', 'Jita', '—', { text: 'overview.widgets.kills.side.loss', tone: 'bad' }],
    ]);
  });

  it('charts kills and losses per day over the range, with a text summary', () => {
    const view = buildView('kills', { kills: ok(data()) }, ctx({ range: 7 }));
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.values).toHaveLength(7);
    expect(view.chart.values.reduce((a, b) => a + b, 0)).toBe(2);
    expect(view.chart.summary).toContain('"count":2');
    expect(view.chart.xStart).toContain('"count":7');
  });

  it('says how far back zKillboard’s page reaches when it falls short of the range', () => {
    const view = buildView(
      'kills',
      { kills: ok(data({ reach: { 91: NOW - 20 * DAY, 92: null } })) },
      ctx({ range: 90 })
    );
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.note).toContain('noteCovered');
    expect(view.chart.note).toContain('"covered":20');
  });

  it('says so when some Characters could not be read in All scope', () => {
    const view = buildView(
      'kills',
      { kills: ok(data({ failedIds: [92] })) },
      ctx({ scopeAll: true, range: 7 })
    );
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.note).toContain('overview.widgets.chart.kills.unread');
  });

  it('is empty with no kills in range, and when the header Character is not tracked', () => {
    expect(stateOf(buildView('kills', { kills: ok(data({ entries: [] })) }, ctx()))).toBe('empty');
    expect(stateOf(buildView('kills', { kills: ok(data()) }, ctx({ activeCharacterId: 7 })))).toBe(
      'empty'
    );
  });

  it('is failed when the header Character could not be read, and when the load fails after a good one', () => {
    const unread = buildView('kills', { kills: ok(data({ failedIds: [91] })) }, ctx());
    expect(resolveWidget(unread.status).state).toBe('failed');
    const failed = buildView(
      'kills',
      { kills: { data: data(), error: true, loading: false } },
      ctx({ range: 7 })
    );
    const resolved = resolveWidget(failed.status);
    expect(resolved.state).toBe('failed');
    expect(resolved.showLastGood).toBe(true);
    expect(failed.number.value).toBe('2');
  });

  it('is loading before the first read', () => {
    expect(
      stateOf(buildView('kills', { kills: { data: null, error: false, loading: true } }, ctx()))
    ).toBe('loading');
  });
});

describe('omega coverage', () => {
  const B = 1e9;
  const data = (over: Partial<OmegaWidgetData> = {}): OmegaWidgetData => ({
    rows: [
      { characterId: 91, date: iso(NOW - DAY), amount: 1.2 * B },
      { characterId: 91, date: iso(NOW - DAY), amount: 5 * B, internal: true },
      { characterId: 91, date: iso(NOW - DAY), amount: -3 * B, refKey: 'plex_bought' },
      { characterId: 92, date: iso(NOW - DAY), amount: 9 * B },
    ],
    coverage: {
      91: { since: NOW - 40 * DAY, gaps: [] },
      92: { since: NOW - 40 * DAY, gaps: [] },
    },
    journalFetchedAt: { 91: NOW - HOUR, 92: NOW - HOUR },
    plex: { price: 2_000_000, fetchedAt: NOW - 2 * HOUR },
    truncated: false,
    skippedCount: 0,
    loadedIds: [91, 92],
    ...over,
  });
  const build = (d: OmegaWidgetData, over: Partial<BuildContext> = {}) =>
    buildView('omega', { omega: ok(d) }, ctx(over));

  it('reads its own feed and sums across Characters', () => {
    expect(feedsOf('omega')).toEqual(['omega']);
  });

  it('covers whole accounts: net 1.2B against 1.0B per account', () => {
    const view = build(data());
    expect(view.number.value).toContain('data.omega.covers{"count":1}');
    expect(view.number.secondary?.text).toContain('data.omega.next{"days":30,"amount":"800M"}');
  });

  it('counts net across every Character when scoped to all, leaving out transfers and PLEX', () => {
    const view = build(data(), { scopeAll: true });
    expect(view.number.value).toContain('"count":10');
  });

  it('the PLEX per 30 days setting changes the cost and the count', () => {
    expect(build(data(), { plexPer30Days: 250 }).number.value).toContain('"count":2');
    expect(build(data(), { plexPer30Days: 1000 }).number.value).toContain('coversNone');
  });

  it('draws one bar per period and a labelled line per account up to one above the tallest', () => {
    const view = build(data());
    if (view.chart?.kind !== 'omega') throw new Error('omega');
    expect(view.chart.bars).toHaveLength(2);
    expect(view.chart.bars[0]!.partial).toBe(true);
    expect(view.chart.bars[1]!.partial).toBe(false);
    expect(view.chart.lines.map((l) => l.value)).toEqual([1 * B, 2 * B]);
    expect(view.chart.bars[1]!.tip.rows.map((r) => r.label)).toContain(
      'overview.widgets.chart.omega.tip.covers'
    );
  });

  it('scales the account cost and the bars to the widget range', () => {
    const week = build(data(), { range: 7 });
    expect(week.number.secondary?.text).toContain('"days":7');
    if (week.chart?.kind !== 'omega') throw new Error('omega');
    // one account is 7/30 of 1B = 233.3M: 1.2B covers 5, lines step above it.
    expect(week.number.value).toContain('"count":5');
    expect(week.chart.lines[0]!.value).toBeCloseTo((1 * B * 7) / 30);
    expect(week.chart.bars.length).toBeGreaterThan(2);
    const quarter = build(data(), { range: 90 });
    expect(quarter.number.value).toContain('coversNone');
    expect(quarter.number.secondary?.text).toContain('"days":90');
    if (quarter.chart?.kind !== 'omega') throw new Error('omega');
    expect(quarter.chart.lines[0]!.value).toBe(3 * B);
  });

  it('says why when PLEX has no price, with no count and no chart', () => {
    const view = build(data({ plex: null }));
    expect(view.number.value).toBe('overview.widgets.data.omega.noPrice');
    expect(view.chart).toBeUndefined();
    expect(stateOf(view)).toBe('ok');
  });

  it('is empty with no journal lines, and needs permission for a Character it did not load', () => {
    expect(stateOf(build(data({ rows: [], coverage: {} })))).toBe('empty');
    expect(stateOf(build(data({ loadedIds: [92] })))).toBe('needsPermission');
  });

  it('dates the view by the older of the PLEX price and the in-scope journals', () => {
    expect(build(data()).fetchedAt?.getTime()).toBe(NOW - 2 * HOUR);
    const old = data({ journalFetchedAt: { 91: NOW - HOUR, 92: NOW - 9 * HOUR } });
    expect(build(old).fetchedAt?.getTime()).toBe(NOW - 2 * HOUR);
    expect(build(old, { scopeAll: true }).fetchedAt?.getTime()).toBe(NOW - 9 * HOUR);
  });

  it('keeps read ages and PLEX spent out of the number, chart and table text', () => {
    const view = build(data());
    const text = [view.number.notes?.join(' '), view.chart?.note, view.table?.footer].join(' ');
    expect(text).not.toContain('.ages');
    expect(text).not.toContain('plexSpent');
  });

  it('a gap in the newest period marks it partial', () => {
    const gap: [number, number] = [NOW - 10 * DAY, NOW - 5 * DAY];
    const view = build(data({ coverage: { 91: { since: NOW - 40 * DAY, gaps: [gap] } } }));
    if (view.chart?.kind !== 'omega') throw new Error('omega');
    expect(view.chart.bars.map((b) => b.partial)).toEqual([true, true]);
  });

  it('states the shortfall when net is zero or negative', () => {
    const view = build(data({ rows: [{ characterId: 91, date: iso(NOW - DAY), amount: -1 * B }] }));
    expect(view.number.value).toContain('coversNone');
    expect(view.number.unit).toContain('data.omega.shortBy{"days":30,"amount":"2B"}');
  });

  it('steps the reference lines when there are many accounts', () => {
    const view = build(data({ rows: [{ characterId: 91, date: iso(NOW - DAY), amount: 40 * B }] }));
    if (view.chart?.kind !== 'omega') throw new Error('omega');
    expect(view.chart.lines.length).toBeLessThanOrEqual(6);
    expect(view.chart.lines[0]!.value).toBe(7 * B);
  });
});

describe('profit on Trading', () => {
  const fill = (id: number, over: Record<string, unknown>) => ({
    transaction_id: id,
    date: iso(NOW - 2 * DAY),
    location_id: 1,
    type_id: 34,
    unit_price: 100,
    quantity: 10,
    client_id: 1,
    is_buy: true,
    journal_ref_id: id,
    is_personal: true,
    ...over,
  });
  const tax = (txn: number, amount: number) => ({
    id: 900 + txn,
    date: iso(NOW - DAY),
    ref_type: 'transaction_tax',
    description: '',
    amount,
    context_id: txn,
    context_id_type: 'market_transaction_id',
  });
  const fee = {
    id: 777,
    date: iso(NOW - DAY),
    ref_type: 'brokers_fee',
    description: '',
    amount: -50,
  };
  // The alt (92) bought; the main (91) sold.
  const data = (): TradingProfitWidgetData => ({
    characters: [
      {
        characterId: 91,
        name: 'Main',
        transactions: [
          fill(1, { is_buy: false, date: iso(NOW - DAY), unit_price: 150, quantity: 4 }),
        ],
        journal: [tax(1, -20), fee],
      },
      { characterId: 92, name: 'Alt', transactions: [fill(1, {})], journal: [] },
    ],
    names: new Map([[34, 'Tritanium']]),
    truncated: false,
    skippedCount: 0,
    fetchedAt: new Date(NOW),
  });
  const build = (over: Partial<BuildContext> = {}) =>
    buildView('profit', { tradingProfit: ok(data()) }, ctx({ profitSource: 'trading', ...over }));

  it('reads only the trading feed', () => {
    expect(feedsOf('profit', { profitSource: 'trading' })).toEqual(['tradingProfit']);
  });

  it('says its own empty line', () => {
    const none = buildView(
      'profit',
      { tradingProfit: ok({ ...data(), characters: [{ ...data().characters[1]! }] }) },
      ctx({ profitSource: 'trading', scopeAll: true })
    );
    expect(stateOf(none)).toBe('empty');
    expect(none.emptyMessage).toBe('overview.widgets.profit.trading.empty');
  });

  it("pools every Character's buys under All characters, and leaves the header Character's sale unmatched", () => {
    const all = build({ scopeAll: true });
    // 4 x 150 - 4 x 100 - 20 tax.
    expect(all.number?.iskAmount).toBe(180);
    expect(all.number?.notes?.join(' ')).toContain('tradingProfit.matched{"matched":1,"count":1}');
    expect(all.number?.notes?.join(' ')).toContain('"amount":"50"');
    const single = build();
    expect(single.number?.iskAmount).toBeUndefined();
    expect(single.number?.value).toBe('—');
  });

  it('lists margin per item in the table', () => {
    const view = build({ scopeAll: true });
    expect(view.table?.rows.map((r) => r.cells[0])).toEqual(['Tritanium']);
  });

  it('asks for the wallet grant when the header Character has no wallet read', () => {
    expect(stateOf(build({ activeCharacterId: 93 }))).toBe('needsPermission');
  });
});

describe('profit sources', () => {
  it('reads only the feeds its Source needs; absent is Builds', () => {
    expect(feedsOf('profit', { profitSource: 'builds' })).toEqual(['profit']);
    expect(feedsOf('profit', {})).toEqual(['profit']);
    expect(feedsOf('profit', { profitSource: 'both' })).toEqual(['profit', 'tradingProfit']);
    expect(feedsFor([{ kind: 'profit', profitSource: 'trading' }, 'lp']).sort()).toEqual([
      'lp',
      'tradingProfit',
    ]);
  });

  it('asks for the wallet endpoints on Trading and Both, and none on Builds', () => {
    const wallet = ['getCharacterWalletJournal', 'getCharacterWalletTransactions'];
    expect(endpointsOf('profit', { profitSource: 'builds' })).toEqual([]);
    expect(endpointsOf('profit', {})).toEqual([]);
    expect(endpointsOf('profit', { profitSource: 'trading' })).toEqual(wallet);
    expect(endpointsOf('profit', { profitSource: 'both' })).toEqual(wallet);
    // A kind without settings-driven reads keeps its catalogue endpoints.
    expect(endpointsOf('lp', {})).toEqual(['getCharacterLoyaltyPoints']);
  });

  it('sums across Characters on Trading only: Builds and Both read the header Character', () => {
    expect(kindSumsAcrossCharacters('profit', { profitSource: 'trading' })).toBe(true);
    expect(kindSumsAcrossCharacters('profit', { profitSource: 'both' })).toBe(false);
    expect(kindSumsAcrossCharacters('profit', { profitSource: 'builds' })).toBe(false);
    expect(kindSumsAcrossCharacters('profit')).toBe(false);
  });
});

describe('profit on Both', () => {
  const run = (id: string, ago: number, profit: number, productTypeID = 1) => ({
    runId: id,
    productTypeID,
    quantity: 1,
    loggedAt: NOW - ago,
    profit,
    status: 'closed' as const,
  });
  const fill = (id: number, ago: number, over: Record<string, unknown> = {}) => ({
    transaction_id: id,
    date: iso(NOW - ago),
    location_id: 1,
    type_id: 34,
    unit_price: 100,
    quantity: 1,
    client_id: 1,
    is_buy: true,
    journal_ref_id: id,
    is_personal: true,
    ...over,
  });
  // Bought at 100, sold at 150, 10 tax: a margin of 40 per sale.
  const trading = (sales: number[]): TradingProfitWidgetData => ({
    characters: [
      {
        characterId: 91,
        name: 'Main',
        transactions: [
          ...sales.map((ago, i) => fill(100 + i, ago + DAY)),
          ...sales.map((ago, i) => fill(200 + i, ago, { is_buy: false, unit_price: 150 })),
        ],
        journal: sales.map((ago, i) => ({
          id: 300 + i,
          date: iso(NOW - ago),
          ref_type: 'transaction_tax',
          description: '',
          amount: -10,
          context_id: 200 + i,
          context_id_type: 'market_transaction_id',
        })),
      },
    ],
    names: new Map([[34, 'Tritanium']]),
    truncated: false,
    skippedCount: 0,
    fetchedAt: new Date(NOW),
  });
  const builds = (runs: ReturnType<typeof run>[]) => ok({ runs, names: new Map([[1, 'Raven']]) });
  const both = (feeds: Feeds, over: Partial<BuildContext> = {}) =>
    buildView('profit', feeds, ctx({ profitSource: 'both', range: 7, ...over }));

  it('adds builds and trades into one figure', () => {
    const view = both({
      profit: builds([run('a', DAY, 300)]),
      tradingProfit: ok(trading([2 * DAY])),
    });
    expect(view.number.iskAmount).toBe(340);
    expect(view.number.unit).toBe('overview.isk');
  });

  it('compares with the window before when either source had one', () => {
    const view = both({
      profit: builds([run('a', DAY, 300), run('b', 10 * DAY, 100)]),
      tradingProfit: ok(trading([2 * DAY, 9 * DAY])),
    });
    // 340 now against 140 before.
    expect(view.number.secondary?.text).toContain('"delta":"+200"');
    // No trades before: they count 0 there, so 340 against 100.
    const noTradesBefore = both({
      profit: builds([run('a', DAY, 300), run('b', 10 * DAY, 100)]),
      tradingProfit: ok(trading([2 * DAY])),
    });
    expect(noTradesBefore.number.secondary?.text).toContain('"delta":"+240"');
    const nothingBefore = both({
      profit: builds([run('a', DAY, 300)]),
      tradingProfit: ok(trading([2 * DAY])),
    });
    expect(nothingBefore.number.secondary).toBeUndefined();
  });

  it('tags each table row with its source, sorted by profit', () => {
    const view = both({
      profit: builds([run('a', DAY, 30)]),
      tradingProfit: ok(trading([2 * DAY])),
    });
    expect(view.table!.rows.map((r) => [r.cells[0], r.cells[2]])).toEqual([
      ['Tritanium', 'overview.widgets.profit.source.trading'],
      ['Raven', 'overview.widgets.profit.source.builds'],
    ]);
    // The same toned signed cell Trading draws, whichever source.
    expect(view.table!.rows.map((r) => r.cells[1])).toEqual([
      { text: '+40', tone: 'good' },
      { text: '+30', tone: 'good' },
    ]);
  });

  it('draws builds and trades as two lines on the same days', () => {
    const view = both({
      profit: builds([run('a', DAY / 2, 300)]),
      tradingProfit: ok(trading([2.5 * DAY])),
    });
    if (view.chart?.kind !== 'lines') throw new Error('lines');
    expect(view.chart.series.map((s) => s.key)).toEqual(['builds', 'trading']);
    expect(view.chart.series[0]!.values).toEqual([0, 0, 0, 0, 0, 0, 300]);
    expect(view.chart.series[1]!.values).toEqual([0, 0, 0, 0, 40, 0, 0]);
    expect(view.chart.tips).toHaveLength(7);
    // The legend reads the latest day; the axis names the span.
    expect(view.chart.series.map((s) => s.end)).toEqual(['+300', '0']);
    expect(view.chart.xStart).toBe('overview.widgets.chart.daysAgo{"count":7}');
    expect(view.chart.xEnd).toBe('overview.widgets.chart.today');
  });

  it('keeps showing the builds, with a grant, when the header Character has no wallet read', () => {
    const view = both(
      { profit: builds([run('a', DAY, 300)]), tradingProfit: ok(trading([2 * DAY])) },
      { activeCharacterId: 93 }
    );
    expect(stateOf(view)).toBe('ok');
    expect(view.number.iskAmount).toBe(300);
    expect(view.grantEndpoints).toEqual([
      'getCharacterWalletJournal',
      'getCharacterWalletTransactions',
    ]);
  });

  it('narrows trades to the header Character even when the widget asks for All characters', () => {
    const scoped = scopePresentation('profit', 'all', { profitSource: 'both' });
    expect(scoped).toMatchObject({ scopeAll: false, fallbackNote: true });
  });

  it('waits for the trading read, and says when it failed', () => {
    const waiting = both({
      profit: builds([run('a', DAY, 300)]),
      tradingProfit: { data: null, error: false, loading: true },
    });
    expect(stateOf(waiting)).toBe('loading');
    const failed = both({
      profit: builds([run('a', DAY, 300)]),
      tradingProfit: { data: null, error: true, loading: false },
    });
    expect(stateOf(failed)).toBe('ok');
    expect(failed.number.iskAmount).toBe(300);
    expect(failed.number.notes).toEqual(['overview.widgets.profit.tradingFailed']);
  });

  it('is empty only when neither source has anything', () => {
    const view = both({ profit: builds([]), tradingProfit: ok(trading([])) });
    expect(stateOf(view)).toBe('empty');
    expect(view.emptyMessage).toBe('overview.widgets.profit.emptyBoth');
  });
});
