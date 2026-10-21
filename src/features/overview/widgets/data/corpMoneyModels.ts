/**
 * Corp money builders: Corp wallet, Cash flow and Income by source.
 * Same contract as `models.ts`: pure, derived at render time.
 */
import { DAY_MS } from '@/lib/age';
import { dailyOutgoings, runwayDays, VITALS_WINDOW_DAYS } from '@/engine/corp/vitals';
import { humanizeRefType } from '@/features/character/format';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { fractionBar, signedCell } from './cellKit';
import { hbarsFromRows } from './chartBuilders';
import { backwardBucketSums } from './chartSeries';
import { rollingTitles, signTone } from './chartTips';
import type { CorpJournalLine, CorpWalletFeed } from './corpFeeds';
import type { BarsChartModel } from '../charts/types';
import type { FeedState, KindView, NumberModel, TableCell, TableModel, Translate } from './types';

const TO = '/corp/wallet';
const W = 'overview.widgets';
const RUNWAY_WARNING_DAYS = 30;

/** The view for a feed that is loading, failed, or unreadable; null when there is data to build from. */
function notReady(
  feed: FeedState<CorpWalletFeed> | undefined,
  t: Translate
): { data: CorpWalletFeed } | { view: KindView } {
  const data = feed?.data ?? null;
  if (!data) return { view: blank(TO, statusOf(feed)) };
  if (!data.readable) {
    return {
      view: {
        ...blank(
          TO,
          statusOf(feed, { needsPermission: data.needsReauth, isEmpty: !data.needsReauth })
        ),
        emptyMessage: t('overview.board.corpUnreadable'),
      },
    };
  }
  return { data };
}

function withFeed(view: KindView, data: CorpWalletFeed): KindView {
  return { ...view, fetchedAt: data.fetchedAt, fromCache: data.fromCache };
}

/** `part` of `whole` as a whole percent with its bar; the text states the share, the bar only draws it. */
function shareCell(part: number, whole: number): TableCell {
  const share = fractionBar(Math.max(0, part), whole);
  return share === undefined ? UNKNOWN : { text: `${Math.round(share * 100)}%`, bar: share };
}

const iskCell = (value: number): TableCell => ({ text: formatIskCompact(value), iskAmount: value });

/** A column that only runs one way: ISK in is good, ISK out is bad; zero is plain. */
function directionCell(value: number, tone: 'good' | 'bad'): TableCell {
  const text = formatIskCompact(value);
  return value > 0 ? { text, tone } : text;
}

/** How many whole days back the journal's oldest line reaches; 0 for none. */
function coveredDays(journal: readonly CorpJournalLine[], now: number): number {
  if (journal.length === 0) return 0;
  const oldest = Math.min(...journal.map((entry) => entry.atMs));
  return Math.max(1, Math.ceil((now - oldest) / DAY_MS));
}

const inRange = (journal: readonly CorpJournalLine[], now: number, range: number) =>
  journal.filter((entry) => entry.atMs > now - range * DAY_MS && entry.atMs <= now);

// --- Corp wallet ------------------------------------------------------------------

export const corpWallet: Builder = (feeds, { t }) => {
  const ready = notReady(feeds.corpWallet, t);
  if ('view' in ready) return ready.view;
  const { data } = ready;
  const K = `${W}.corpWallet`;
  const total = data.divisions.reduce((sum, d) => sum + d.balance, 0);
  const named = data.divisions.map((d) => ({
    ...d,
    label: d.name ?? t('corp.vitals.division', { division: d.division }),
  }));
  const biggest = [...named].sort((a, b) => b.balance - a.balance)[0];
  const biggestShare = biggest ? fractionBar(biggest.balance, total) : undefined;

  const number: NumberModel = {
    value: formatIskCompact(total),
    iskAmount: total,
    tone: 'clear',
    secondary:
      biggest && biggestShare !== undefined && named.length > 1
        ? {
            text: t(`${K}.biggest`, {
              name: biggest.label,
              share: Math.round(biggestShare * 100),
            }),
          }
        : undefined,
  };
  const table: TableModel = {
    columns: [
      { key: 'division', label: t(`${K}.col.division`), priority: 0 },
      { key: 'balance', label: t(`${K}.col.balance`), align: 'end', priority: 1 },
      { key: 'share', label: t(`${K}.col.share`), align: 'end', priority: 2 },
    ],
    rows: named.map((d) => ({
      key: String(d.division),
      to: `${TO}?division=${d.division}`,
      cells: [d.label, iskCell(d.balance), shareCell(d.balance, total)],
    })),
  };
  return withFeed(
    {
      ...blank(TO, statusOf(feeds.corpWallet, { isEmpty: data.divisions.length === 0 })),
      number,
      table,
      summary: t(`${K}.summary`, { isk: formatIskCompact(total), count: named.length }),
      chart:
        total > 0
          ? (hbarsFromRows(
              t,
              named
                .filter((d) => d.balance > 0)
                .map((d) => {
                  const share = d.balance / total;
                  return {
                    key: String(d.division),
                    label: d.label,
                    value: d.balance,
                    share,
                    text: `${Math.round(share * 100)}%`,
                  };
                }),
              t(`${K}.chartNote`)
            ) ?? undefined)
          : undefined,
    },
    data
  );
};

