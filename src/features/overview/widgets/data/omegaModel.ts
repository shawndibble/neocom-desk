/**
 * The Omega coverage widget's builder (issue #3920): net income per 30 days
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
  nextAccountGap,
  omegaPeriods,
  referenceLevels,
  type OmegaPeriod,
} from '@/engine/omegaCoverage';
import { formatAge } from '@/lib/age';
import { formatIskCompact } from '@/lib/isk';
import type { ChartModel } from '../charts/types';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { dayTitle } from './chartTips';
import type { KindView, TableRowModel, Translate } from './types';

const D = 'overview.widgets.data.omega';
const C = 'overview.widgets.chart.omega';
const W = 'overview.widgets.omega';
/** The Wallet page, where the journal behind the figure lives. */
const OMEGA_PATH = '/wallet';
const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The last whole day a period holds. */
const lastDay = (p: OmegaPeriod) => isoDay(p.endMs - DAY_MS);

function periodTitle(p: OmegaPeriod): string {
  return `${dayTitle(isoDay(p.startMs))} – ${dayTitle(lastDay(p))}`;
}

function ageLine(t: Translate, now: number, journalAt: Date | null, plexAt: number | null) {
  const age = (at: number | null) => (at === null ? UNKNOWN : formatAge(Math.max(0, now - at), t));
  return t(`${C}.ages`, { plex: age(plexAt), journal: age(journalAt?.getTime() ?? null) });
}

export const omega: Builder = (
  feeds,
  { t, now, scopeAll, activeCharacterId, plexPer30Days = DEFAULT_PLEX_PER_30_DAYS }
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
  const starts = ids.flatMap((id) => data.historyStart[id] ?? []);
  const periods = omegaPeriods(rows, now, starts.length === 0 ? null : Math.min(...starts));
  const latest = periods[periods.length - 1];

  const ages = [data.journalFetchedAt?.getTime(), data.plex?.fetchedAt].flatMap((at) => at ?? []);
  const base: KindView = {
    ...blank(
      OMEGA_PATH,
      statusOf(feed, { needsPermission: !heldHere, isEmpty: heldHere && latest === undefined })
    ),
    fetchedAt: ages.length === 0 ? null : new Date(Math.min(...ages)),
  };
  if (!heldHere || latest === undefined) return base;

  const net = latest.net;
  const cost = accountCost(data.plex?.price ?? null, plexPer30Days);
  const spent = t(`${D}.plexSpent`, { amount: formatIskCompact(latest.plexSpent) });
  const notes = [
    cost === null ? '' : t(`${C}.note`),
    periods[0]!.partial ? t(`${C}.partial`) : '',
    ageLine(t, now, data.journalFetchedAt, data.plex?.fetchedAt ?? null),
    data.truncated ? t(`${C}.truncated`) : '',
    everyone && data.skippedCount > 0 ? t(`${C}.skipped`, { count: data.skippedCount }) : '',
  ].filter(Boolean);

  if (cost === null) {
    const summary = t(`${C}.summaryNoPrice`, { net: formatIskCompact(net) });
    return {
      ...base,
      number: {
        value: t(`${D}.noPrice`),
        unit: t(`${D}.netOnly`, { net: formatIskCompact(net) }),
        secondary: { text: t(`${D}.noPriceHint`) },
        tone: 'clear',
      },
      summary,
      table: { columns: tableColumns(t), rows: periodRows(t, periods, null), footer: spent },
    };
  }

  const covered = accountsCovered(net, cost);
  const gap = nextAccountGap(net, cost);
  const levels = referenceLevels(
    periods.map((p) => p.net),
    cost
  );
  const summary = t(`${C}.summary`, {
    count: covered,
    net: formatIskCompact(net),
    cost: formatIskCompact(cost),
    periods: periods.map((p) => `${lastDay(p)} ${formatIskCompact(p.net)}`).join(', '),
  });
  const chart: ChartModel = {
    kind: 'omega',
    summary,
    note: notes.join(' '),
    bars: periods.map((p) => {
      const n = accountsCovered(p.net, cost);
      return {
        key: String(p.startMs),
        label: t(p.partial ? `${C}.tickPartial` : `${C}.tick`, { date: dayTitle(lastDay(p)) }),
        net: p.net,
        partial: p.partial,
        tip: {
          title: periodTitle(p),
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
      unit: t(`${D}.figures`, { net: formatIskCompact(net), cost: formatIskCompact(cost) }),
      secondary: { text: t(`${D}.next`, { amount: formatIskCompact(gap) }) },
      tone: 'clear',
    },
    table: {
      columns: tableColumns(t),
      rows: periodRows(t, periods, cost),
      footer: `${spent} ${t(`${D}.plexPrice`, { price: formatIskCompact(data.plex!.price), plex: plexPer30Days })}`,
    },
    summary,
    chart,
  };
};

function tableColumns(t: Translate) {
  return [
    { key: 'period', label: t(`${W}.col.period`), priority: 0 },
    { key: 'net', label: t(`${W}.col.net`), align: 'end' as const, priority: 1 },
    { key: 'accounts', label: t(`${W}.col.accounts`), align: 'end' as const, priority: 2 },
  ];
}

/** Newest first: the table reads from the headline's period down. */
function periodRows(t: Translate, periods: OmegaPeriod[], cost: number | null): TableRowModel[] {
  return [...periods].reverse().map((p) => ({
    key: String(p.startMs),
    cells: [
      p.partial ? t(`${W}.periodPartial`, { title: periodTitle(p) }) : periodTitle(p),
      { text: formatIskCompact(p.net), iskAmount: p.net },
      cost === null ? UNKNOWN : String(accountsCovered(p.net, cost)),
    ],
  }));
}
