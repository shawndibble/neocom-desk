import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/age';
import type { CorpJournalLine, CorpWalletFeed } from './corpFeeds';
import { corpCashFlow, corpIncome, corpWallet } from './corpMoneyModels';
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

  it('is empty with no divisions and unreadable without the role', () => {
    expect(corpWallet(feed({ divisions: [] }), ctx()).status.isEmpty).toBe(true);
    const view = corpWallet(feed({ readable: false, needsReauth: true, divisions: [] }), ctx());
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('is blank while the feed is missing', () => {
    expect(corpWallet({}, ctx()).status.hasData).toBe(false);
  });
});

describe('corpCashFlow', () => {
  it('nets the range, signs it, and states the runway from the vitals window', () => {
    const view = corpCashFlow(
      feed({ journal: [line(1, 500), line(2, -300), line(40, 9999), line(3, -100)] }),
      ctx(7)
    );
    expect(view.number.iskAmount).toBe(100);
    expect(view.number.value).toBe('+100');
    // Spending 400 in 30 days: 400/30 per day; balance 750 -> 56 days.
    expect(view.number.secondary?.text).toBe('overview.widgets.corpCashFlow.runway{"count":56}');
    const rows = view.table!.rows;
    expect(rows).toHaveLength(7);
    expect(rows[0]!.cells[3]).toBe('0');
    expect(view.chart).toMatchObject({ kind: 'bars', gains: true });
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
