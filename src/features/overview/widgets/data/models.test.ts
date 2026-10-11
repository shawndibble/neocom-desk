import { describe, expect, it } from 'vitest';
import { resolveWidget } from '../state';
import { buildView, feedsFor, KIND_FEEDS, kindSumsAcrossCharacters } from './models';
import type { BuildContext, FeedState, Feeds } from './types';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;

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
      ['journal', 'skills', 'spExtras', 'wallet'].sort()
    );
  });

  it('is empty for kinds with no data yet', () => {
    expect(feedsFor(['survey', 'routeSafety', 'unknownKindFromANewerBuild'])).toEqual([]);
  });

  it('gives every built kind at least one feed', () => {
    for (const [kind, feeds] of Object.entries(KIND_FEEDS)) {
      expect(feeds.length, kind).toBeGreaterThan(0);
    }
  });
});

describe('kindSumsAcrossCharacters', () => {
  it('is true for the account-wide kinds and orders', () => {
    for (const kind of [
      'miningTax',
      'stock',
      'priceWatch',
      'incursions',
      'orders',
      'netWorth',
      'miningYield',
    ]) {
      expect(kindSumsAcrossCharacters(kind), kind).toBe(true);
    }
  });

  it('is false for per-Character kinds', () => {
    for (const kind of ['wallet', 'training', 'mail', 'industry']) {
      expect(kindSumsAcrossCharacters(kind), kind).toBe(false);
    }
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
    expect(resolveWidget(view.status)).toEqual({ state: 'failed', showLastGood: false });
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
    expect(resolveWidget(view.status)).toEqual({ state: 'failed', showLastGood: true });
    expect(view.number.iskAmount).toBe(5_000_000);
  });

  it('needs permission when the read says the grant lapsed', () => {
    const feeds: Feeds = { wallet: ok({ result: null, needsReauth: true }) };
    expect(stateOf(buildView('wallet', feeds, ctx()))).toBe('needsPermission');
  });
});

describe('placeholder kinds', () => {
  it('render empty, never loading, for kinds the catalogue marks coming soon', () => {
    for (const kind of ['survey', 'routeSafety', 'hauling', 'kills', 'jumpTimers']) {
      expect(stateOf(buildView(kind, {}, ctx())), kind).toBe('empty');
    }
  });

  it('render empty for a kind this build does not know', () => {
    expect(stateOf(buildView('fromTheFuture', {}, ctx()))).toBe('empty');
  });
});

describe('wallet', () => {
  it('shows the balance as an ISK figure with a one-row list', () => {
    const feeds: Feeds = {
      wallet: ok({
        result: {
          data: 3_820_000_000,
          fetchedAt: new Date(NOW - HOUR),
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
    expect(view.rows).toHaveLength(1);
    expect(view.fetchedAt?.getTime()).toBe(NOW - HOUR);
    expect(view.fromCache).toBe(true);
    expect(view.to).toBe('/wallet');
  });
});

describe('mail', () => {
  const mail = (unread: number) =>
    ok({
      unread,
      recent: [{ mailId: 1, subject: 'Hello', from: 'Aria', atMs: NOW - 2 * HOUR }],
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

describe('contracts', () => {
  const data = (over: Partial<{ inProgress: number; dueSoon: number; overdue: number }>) => ({
    summary: { inProgress: 2, dueSoon: 0, overdue: 0, soonest: null, ...over },
    route: null,
    needsReauth: false,
    fetchedAt: new Date(NOW),
  });

  it('shows the in-progress count and lists the three counts', () => {
    const view = buildView('contracts', { contracts: ok(data({})) as never }, ctx());
    expect(view.number.value).toBe('2');
    expect(view.rows.map((r) => r.value)).toEqual(['2', '0', '0']);
    expect(view.deadlines).toEqual([]);
  });

  it('turns critical and offers a deadline when a courier is overdue', () => {
    const soonest = { kind: 'courier', atMs: NOW + HOUR, overdue: true };
    const feeds = {
      contracts: ok({
        ...data({ overdue: 1 }),
        summary: { inProgress: 2, dueSoon: 0, overdue: 1, soonest },
      }),
    };
    const view = buildView('contracts', feeds as never, ctx());
    expect(view.number.tone).toBe('critical');
    expect(view.deadlines).toHaveLength(1);
    expect(view.deadlines[0].at).toBe(NOW + HOUR);
    expect(view.deadlines[0].severity).toBe('critical');
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
    expect(view.number.note).toBe('overview.board.stockNotCounted');
    expect(view.rows).toEqual([]);
  });

  it('gives a kind with no page of its own no Open link target', () => {
    expect(buildView('survey', {}, ctx()).to).toBeNull();
  });

  it('counts out and low, listing the markets that need restocking', () => {
    const summary = { out: 2, low: 1, readyToList: 0, costToFill: 0 };
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
    expect(view.number.value).toBe('2');
    expect(view.number.tone).toBe('warning');
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].title).toBe('Jita IV');
    expect(view.rows[0].to).toBe('/market/stock/a');
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
    const finish = NOW + 4 * HOUR;
    const queue = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 5,
        start_date: new Date(NOW - HOUR).toISOString(),
        finish_date: new Date(finish).toISOString(),
      },
    ];
    const view = buildView('training', { skills: skills(queue) as never }, ctx());
    expect(view.number.value).toBe('4h 0m');
    expect(view.number.note).toContain('Gunnery');
    expect(view.deadlines).toEqual([
      { at: finish, note: 'overview.board.nextSkill', severity: 'clear', to: '/skills/plans' },
    ]);
    expect(view.rows[0].title).toContain('Gunnery');
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

describe('comingUp', () => {
  it('is empty with nothing committed ahead', () => {
    const feeds: Feeds = {
      calendar: ok({ events: [], needsReauth: false, fetchedAt: new Date(NOW) }),
    };
    expect(stateOf(buildView('comingUp', feeds, ctx()))).toBe('empty');
  });

  it('counts down to the next accepted event', () => {
    const events = [
      {
        event_id: 1,
        title: 'Fleet op',
        event_date: new Date(NOW + 2 * HOUR).toISOString(),
        event_response: 'accepted',
        importance: 1,
      },
    ];
    const feeds: Feeds = {
      calendar: ok({ events, needsReauth: false, fetchedAt: new Date(NOW) }) as never,
    };
    const view = buildView('comingUp', feeds, ctx());
    expect(view.number.value).toBe('2h 0m');
    expect(view.number.note).toBe('Fleet op');
    expect(view.deadlines[0].at).toBe(NOW + 2 * HOUR);
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
    expect(view.rows.map((r) => r.title)).toEqual(['Tritanium', 'PLEX']);
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
        end_date: new Date(NOW - HOUR).toISOString(),
        status: 'active',
      },
      {
        job_id: 2,
        activity_id: 1,
        runs: 1,
        blueprint_type_id: 5,
        product_type_id: 6,
        end_date: new Date(NOW + 5 * HOUR).toISOString(),
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
    // Only the running job is a clock still ahead.
    expect(view.deadlines.map((d) => d.at)).toEqual([NOW + 5 * HOUR]);
  });
});
