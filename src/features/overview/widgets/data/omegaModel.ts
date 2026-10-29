/**
 * The Omega coverage widget's builder (issue #3920): net income per window (7, 30 or 90 days)
 * against what one Omega account costs in ISK, as a count of accounts the
 * income could keep on Omega, plus a bar per period with a line at each
 * account's cost. Pure, like every builder.
 *
 * Facts only: it never asks how many accounts the pilot has. The plan (PLEX
 * per 30 days) is the pilot's own setting, so it is worded as theirs.
 */
import {
  accountCost,
  accountsCovered,
  DEFAULT_PLEX_PER_30_DAYS,
  drawnLevels,
  nextAccountGap,
  omegaPeriods,
  referenceLevels,
  type OmegaPeriod,
} from '@/engine/omegaCoverage';
import { formatIskCompact } from '@/lib/isk';
import type { ChartModel } from '../charts/types';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { dayTitle } from './chartTips';
import type { KindView, TableRowModel } from './types';
import type { Translate } from '@/lib/translate';
import { utcDay } from '@/engine/localDay';

const D = 'overview.widgets.data.omega';
const C = 'overview.widgets.chart.omega';
const W = 'overview.widgets.omega';
/** The Wallet page, where the journal behind the figure lives. */
const OMEGA_PATH = '/wallet';

/** The day a period's last moment falls on. */
const lastDay = (p: OmegaPeriod) => utcDay(p.endMs - 1);

function periodTitle(t: Translate, p: OmegaPeriod): string {
  return t(`${W}.period`, { from: dayTitle(utcDay(p.startMs)), to: dayTitle(lastDay(p)) });
}

