/**
 * The Sovereignty widget (issue #4775): the corp's skyhooks, one row each, by
 * when their theft window opens, and the adapters that lend raid windows and
 * hub reagent run-outs to Due soon. Same contract as `models.ts`: pure,
 * derived at render time.
 *
 * ESI sends no skyhook silo capacity, so a skyhook shows its unsecured stock
 * (what a raid takes) as ISK, or as units when a reagent has no price; never a
 * percent and never "0 ISK". Sov hubs are not rows: their reagent bay is a fuel
 * clock in Due soon.
 */
import {
  severityForRemaining,
  worstSeverity,
  type DeadlineSeverity,
} from '@/engine/character/severity';
import type { BoardHubFuelSource, BoardSovereigntySource } from '@/engine/corp/board';
import {
  hubReagentsRunOutMs,
  raidHeadline,
  raidState,
  type RaidState,
  type RaidWindow,
} from '@/engine/corp/sovereignty';
import { formatCountdown } from '@/lib/duration';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import { CORP_CACHE_WINDOW_MS } from '../../data/corpCards';
import type { BoardDeadline } from '../nextDeadline';
import { blank, corpUnreadable, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import { hbarsFromRows } from './chartBuilders';
import type { CorpSovereigntyFeed, CorpSovereigntyRow } from './corpFeeds';
import type { ChartModel } from '../charts/types';
import type { RowDetailModel, TableCell, TableRowModel } from './types';
import type { Translate } from '@/lib/translate';

const W = 'overview.widgets.corpSovereignty';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Gantt horizon. */
const CHART_AHEAD_MS = 48 * HOUR_MS;
/** The Number counts skyhooks open now or opening within this. */
const HEADLINE_HORIZON_MS = 6 * HOUR_MS;
/** ESI's skyhook state enum; anything else reads as unknown. */
const SKYHOOK_STATES = new Set([
  'Unspecified',
  'ShieldVulnerable',
  'ArmorReinforced',
  'ArmorVulnerable',
  'HullReinforced',
  'HullVulnerable',
]);

/** A price that is missing, zero or negative is no price: show units, never 0 ISK. */
function priceOf(feed: CorpSovereigntyFeed, typeId: number): number | undefined {
  const price = feed.prices.get(typeId);
  return price !== undefined && price > 0 ? price : undefined;
}

function systemOf(feed: CorpSovereigntyFeed, row: CorpSovereigntyRow): string {
  return (row.systemId === null ? undefined : feed.systemNames.get(row.systemId)) ?? UNKNOWN;
}

/** A skyhook by its planet ("X-7OMU IV"), else its system. */
function nameOf(feed: CorpSovereigntyFeed, row: CorpSovereigntyRow): string {
  return row.planetName ?? systemOf(feed, row);
}

function windowOf(row: CorpSovereigntyRow): RaidWindow | null {
  return row.windowStartMs === null || row.windowEndMs === null
    ? null
    : { startMs: row.windowStartMs, endMs: row.windowEndMs };
}

/** Null when the window was not read: unknown, never safe. */
function stateOf(row: CorpSovereigntyRow, now: number): RaidState | null {
  const window = windowOf(row);
  return window === null ? null : raidState(window, now, row.kind);
}

/** Due soon's view of the windows: every one ESI sent both ends of. */
export function toBoardSovereignty(feed: CorpSovereigntyFeed): BoardSovereigntySource[] {
  return feed.rows.flatMap((row) => {
    const window = windowOf(row);
    return window === null
      ? []
      : [{ id: row.key, name: nameOf(feed, row), kind: row.kind, ...window }];
  });
}

/** Due soon's view of the hubs: when each reagent bay runs out. */
export function toBoardHubFuel(feed: CorpSovereigntyFeed): BoardHubFuelSource[] {
  return feed.rows.flatMap((row) => {
    const runsOutMs = row.hubBay === null ? null : hubReagentsRunOutMs(row.hubBay);
    return runsOutMs === null ? [] : [{ id: row.key, name: systemOf(feed, row), runsOutMs }];
  });
}

/** A countdown that never claims more precision than the hour-old read behind it. */
function untilText(t: Translate, remainingMs: number): string {
  return remainingMs < CORP_CACHE_WINDOW_MS
    ? t('corp.board.underCacheWindow')
    : formatCountdown(remainingMs / 1000);
}

/** An open window is critical; one opening within a day, a warning. */
function tone(row: CorpSovereigntyRow, now: number): DeadlineSeverity {
  const state = stateOf(row, now);
  if (state === 'open' || state === 'overtime') return 'critical';
  return state === 'upcoming' && (row.windowStartMs ?? Infinity) - now < DAY_MS
    ? 'warning'
    : 'clear';
}

/** Soonest first: open windows, then upcoming; closed or unknown last. */
function sortKey(row: CorpSovereigntyRow, now: number): number {
  const state = stateOf(row, now);
  if (state === null || state === 'closed') return Infinity;
  return Math.max(row.windowStartMs ?? now, now);
}

/** The unsecured stock: units, and ISK only when every reagent in it has a price. */
function atRisk(
  feed: CorpSovereigntyFeed,
  row: CorpSovereigntyRow
): { units: number; isk: number | null } | null {
  if (row.reagents === null) return null;
  let units = 0;
  let isk: number | null = 0;
  for (const r of row.reagents) {
    if (r.unsecured <= 0) continue;
    units += r.unsecured;
    const price = priceOf(feed, r.typeId);
    isk = isk === null || price === undefined ? null : isk + r.unsecured * price;
  }
  return { units, isk };
}

function reagentLine(
  feed: CorpSovereigntyFeed,
  row: CorpSovereigntyRow,
  pick: 'secured' | 'unsecured'
): string {
  if (row.reagents === null) return UNKNOWN;
  const held = row.reagents.filter((r) => r[pick] > 0);
  if (held.length === 0) return formatNumber(0);
  return held
    .map((r) => {
      const name = feed.typeNames.get(r.typeId) ?? UNKNOWN;
      const price = priceOf(feed, r.typeId);
      const units = `${formatNumber(r[pick])} ${name}`;
      return price === undefined ? units : `${units} · ${formatIsk(r[pick] * price)} ISK`;
    })
    .join(', ');
}

export const corpSovereignty: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpSovereignty;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  const skyhooks = data.rows
    .filter((row) => row.kind === 'skyhook')
    .sort(
      (a, b) =>
        sortKey(a, now) - sortKey(b, now) ||
        nameOf(data, a).localeCompare(nameOf(data, b)) ||
        a.key.localeCompare(b.key)
    );
  const headline = raidHeadline(
    skyhooks.flatMap((row) => windowOf(row) ?? []),
    now,
    HEADLINE_HORIZON_MS
  );

  const windowText = (row: CorpSovereigntyRow): string => {
    const window = windowOf(row);
    switch (stateOf(row, now)) {
      case null:
        return UNKNOWN;
      case 'open':
        return t(`${W}.windowOpen`, { duration: untilText(t, window!.endMs - now) });
      case 'upcoming':
        return t(`${W}.windowIn`, { duration: untilText(t, window!.startMs - now) });
      case 'overtime':
        return t(`${W}.windowOvertime`);
      case 'closed':
        return t(`${W}.windowClosed`);
    }
  };
  const riskCell = (row: CorpSovereigntyRow): TableCell => {
    const risk = atRisk(data, row);
    if (risk === null) return UNKNOWN;
    if (risk.units === 0) return t(`${W}.nothingAtRisk`);
    return risk.isk === null
      ? t(`${W}.units`, { count: risk.units })
      : { text: formatIskCompact(risk.isk), iskAmount: risk.isk };
  };
  const windowFact = (row: CorpSovereigntyRow): string => {
    const window = windowOf(row);
    return window !== null && stateOf(row, now) === 'upcoming'
      ? t(`${W}.fact.windowUpcoming`, {
          opens: untilText(t, window.startMs - now),
          closes: untilText(t, window.endMs - now),
        })
      : windowText(row);
  };
  const detailOf = (row: CorpSovereigntyRow): RowDetailModel => {
    const name = row.systemId === null ? undefined : data.systemNames.get(row.systemId);
    return {
      title: nameOf(data, row),
      facts: [
        { label: t(`${W}.fact.window`), value: windowFact(row) },
        {
          label: t(`${W}.fact.state`),
          value:
            row.state === null || !SKYHOOK_STATES.has(row.state)
              ? UNKNOWN
              : t(`${W}.state.${row.state}`),
        },
        { label: t(`${W}.fact.unsecured`), value: reagentLine(data, row, 'unsecured') },
        { label: t(`${W}.fact.secured`), value: reagentLine(data, row, 'secured') },
      ],
      place:
        row.systemId === null || name === undefined
          ? undefined
          : { systemId: row.systemId, name, jumps: data.jumps.get(row.systemId) },
    };
  };

  const soonest = skyhooks.find((row) => {
    const state = stateOf(row, now);
    return state === 'open' || state === 'upcoming';
  });
  let secondary: { text: string } | undefined;
  if (soonest !== undefined && headline.untilMs !== null) {
    const subject = nameOf(data, soonest);
    const risk = atRisk(data, soonest);
    secondary = {
      text: [
        headline.untilMs === 0
          ? t(`${W}.nextOpenNow`, { subject })
          : t(`${W}.nextOpensIn`, { subject, duration: untilText(t, headline.untilMs) }),
        ...(risk?.isk != null && risk.isk > 0
          ? [t(`${W}.atRisk`, { isk: formatIskCompact(risk.isk) })]
          : []),
      ].join(', '),
    };
  }

  // Next wants clocks still ahead: an open window is underway, and a dry hub is
  // already overdue in Due soon.
  const nextWindow = skyhooks.find((row) => stateOf(row, now) === 'upcoming');
  const nextRunOut = toBoardHubFuel(data)
    .filter((hub) => hub.runsOutMs > now)
    .sort((a, b) => a.runsOutMs - b.runsOutMs)[0];
  const deadlines: BoardDeadline[] = [];
  if (nextWindow?.windowStartMs != null) {
    deadlines.push({
      at: nextWindow.windowStartMs,
      note: t(`${W}.deadline`, { subject: nameOf(data, nextWindow) }),
      severity: tone(nextWindow, now),
    });
  }
  if (nextRunOut !== undefined) {
    deadlines.push({
      at: nextRunOut.runsOutMs,
      note: t(`${W}.hubDeadline`, { subject: nextRunOut.name }),
      severity: severityForRemaining(nextRunOut.runsOutMs - now),
    });
  }

  return {
    ...blank(null, statusOf(feed, { isEmpty: skyhooks.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(headline.count),
      unit: t(`${W}.unit`, { count: headline.count }),
      secondary,
      tone: worstSeverity(skyhooks.map((row) => tone(row, now))),
    },
    rows: skyhooks.map((row) => ({
      key: row.key,
      title: nameOf(data, row),
      value: windowText(row),
      tone: tone(row, now),
    })),
    table: {
      columns: [
        { key: 'skyhook', label: t(`${W}.col.skyhook`), priority: 0, nameFloor: true },
        { key: 'window', label: t(`${W}.col.window`), align: 'end', priority: 2 },
        { key: 'unsecured', label: t(`${W}.col.unsecured`), align: 'end', priority: 1 },
      ],
      rows: skyhooks.map((row): TableRowModel => ({
        key: row.key,
        cells: [nameOf(data, row), windowText(row), riskCell(row)],
        tone: tone(row, now),
        detail: detailOf(row),
      })),
    },
    chart: raidChart(t, data, skyhooks, now, windowText),
    deadlines,
    summary: t(`${W}.summary`, { count: headline.count, total: skyhooks.length }),
  };
};

/** Theft windows that open or are open in the next 48 hours; undefined with none. */
function raidChart(
  t: Translate,
  data: CorpSovereigntyFeed,
  skyhooks: readonly CorpSovereigntyRow[],
  now: number,
  windowText: (row: CorpSovereigntyRow) => string
): ChartModel | undefined {
  const ahead = skyhooks.flatMap((row) => {
    const window = windowOf(row);
    return window !== null && window.endMs > now && window.startMs < now + CHART_AHEAD_MS
      ? [{ row, window }]
      : [];
  });
  const bars = ahead.map(({ row, window }) => ({
    window,
    key: row.key,
    label: nameOf(data, row),
    text: windowText(row),
    color: tone(row, now) === 'clear' ? ('accent' as const) : ('warning' as const),
  }));
  const note = t(`${W}.chartNote`);
  const fallback = hbarsFromRows(
    t,
    bars.map(({ window, ...bar }) => {
      // Sooner = longer bar: the share of CHART_AHEAD_MS already elapsed.
      const share = 1 - Math.max(0, window.startMs - now) / CHART_AHEAD_MS;
      return { ...bar, value: share, share };
    }),
    note
  );
  if (!fallback) return undefined;
  return {
    kind: 'gantt',
    rows: bars.map(({ window, ...bar }) => ({
      ...bar,
      startMs: window.startMs,
      endMs: window.endMs,
    })),
    axis: { from: now, to: now + CHART_AHEAD_MS, now },
    labels: {
      from: '',
      now: t(`${W}.chartNow`),
      to: t(`${W}.chartTo`, { duration: formatCountdown(CHART_AHEAD_MS / 1000) }),
    },
    note,
    summary: t(`${W}.chartSummary`, {
      note,
      windows: bars.map((bar) => `${bar.label} ${bar.text}`).join('; '),
    }),
    fallback,
  };
}
