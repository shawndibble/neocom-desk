import { describe, expect, it } from 'vitest';
import { resolveWidget } from '../state';
import { buildView, feedsFor } from './models';
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
    expect(view.rows).toEqual([]);
    expect(view.table).toBeUndefined();
    expect(view.number.secondary).toBeUndefined();
    expect(view.chart).toBeUndefined();
    expect(view.fetchedAt?.getTime()).toBe(NOW - HOUR);
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
    expect(view.number.secondary?.text).toContain('Gunnery');
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
    expect(view.number.secondary?.text).toBe('Fleet op');
    expect(view.deadlines[0].at).toBe(NOW + 2 * HOUR);
  });

  it('lists unanswered events only when the widget asks for all events', () => {
    const events = [
      {
        event_id: 1,
        title: 'Mass op',
        event_date: new Date(NOW + 2 * HOUR).toISOString(),
        event_response: 'not_responded',
        importance: 1,
      },
    ];
    const feeds: Feeds = {
      calendar: ok({ events, needsReauth: false, fetchedAt: new Date(NOW) }) as never,
    };
    expect(stateOf(buildView('comingUp', feeds, ctx()))).toBe('empty');
    const all = buildView('comingUp', feeds, ctx({ calendarEvents: 'all' }));
    expect(all.number.secondary?.text).toBe('Mass op');
    expect(all.rows).toHaveLength(1);
  });

  it('links each table row to its event on the Calendar', () => {
    const events = [
      {
        event_id: 42,
        title: 'Fleet op',
        event_date: new Date(NOW + 2 * HOUR).toISOString(),
        event_response: 'accepted',
        importance: 1,
      },
    ];
    const feeds: Feeds = {
      calendar: ok({ events, needsReauth: false, fetchedAt: new Date(NOW) }) as never,
    };
    const rows = buildView('comingUp', feeds, ctx()).table?.rows ?? [];
    expect(rows.map((row) => row.to)).toEqual(['/calendar?open=42']);
    expect(rows.every((row) => row.detail === undefined)).toBe(true);
  });

  it('points an empty accepted-and-tentative widget at the menu', () => {
    const feeds: Feeds = {
      calendar: ok({ events: [], needsReauth: false, fetchedAt: new Date(NOW) }),
    };
    expect(buildView('comingUp', feeds, ctx()).emptyHint).toBe(
      'overview.widgets.comingUp.emptyHint'
    );
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
        recent: [{ mailId: 1, subject: 'Hi', from: 'Aria', atMs: NOW - 2 * HOUR }],
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
      { job_id: 1, activity_id: 1, runs: 2, end_date: new Date(NOW - HOUR).toISOString() },
      { job_id: 2, activity_id: 1, runs: 6, end_date: new Date(NOW + 5 * HOUR).toISOString() },
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
      recent: [{ mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR, unread: true }],
      inbox: [
        { mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR, unread: true },
        { mailId: 2, subject: 'Old', from: null, atMs: NOW - 5 * HOUR, unread: false },
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
      inbox: [{ mailId: 7, subject: 'New', from: 'Aria', atMs: NOW - HOUR, unread: true }],
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
      recent: [{ mailId: 1, subject: 'New', from: 'Aria', atMs: NOW - HOUR }],
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
    atMs: NOW + 3 * HOUR,
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
            rows: [courier({ state: 'outstanding', atMs: NOW + 3 * HOUR })],
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
    const soonest = courier({ atMs: NOW - HOUR, overdue: true });
    const feeds = { contracts: ok(data({ overdue: 1, soonest, items: [soonest] })) };
    const view = buildView('contracts', feeds as never, ctx());
    expect(view.number.tone).toBe('critical');
    expect(view.number.value).toBe('overview.widgets.contracts.overdue');
  });

  it('tables each contract: route, expiry, status, reward and collateral', () => {
    const hauls = courier({ contractId: 1 });
    const late = courier({ contractId: 2, atMs: NOW - HOUR, overdue: true, reward: null });
    const listing = courier({
      contractId: 3,
      kind: 'listing',
      state: 'outstanding',
      atMs: NOW + 20 * HOUR,
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
        start_date: new Date(NOW - HOUR).toISOString(),
        finish_date: new Date(NOW + 3 * HOUR).toISOString(),
        training_start_sp: 100_000,
        level_end_sp: 260_000,
      },
      {
        skill_id: 3300,
        queue_position: 1,
        finished_level: 5,
        finish_date: new Date(NOW + 5 * HOUR).toISOString(),
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
    // 160,000 SP over the 4 hours between start and finish.
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
    // 75M extractable of the 100M threshold.
    expect(view.table?.rows[3]?.cells[1]).toEqual({ text: '75%', bar: 0.75 });
    expect(view.table?.rows[3]?.cells[2]).toContain('overview.widgets.sp.ofThreshold');
    expect(view.table?.rows[4]?.cells[1]).toMatchObject({ iskAmount: 150 * 200_000 });
  });

  it('leaves the threshold and value rows out when monitoring is off and nothing is priced', () => {
    const view = buildView('sp', spFeeds({ monitoring: false }), ctx());
    expect(view.table?.rows.map((r) => r.key)).toEqual(['total', 'unallocated', 'extractable']);
  });
});

describe('comingUp table', () => {
  it('tables event, time left and response, and counts the others within a day', () => {
    const ev = (id: number, hours: number, response: string) => ({
      event_id: id,
      title: `Event ${id}`,
      event_date: new Date(NOW + hours * HOUR).toISOString(),
      event_response: response,
      importance: 1,
    });
    const events = [ev(1, 2, 'accepted'), ev(2, 5, 'tentative'), ev(3, 30, 'accepted')];
    const feeds: Feeds = {
      calendar: ok({ events, needsReauth: false, fetchedAt: new Date(NOW) }) as never,
    };
    const view = buildView('comingUp', feeds, ctx());
    expect(view.number.unit).toContain('overview.widgets.comingUp.more');
    expect(view.number.unit).toContain('"count":1');
    expect(view.table?.columns.map((c) => c.key)).toEqual(['event', 'in', 'response']);
    expect(view.table?.rows[1]?.cells).toEqual([
      'Event 2',
      '5h 0m',
      'overview.board.response.tentative',
    ]);
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

  it('keeps saved events with a sign-in note, and asks for the grant when nothing was read', () => {
    expect(resolved('comingUp', { calendar: ok({ events: [], ...saved }) })).toMatchObject({
      reauthNote: true,
    });
    expect(resolved('comingUp', { calendar: ok({ events: [], ...unsaved }) })).toMatchObject({
      state: 'needsPermission',
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
      issued: new Date(NOW - HOUR).toISOString(),
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
    issued: new Date(NOW - HOUR).toISOString(),
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
});