export const omega: Builder = (
  feeds,
  { t, now, range, scopeAll, activeCharacterId, plexPer30Days = DEFAULT_PLEX_PER_30_DAYS }
) => {
  const feed = feeds.omega;
  const data = feed?.data ?? null;
  if (!data) return blank(OMEGA_PATH, statusOf(feed));

  const everyone = scopeAll || activeCharacterId === null;
  const heldHere = everyone
    ? data.loadedIds.length > 0
    : data.loadedIds.includes(activeCharacterId);
  const ids = everyone ? data.loadedIds : [activeCharacterId];
  const rows = everyone ? data.rows : data.rows.filter((r) => r.characterId === activeCharacterId);
  const periods = omegaPeriods(
    rows,
    now,
    ids.flatMap((id) => data.coverage[id] ?? []),
    range
  );
  const latest = periods[periods.length - 1];

  const journalReads = ids.flatMap((id) => data.journalFetchedAt[id] ?? []);
  const journalAt = journalReads.length === 0 ? null : Math.min(...journalReads);
  const ages = [journalAt, data.plex?.fetchedAt].flatMap((at) => at ?? []);
  const base: KindView = {
    ...blank(
      OMEGA_PATH,
      statusOf(feed, { needsPermission: !heldHere, isEmpty: heldHere && latest === undefined })
    ),
    fetchedAt: ages.length === 0 ? null : new Date(Math.min(...ages)),
  };
  if (!heldHere || latest === undefined) return base;

  const net = latest.net;
  const cost = accountCost(data.plex?.price ?? null, plexPer30Days, range);
  const days = { days: range };
  const caveats = [
    periods.some((p) => p.partial) ? t(`${C}.partial`) : '',
    data.truncated ? t(`${C}.truncated`) : '',
    everyone && data.skippedCount > 0 ? t(`${C}.skipped`, { count: data.skippedCount }) : '',
  ].filter(Boolean);
  // The Number view's plain lines; the chart carries the same in its note.
  const numberNotes = [
    latest.partial ? t(`${C}.partialLatest`, days) : '',
    data.truncated ? t(`${C}.truncated`) : '',
  ].filter(Boolean);

  if (cost === null) {
    const summary = t(`${C}.summaryNoPrice`, { ...days, net: formatIskCompact(net) });
    return {
      ...base,
      number: {
        value: t(`${D}.noPrice`),
        unit: t(`${D}.netOnly`, { ...days, net: formatIskCompact(net) }),
        secondary: { text: t(`${D}.noPriceHint`) },
        notes: numberNotes,
        tone: 'clear',
      },
      summary,
      table: {
        columns: tableColumns(t, range),
        rows: periodRows(t, periods, null),
      },
    };
  }

  const covered = accountsCovered(net, cost);
  const gap = nextAccountGap(net, cost);
  const levels = drawnLevels(
    referenceLevels(
      periods.map((p) => p.net),
      cost
    )
  );
  const summary = t(`${C}.summary`, {
    ...days,
    count: covered,
    net: formatIskCompact(net),
    cost: formatIskCompact(cost),
    periods: periods
      .map((p) => t(`${C}.summaryPeriod`, { date: lastDay(p), net: formatIskCompact(p.net) }))
      .join(', '),
  });
  const chart: ChartModel = {
    kind: 'omega',
    summary,
    note: [t(`${C}.note`, days), ...caveats].join(' '),
    bars: periods.map((p) => {
      const n = accountsCovered(p.net, cost);
      return {
        key: String(p.startMs),
        label: t(p.partial ? `${C}.tickPartial` : `${C}.tick`, { date: dayTitle(lastDay(p)) }),
        net: p.net,
        partial: p.partial,
        tip: {
          title: periodTitle(t, p),
          rows: [
            {
              label: t(`${C}.tip.net`),
              value: formatIskCompact(p.net),
              tone: p.net > 0 ? 'good' : p.net < 0 ? 'bad' : undefined,
            },
            { label: t(`${C}.tip.covers`), value: t(`${C}.tip.accounts`, { count: n }) },
            ...(p.plexSpent > 0
              ? [{ label: t(`${C}.tip.plex`), value: formatIskCompact(p.plexSpent) }]
              : []),
            ...(p.partial ? [{ label: t(`${C}.tip.history`), value: t(`${C}.tip.partial`) }] : []),
          ],
        },
      };
    }),
    lines: levels.map((level) => ({
      value: level * cost,
      label: t(`${C}.line`, { count: level }),
    })),
  };
  return {
    ...base,
    number: {
      value: t(covered === 0 ? `${D}.coversNone` : `${D}.covers`, { count: covered }),
      ...(net > 0
        ? {
            unit: t(`${D}.figures`, {
              ...days,
              net: formatIskCompact(net),
              cost: formatIskCompact(cost),
            }),
            secondary: { text: t(`${D}.next`, { ...days, amount: formatIskCompact(gap) }) },
          }
        : {
            unit: t(`${D}.shortBy`, { ...days, amount: formatIskCompact(gap) }),
            secondary: {
              text: t(`${D}.figures`, {
                ...days,
                net: formatIskCompact(net),
                cost: formatIskCompact(cost),
              }),
            },
          }),
      notes: numberNotes,
      tone: 'clear',
    },
    table: {
      columns: tableColumns(t, range),
      rows: periodRows(t, periods, cost),
      footer: t(`${D}.plexPrice`, {
        price: formatIskCompact(data.plex!.price),
        plex: plexPer30Days,
      }),
    },
    summary,
    chart,
  };
};

function tableColumns(t: Translate, range: number) {
  return [
    { key: 'period', label: t(`${W}.col.period`, { days: range }), priority: 0 },
    { key: 'net', label: t(`${W}.col.net`), align: 'end' as const, priority: 1 },
    { key: 'accounts', label: t(`${W}.col.accounts`), align: 'end' as const, priority: 2 },
  ];
}

/** Newest first: the table reads from the headline's period down. */
function periodRows(t: Translate, periods: OmegaPeriod[], cost: number | null): TableRowModel[] {
  return [...periods].reverse().map((p) => ({
    key: String(p.startMs),
    cells: [
      p.partial ? t(`${W}.periodPartial`, { title: periodTitle(t, p) }) : periodTitle(t, p),
      { text: formatIskCompact(p.net), iskAmount: p.net },
      cost === null ? UNKNOWN : String(accountsCovered(p.net, cost)),
    ],
  }));
}