// --- Cash flow --------------------------------------------------------------------

function cashFlowChart(
  t: Translate,
  income: number[],
  spending: number[],
  note: string,
  summary: string
): BarsChartModel | undefined {
  const C = `${W}.chart`;
  if (Math.max(...income, ...spending) <= 0) return undefined;
  const nets = income.map((v, i) => v - spending[i]!);
  const titles = rollingTitles(t, 'day', nets.length);
  return {
    kind: 'bars',
    values: nets,
    gains: true,
    barLabels: nets.map((v) => (v === 0 ? '' : formatIskCompactSigned(v))),
    max: t(`${C}.max`, { value: formatIskCompact(Math.max(0, ...nets)) }),
    xStart: t(`${C}.daysAgo`, { count: nets.length }),
    xEnd: t(`${C}.today`),
    tips: nets.map((net, i) => ({
      title: titles[i]!,
      rows: [
        { label: t(`${C}.tip.income`), value: formatIskCompact(income[i]!), tone: 'good' },
        { label: t(`${C}.tip.spending`), value: formatIskCompact(spending[i]!), tone: 'bad' },
        { label: t(`${C}.tip.net`), value: formatIskCompactSigned(net), tone: signTone(net) },
      ],
    })),
    note,
    summary,
  };
}

export const corpCashFlow: Builder = (feeds, { t, now, range }) => {
  const ready = notReady(feeds.corpWallet, t);
  if ('view' in ready) return ready.view;
  const { data } = ready;
  const K = `${W}.corpCashFlow`;
  const base = blank(TO, statusOf(feeds.corpWallet));

  // Unknown is not zero: the balances read fine but the journal did not.
  if (data.journal === null) {
    return withFeed(
      {
        ...base,
        number: { value: UNKNOWN, tone: 'clear', notes: [t(`${K}.unavailable`)] },
        summary: t(`${K}.unavailable`),
      },
      data
    );
  }

  const lines = inRange(data.journal, now, range);
  const covered = coveredDays(data.journal, now);
  const days = Math.max(1, Math.min(range, covered));
  const bucket = (value: (line: CorpJournalLine) => number) =>
    backwardBucketSums(lines, (l) => l.atMs, value, now, DAY_MS, days);
  const income = bucket((l) => Math.max(0, l.amount));
  const spending = bucket((l) => Math.max(0, -l.amount));
  const net = lines.reduce((sum, l) => sum + l.amount, 0);
  const totalIn = income.reduce((a, b) => a + b, 0);
  const totalOut = spending.reduce((a, b) => a + b, 0);

  // The runway rides the vitals window and the master wallet's own balance, as the old rail did.
  const balance = data.divisions.find((d) => d.division === data.journalDivision)?.balance ?? 0;
  const runway = runwayDays(balance, dailyOutgoings(data.journal, now));
  const runwayDaysWhole = runway === null ? null : Math.floor(runway);

  const notes: string[] = [];
  if (range !== VITALS_WINDOW_DAYS) {
    notes.push(t(`${K}.runwayWindow`, { count: VITALS_WINDOW_DAYS }));
  }
  const coverage = range > covered ? t(`${K}.coverage`, { count: covered }) : undefined;
  if (coverage) notes.push(coverage);

  const titles = rollingTitles(t, 'day', days);
  const table: TableModel = {
    columns: [
      { key: 'day', label: t(`${K}.col.day`), priority: 0 },
      { key: 'net', label: t(`${K}.col.net`), align: 'end', priority: 1 },
      { key: 'in', label: t(`${K}.col.in`), align: 'end', priority: 2 },
      { key: 'out', label: t(`${K}.col.out`), align: 'end', priority: 3 },
    ],
    rows: income
      .map((_, i) => ({
        key: String(days - 1 - i),
        cells: [
          titles[i]!,
          signedCell(formatIskCompactSigned(income[i]! - spending[i]!), income[i]! - spending[i]!),
          directionCell(income[i]!, 'good'),
          directionCell(spending[i]!, 'bad'),
        ] as TableCell[],
      }))
      .reverse(),
    footer: coverage,
  };
  const summary = t(`${K}.summary`, {
    isk: formatIskCompactSigned(net),
    count: days,
    income: formatIskCompact(totalIn),
    spending: formatIskCompact(totalOut),
  });

  return withFeed(
    {
      ...blank(TO, statusOf(feeds.corpWallet, { isEmpty: lines.length === 0 })),
      number: {
        value: formatIskCompactSigned(net),
        iskAmount: net,
        unit: t(`${K}.unit`),
        tone: 'clear',
        secondary:
          runwayDaysWhole === null
            ? { text: t(`${K}.runwayUnknown`) }
            : {
                text: t(`${K}.runway`, { count: runwayDaysWhole }),
                tone: runwayDaysWhole < RUNWAY_WARNING_DAYS ? 'caution' : undefined,
              },
        notes: notes.length > 0 ? notes : undefined,
      },
      table,
      summary,
      chart: cashFlowChart(t, income, spending, t(`${K}.chartNote`), summary),
    },
    data
  );
};

