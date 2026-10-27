import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/age';
import type { CorpJournalLine, CorpWalletFeed } from './corpFeeds';
import { corpCashFlow, corpIncome, corpWallet } from './corpMoneyModels';
import { CORP_DEFS } from './corpModels';
import type { BuildContext, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) => {
  const { defaultValue, ...rest } = options ?? {};
  if (typeof defaultValue === 'string') return `${key}|${defaultValue}`;
  return Object.keys(rest).length ? `${key}${JSON.stringify(rest)}` : key;
};
const NOW = Date.parse('2026-10-11T12:00:00Z');

const ctx = (range: 7 | 30 | 90 = 30): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range,
});

const line = (daysAgo: number, amount: number, refType = 'bounty_prizes'): CorpJournalLine => ({
  atMs: NOW - daysAgo * DAY_MS,
  amount,
  refType,
});

function feed(over: Partial<CorpWalletFeed> = {}): Feeds {
  return {
    corpWallet: {
      loading: false,
      error: false,
      data: {
        readable: true,
        needsReauth: false,
        fetchedAt: new Date(NOW),
        fromCache: true,
        divisions: [
          { division: 1, name: 'Master', balance: 750 },
          { division: 2, name: null, balance: 250 },
        ],
        journalDivision: 1,
        journal: [],
        ...over,
      },
    },
  };
}