// --- Income by source -------------------------------------------------------------

/** The common corp income types have their own words; any other is the raw type, de-snaked. */
function sourceLabel(t: Translate, refType: string): string {
  return t(`${W}.corpIncome.refType.${refType}`, { defaultValue: humanizeRefType(refType) });
}

export const corpIncome: Builder = (feeds, { t, now, range }) => {
  const ready = notReady(feeds.corpWallet, t);
  if ('view' in ready) return ready.view;
  const { data } = ready;
  const K = `${W}.corpIncome`;

  if (data.journal === null) {
    return withFeed(
      {
        ...blank(TO, statusOf(feeds.corpWallet)),
        number: { value: UNKNOWN, tone: 'clear', notes: [t(`${K}.unavailable`)] },
        summary: t(`${K}.unavailable`),
      },
      data
    );
  }

  const bySource = new Map<string, number>();
  for (const line of inRange(data.journal, now, range)) {
    if (line.amount > 0)
      bySource.set(line.refType, (bySource.get(line.refType) ?? 0) + line.amount);
  }
  const sources = [...bySource.entries()]
    .map(([refType, amount]) => ({ refType, amount, label: sourceLabel(t, refType) }))
    .sort((a, b) => b.amount - a.amount || a.refType.localeCompare(b.refType));
  const total = sources.reduce((sum, s) => sum + s.amount, 0);
  const top = sources[0];

  const covered = coveredDays(data.journal, now);
  const coverage = range > covered ? t(`${K}.coverage`, { count: covered }) : undefined;

  const table: TableModel = {
    columns: [
      { key: 'source', label: t(`${K}.col.source`), priority: 0 },
      { key: 'amount', label: t(`${K}.col.amount`), align: 'end', priority: 1 },
      { key: 'share', label: t(`${K}.col.share`), align: 'end', priority: 2 },
    ],
    rows: sources.map((s) => ({
      key: s.refType,
      cells: [s.label, iskCell(s.amount), shareCell(s.amount, total)],
    })),
    footer: coverage,
  };

  return withFeed(
    {
      ...blank(TO, statusOf(feeds.corpWallet, { isEmpty: sources.length === 0 })),
      number: {
        value: formatIskCompact(total),
        iskAmount: total,
        unit: t(`${K}.unit`),
        tone: 'clear',
        secondary: top
          ? {
              text: t(`${K}.top`, {
                name: top.label,
                share: Math.round((top.amount / total) * 100),
              }),
            }
          : undefined,
        notes: coverage ? [coverage] : undefined,
      },
      table,
      summary: t(`${K}.summary`, {
        isk: formatIskCompact(total),
        days: range,
        count: sources.length,
      }),
      chart:
        hbarsFromRows(
          t,
          sources.map((s) => {
            const share = s.amount / total;
            return {
              key: s.refType,
              label: s.label,
              value: s.amount,
              share,
              text: `${Math.round(share * 100)}%`,
            };
          }),
          t(`${K}.chartNote`)
        ) ?? undefined,
    },
    data
  );
};