describe('corpWallet', () => {
  it('totals the divisions, names the biggest, and links each row to its division view', () => {
    const view = corpWallet(feed(), ctx());
    expect(view.to).toBe('/corp/wallet');
    expect(view.number.iskAmount).toBe(1000);
    expect(view.number.secondary?.text).toContain('"name":"Master"');
    expect(view.number.secondary?.text).toContain('"share":75');
    expect(view.fromCache).toBe(true);
    const rows = view.table!.rows;
    expect(rows.map((r) => r.to)).toEqual(['/corp/wallet?division=1', '/corp/wallet?division=2']);
    // Unnamed division falls back like the vitals rail.
    expect(rows[1]!.cells[0]).toBe('corp.vitals.division{"division":2}');
    expect(rows[0]!.cells[1]).toMatchObject({ iskAmount: 750 });
    expect(rows[0]!.cells[2]).toMatchObject({ text: '75%', bar: 0.75 });
    expect(view.chart).toMatchObject({ kind: 'hbars' });
  });

  it('folds unnamed zero-balance divisions into one dim footer line', () => {
    const view = corpWallet(
      feed({
        divisions: [
          { division: 1, name: 'Master', balance: 750 },
          { division: 2, name: 'Ops', balance: 0 },
          { division: 4, name: null, balance: 0 },
          { division: 6, name: null, balance: 0 },
        ],
      }),
      ctx()
    );
    expect(view.table!.rows.map((r) => r.key)).toEqual(['1', '2']);
    expect(view.table!.footer).toBe('overview.widgets.corpWallet.unused{"count":2}');
  });

  it('is empty with no divisions and unreadable without the role', () => {
    expect(corpWallet(feed({ divisions: [] }), ctx()).status.isEmpty).toBe(true);
    const view = corpWallet(feed({ readable: false, needsReauth: true, divisions: [] }), ctx());
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('is empty, not row-less, when every division is unnamed and zero', () => {
    const view = corpWallet(
      feed({
        divisions: [
          { division: 1, name: null, balance: 0 },
          { division: 2, name: null, balance: 0 },
        ],
      }),
      ctx()
    );
    expect(view.status.isEmpty).toBe(true);
  });

  it('is blank while the feed is missing', () => {
    expect(corpWallet({}, ctx()).status.hasData).toBe(false);
  });
});

describe('corpCashFlow', () => {
  it('nets the range, signs it, and states the runway from the vitals window', () => {
    const view = corpCashFlow(
      feed({ journal: [line(1, 100), line(2, -300), line(40, 9999), line(3, -200)] }),
      ctx(7)
    );
    expect(view.number.iskAmount).toBe(-400);
    // Spending 500 in 30 days: 500/30 per day; balance 750 -> 45 days.
    expect(view.number.secondary?.text).toBe('overview.widgets.corpCashFlow.runway{"count":45}');
    const rows = view.table!.rows;
    expect(rows).toHaveLength(7);
    expect(rows[0]!.cells[3]).toBe('0');
    expect(view.chart).toMatchObject({ kind: 'bars', gains: true });
  });

  it('says net positive instead of a runway when the vitals window nets above zero', () => {
    const view = corpCashFlow(
      feed({ journal: [line(1, 500), line(2, -300), line(40, -9999)] }),
      ctx()
    );
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpCashFlow.netPositive{"count":30}'
    );
    expect(view.number.secondary?.tone).toBeUndefined();
    // No runway line is shown, so no note explaining its window either.
    expect(view.number.notes).toBeUndefined();
  });

  it('keeps the 30-day net-positive sentence off a range it does not describe', () => {
    // 7 days: net -400 though the 30-day window nets +200.
    const view = corpCashFlow(feed({ journal: [line(1, -400), line(20, 600)] }), ctx(7));
    expect(view.number.iskAmount).toBe(-400);
    expect(view.number.secondary).toBeUndefined();
    expect(view.number.notes).toBeUndefined();
  });

  it('is unknown, never zero, when the journal could not load', () => {
    const view = corpCashFlow(feed({ journal: null }), ctx());
    expect(view.number.value).toBe('—');
    expect(view.number.iskAmount).toBeUndefined();
    expect(view.number.notes).toContain('overview.widgets.corpCashFlow.unavailable');
    expect(view.chart).toBeUndefined();
    expect(view.status.isEmpty).toBe(false);
  });

  it('is empty when nothing moved in range', () => {
    expect(corpCashFlow(feed({ journal: [line(40, 5)] }), ctx(7)).status.isEmpty).toBe(true);
  });
});

describe('corpIncome', () => {
  const journal = [
    line(1, 600, 'bounty_prizes'),
    line(2, 200, 'bounty_prizes'),
    line(3, 200, 'weird_new_type'),
    line(4, -999, 'market_transaction'),
    line(40, 5000, 'player_donation'),
  ];

  it('groups positive in-range lines by source, biggest first, with shares', () => {
    const view = corpIncome(feed({ journal }), ctx(30));
    expect(view.number.iskAmount).toBe(1000);
    expect(view.number.secondary?.text).toContain('"share":80');
    const rows = view.table!.rows;
    expect(rows.map((r) => r.key)).toEqual(['bounty_prizes', 'weird_new_type']);
    expect(rows[0]!.cells[0]).toContain('overview.widgets.corpIncome.refType.bounty_prizes');
    expect(rows[1]!.cells[0]).toContain('Weird new type');
    expect(rows[0]!.cells[2]).toMatchObject({ text: '80%', bar: 0.8 });
    expect(view.chart).toMatchObject({ kind: 'hbars' });
  });

  it('is unknown with no journal and empty with no income', () => {
    const unknown = corpIncome(feed({ journal: null }), ctx());
    expect(unknown.number.value).toBe('—');
    expect(unknown.number.notes).toContain('overview.widgets.corpIncome.unavailable');
    expect(corpIncome(feed({ journal: [line(1, -5)] }), ctx()).status.isEmpty).toBe(true);
  });
});

describe('the corp wallet kind, by Show', () => {
  const build = CORP_DEFS.corpWallet!.build;
  const journal = [line(1, 900), line(2, -300, 'market_transaction'), line(40, 50)];

  it('draws Divisions by default, and for an unknown Show', () => {
    expect(build(feed({ journal }), ctx())).toEqual(corpWallet(feed({ journal }), ctx()));
    expect(build(feed({ journal }), { ...ctx(), show: 'balance' })).toEqual(
      corpWallet(feed({ journal }), ctx())
    );
  });

  it('draws Flow as Cash flow did and Sources as Income by source did', () => {
    expect(build(feed({ journal }), { ...ctx(7), show: 'flow' })).toEqual(
      corpCashFlow(feed({ journal }), ctx(7))
    );
    expect(build(feed({ journal }), { ...ctx(90), show: 'sources' })).toEqual(
      corpIncome(feed({ journal }), ctx(90))
    );
  });
});
