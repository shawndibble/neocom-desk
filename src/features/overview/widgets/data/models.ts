/**
 * Turns a Widget Kind's raw reads into the one shape the widget shell draws
 * (`KindView`): status inputs, a headline number, list rows and the clocks it
 * offers the header chip.
 *
 * Pure: no React, Dexie or fetch. The judgements all live in the modules the
 * old board already used (`boardSeverity`, `boardSummary`, `corpCards`,
 * `incursionsBoard`, the industry/orders/calendar engines); this only picks
 * which figure leads and how each row reads. Derived at render time, never
 * inside a source's effect, so time-dependent text stays true as the clock
 * ticks and a build never invents a new object per render of a source.
 */
import { severityForRemaining, type DeadlineSeverity } from '@/engine/character/severity';
import {
  soonestCalendarDeadline,
  upcomingCommittedEvents,
  upcomingEvents,
} from '@/engine/character/calendarDeadline';
import { extractableSp, extractorCount } from '@/engine/skills/spExtraction';
import {
  buildOpenOrderRows,
  needsAttentionCount,
  notCheckedCount,
  openOrderProblemCounts,
} from '@/features/market/openOrdersModel';
import { openOrdersHref } from '@/features/market/openOrdersFilter';
import { stockBoardSeverity } from '@/features/stockTargets/stockBoard';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { DAY_MS } from '@/lib/age';
import { sortQueueEntries, selectActiveEntryFromSorted } from '@/features/overview/overviewQueue';
import { dailyWalletFromJournal } from '@/engine/netWorth/series';
import {
  comingUpEventSeverity,
  comingUpSeverity,
  contractsSeverity,
  mailSeverity,
  miningTaxSeverity,
  ordersSeverity,
  priceAlertsSeverity,
  spExtractionSeverity,
} from '../../data/boardSeverity';
import {
  comingUpSummary,
  contractsDeadlineNote,
  contractsSummary,
  mailSummary,
  miningTaxSummary,
  ordersSummary,
  priceAlertsSummary,
  spExtractionSummary,
  stockBoardSummary,
} from '../../data/boardSummary';
import type { MailBoardData, MiningTaxBoardData, PriceAlertsBoardData } from '../../data/boardData';
import {
  blank,
  count,
  NEUTRAL_NUMBER,
  statusOf,
  STOCK_PATH,
  UNKNOWN,
  ageText,
  type Builder,
  type KindDef,
} from './builderKit';
import { queueSegments, queueStack, walletArea } from './chartBuilders';
import { dailyBalanceSeries } from './chartSeries';
import {
  comingUpTable,
  contractsTable,
  mailTable,
  spTable,
  trainingTable,
} from './characterTables';
import {
  balanceChange,
  journalTable,
  ordersListed,
  ordersStateChart,
  miningTaxTable,
  ordersTable,
  priceWatchTable,
  stockChart,
  stockTable,
} from './moneyModels';
import { KIND_DEFS } from './kindModels';
import { WORLD_DEFS } from './worldModels';
import type {
  BuildContext,
  FeedId,
  Feeds,
  KindView,
  ListRow,
  NumberModel,
  NumberSecondary,
  Translate,
} from './types';

/** The Contracts History table, unfiltered: the widget counts hauls and outstanding contracts, which no one status covers. */
export const CONTRACTS_HREF = '/contracts/history';

// --- Which reads a kind needs ------------------------------------------------

/** The distinct feeds needed by `kinds`; only these are ever fetched. */
export function feedsFor(kinds: readonly string[]): FeedId[] {
  const out = new Set<FeedId>();
  for (const kind of kinds) for (const feed of KIND_FEEDS[kind] ?? []) out.add(feed);
  return [...out];
}

/** Kinds whose read covers every Character; a widget scoped to the header Character still narrows to it in the builder. */
const SUMS_ACROSS = new Set([
  'miningTax',
  'stock',
  'priceWatch',
  'incursions',
  'orders',
  'netWorth',
  'miningYield',
  // One route on this device, whichever Character is the header's.
  'routeSafety',
  // Reads every tracked Character's killboard; the builder narrows to the header Character.
  'kills',
  // Every Character's journal, classified together; the builder narrows to the header Character.
  'omega',
  // Every Character's fills and journal, pooled or narrowed to the header Character in the builder.
  'tradingProfit',
  // Every Character's jobs and job slots; the builder narrows to the header Character.
  'industry',
]);

export function kindSumsAcrossCharacters(kind: string): boolean {
  return SUMS_ACROSS.has(kind);
}

// --- Helpers ----------------------------------------------------------------

// --- Builders ---------------------------------------------------------------

/** The journal-derived daily balance, over the widget's range (ESI keeps about 30 days of journal). */
function walletSeries(feeds: Feeds, now: number, range: number, balance: number | null) {
  const journal = feeds.journal?.data?.result?.data;
  if (!journal || balance === null) return null;
  return dailyBalanceSeries(
    dailyWalletFromJournal(journal),
    new Date(now).toISOString().slice(0, 10),
    range
  );
}

const wallet: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.wallet;
  const data = feed?.data ?? null;
  if (!data) return blank('/wallet', statusOf(feed));
  const balance = data.result?.data ?? null;
  const series = walletSeries(feeds, now, range, balance);
  const journal = feeds.journal?.data?.result?.data;
  return {
    // A lapsed grant over a saved balance keeps the balance (with a sign-in note).
    ...blank(
      '/wallet',
      statusOf(feed, { needsPermission: data.needsReauth, hasStaleData: balance !== null })
    ),
    fetchedAt: data.result?.fetchedAt ?? null,
    fromCache: data.result?.fromCache ?? false,
    number:
      balance === null
        ? NEUTRAL_NUMBER
        : {
            value: formatIskCompact(balance),
            iskAmount: balance,
            unit: t('overview.isk'),
            // How far it moved is the fact the balance lacks; no journal, no line.
            secondary: series ? balanceChange(t, series.values) : undefined,
            tone: 'clear',
          },
    // The Table is the journal's newest entries, never the balance again.
    rows: [],
    table: balance !== null && journal ? journalTable(t, journal, now) : undefined,
    summary: balance === null ? UNKNOWN : `${formatIsk(balance, 2)} ${t('overview.isk')}`,
    // A secondary read: while the journal loads or fails the Number stays ok and the chart is just absent.
    chart: series ? (walletArea(t, series, formatIskCompact) ?? undefined) : undefined,
  };
};

const training: Builder = (feeds, { t, now, notTrainingAlert }) => {
  const feed = feeds.skills;
  const data = feed?.data ?? null;
  const to = '/skills/plans';
  if (!data) return blank(to, statusOf(feed));
  const queue = data.queueResult?.data ?? [];
  const sorted = sortQueueEntries(queue);
  const active = selectActiveEntryFromSorted(sorted, now);
  const nameOf = (skillId: number) =>
    data.catalog.bySkillTypeID.get(skillId)?.name ?? `#${skillId}`;
  const base = {
    ...blank(
      to,
      // A lapsed grant over a saved queue keeps the queue (with a sign-in note).
      statusOf(feed, {
        needsPermission: data.queueNeedsReauth,
        hasStaleData: data.queueResult !== null,
      })
    ),
    fetchedAt: data.queueResult?.fetchedAt ?? null,
    fromCache: data.queueResult?.fromCache ?? false,
  };

  const finishOf = (entry: { finish_date?: string }) =>
    entry.finish_date ? Date.parse(entry.finish_date) : null;
  const rows: ListRow[] = sorted
    .filter((entry) => {
      const finish = finishOf(entry);
      return finish === null || finish > now;
    })
    .map((entry) => {
      const finish = finishOf(entry);
      return {
        key: `${entry.skill_id}:${entry.queue_position}`,
        title: t('overview.widgets.training.skillLevel', {
          name: nameOf(entry.skill_id),
          level: entry.finished_level,
        }),
        detail: t(
          entry === active ? 'overview.widgets.training.now' : 'overview.widgets.training.next'
        ),
        value: finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
        tone: 'clear' as DeadlineSeverity,
      };
    });

  if (!active) {
    return {
      ...base,
      number: {
        value: t('overview.widgets.training.idle'),
        tone: notTrainingAlert ? 'warning' : 'clear',
      },
      rows,
      summary: t('overview.board.notTraining'),
    };
  }
  const finish = finishOf(active);
  const segments = queueSegments(sorted, now);
  return {
    ...base,
    chart:
      queueStack(
        t,
        segments.map(({ entry, seconds }) => ({
          key: `${entry.skill_id}:${entry.queue_position}`,
          label: t('overview.widgets.training.skillLevel', {
            name: nameOf(entry.skill_id),
            level: entry.finished_level,
          }),
          seconds,
        })),
        (seconds) => formatCountdown(seconds)
      ) ?? undefined,
    table: trainingTable(t, sorted, now, nameOf),
    number: {
      value: finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
      secondary: {
        text: t('overview.widgets.training.skillLevel', {
          name: nameOf(active.skill_id),
          level: active.finished_level,
        }),
      },
      tone: 'clear',
    },
    rows,
    deadlines:
      finish !== null && finish > now
        ? [{ at: finish, note: t('overview.board.nextSkill'), severity: 'clear', to }]
        : [],
    summary: nameOf(active.skill_id),
  };
};

const sp: Builder = (feeds, { t }) => {
  const skills = feeds.skills;
  const extras = feeds.spExtras?.data ?? null;
  const data = skills?.data ?? null;
  const to = '/characters';
  if (!data || !extras) return blank(to, statusOf(skills, { hasData: false }));
  const extraction = {
    totalSp: data.totalSp,
    monitoring: extras.monitoring,
    thresholdSp: extras.thresholdSp,
    price: extras.price,
  };
  const total = data.totalSp;
  const unallocated = data.skillsResult?.data.unallocated_sp ?? null;
  const rows: ListRow[] =
    total === null
      ? []
      : [
          {
            key: 'total',
            title: t('skills.totalSp'),
            value: total.toLocaleString(),
            tone: 'clear',
          },
          {
            key: 'unallocated',
            title: t('skills.unallocatedSp'),
            value: unallocated === null ? UNKNOWN : unallocated.toLocaleString(),
            tone: 'clear',
          },
          {
            key: 'spare',
            title: t('overview.board.spareSp'),
            value: formatCompactNumber(extractableSp(total)),
            tone: 'clear',
          },
          {
            key: 'extractors',
            title: t('overview.board.extractors'),
            value: count(extractorCount(total)),
            tone: spExtractionSeverity(extraction) === 'watch' ? 'watch' : 'clear',
          },
        ];
  return {
    ...blank(
      to,
      statusOf(skills, {
        needsPermission: data.skillsResult === null && total === null,
        hasData: true,
      })
    ),
    fetchedAt: data.skillsResult?.fetchedAt ?? null,
    fromCache: data.skillsResult?.fromCache ?? false,
    number:
      total === null
        ? NEUTRAL_NUMBER
        : {
            value: formatCompactNumber(total),
            unit: t('overview.widgets.sp.unit'),
            // Unallocated SP is the pilot's to spend; it leads, the extraction summary is the fallback.
            secondary: {
              text:
                unallocated !== null && unallocated > 0
                  ? t('overview.widgets.sp.unallocated', { sp: formatCompactNumber(unallocated) })
                  : spExtractionSummary(t, extraction),
            },
            tone: spExtractionSeverity(extraction) ?? 'clear',
          },
    rows,
    table:
      total === null
        ? undefined
        : spTable(t, { totalSp: total, unallocatedSp: unallocated, extras }),
    summary: spExtractionSummary(t, extraction),
  };
};

const comingUp: Builder = (feeds, { t, now, calendarEvents }) => {
  const feed = feeds.calendar;
  const data = feed?.data ?? null;
  const to = '/calendar';
  if (!data) return blank(to, statusOf(feed));
  const all = calendarEvents === 'all';
  const upcoming = all
    ? upcomingEvents(data.events, now)
    : upcomingCommittedEvents(data.events, now);
  const next = upcoming[0];
  const soonest = soonestCalendarDeadline(data.events, now);
  const laterToday = upcoming.filter(
    (event) => event !== next && event.atMs <= now + DAY_MS
  ).length;
  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: data.needsReauth,
        isEmpty: upcoming.length === 0,
        // A read time means the events came from a real (cached) read.
        hasStaleData: data.fetchedAt !== null,
      })
    ),
    emptyMessage: all ? t('overview.widgets.comingUp.emptyAll') : undefined,
    emptyHint: all ? undefined : t('overview.widgets.comingUp.emptyHint'),
    fetchedAt: data.fetchedAt,
    number: next
      ? {
          value: formatCountdown((next.atMs - now) / 1000),
          // The others within a day: the one fact the headline event does not carry.
          unit:
            laterToday > 0 ? t('overview.widgets.comingUp.more', { count: laterToday }) : undefined,
          secondary: { text: next.title },
          tone: all
            ? comingUpEventSeverity(next.atMs, now)
            : (comingUpSeverity(data, now) ?? 'clear'),
        }
      : NEUTRAL_NUMBER,
    rows: upcoming.map((event) => ({
      key: String(event.eventId),
      title: event.title,
      detail: t(`overview.board.response.${event.response}`),
      value: formatDuration((event.atMs - now) / 1000),
      tone: comingUpEventSeverity(event.atMs, now),
    })),
    table: comingUpTable(t, upcoming, now, comingUpEventSeverity),
    deadlines: soonest
      ? [
          {
            at: soonest.atMs,
            note: soonest.title,
            severity: severityForRemaining(soonest.atMs - now),
            to,
          },
        ]
      : [],
    summary: comingUpSummary(t, data, now),
  };
};

/** The newest message's sender and age: a fact the unread count does not carry. */
function latestMail(t: Translate, now: number, data: MailBoardData): NumberSecondary | undefined {
  const latest = data.recent[0];
  if (!latest || !latest.from) return undefined;
  return {
    text: t('overview.widgets.mail.latest', {
      from: latest.from,
      age: ageText(t, now, latest.atMs),
    }),
  };
}

const mail: Builder = (feeds, { t, now }) => {
  const feed = feeds.mail;
  const data = feed?.data ?? null;
  const to = '/mail';
  if (!data) return blank(to, statusOf(feed));
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, hasStaleData: data.fetchedAt !== null })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(data.unread),
      unit: t('overview.widgets.mail.unit'),
      secondary: latestMail(t, now, data),
      tone: mailSeverity(data) ?? 'clear',
    },
    rows: data.recent.map((item) => ({
      key: String(item.mailId),
      title: item.subject || t('overview.board.mailNoSubject'),
      detail: item.from ?? undefined,
      value: ageText(t, now, item.atMs),
      tone: 'watch',
    })),
    table: mailTable(t, data.inbox ?? data.recent, (atMs) => ageText(t, now, atMs)),
    summary: mailSummary(t, data),
  };
};

const orders: Builder = (feeds, { t, now, activeCharacterId, scopeAll }) => {
  const feed = feeds.orders;
  const snapshot = feed?.data ?? null;
  const to = '/market/orders';
  if (!snapshot) return blank(to, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  // `loadOpenOrdersSnapshot` fans out across every Character because it backs
  // the cross-character Orders page; a widget on one Character narrows the
  // built rows, which costs nothing since the other Characters' orders were
  // already fetched for the page's cache.
  const built = buildOpenOrderRows({
    snapshot: snapshot.openOrders,
    typeNames: snapshot.typeNames,
    stationPrices: snapshot.stationPrices,
    costBases: snapshot.costBases,
    walletBasisGaps: snapshot.walletBasisGaps,
    stationNames: new Map([...snapshot.npcStations].map(([id, s]) => [id, s.name])),
    skillsByCharacter: snapshot.skillsByCharacter,
    now: snapshot.now,
  });
  const rows = everyone ? built : built.filter((row) => row.characterId === activeCharacterId);
  // No entry at all for this Character means the grant was never given.
  const entries = snapshot.openOrders.entries;
  const needsReauth = everyone
    ? entries.length > 0 && entries.every((entry) => entry.needsReauth)
    : (() => {
        const entry = entries.find((candidate) => candidate.characterId === activeCharacterId);
        return entry === undefined || entry.needsReauth;
      })();
  const counts = openOrderProblemCounts(rows);
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  const maxOrders = feeds.skills?.data?.maxOrders ?? null;
  const listed = ordersListed(rows);
  const unchecked = notCheckedCount(rows);
  const severity = ordersSeverity(rows, needsReauth);
  const needFix = needsAttentionCount(rows);
  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: needsReauth,
        isEmpty: rows.length === 0,
        // Saved orders for this view's Characters are still worth showing.
        hasStaleData: rows.length > 0,
      })
    ),
    // The snapshot's own clock: when its orders were read, not when this view was built.
    fetchedAt: new Date(snapshot.now),
    number: {
      value: count(undercut),
      unit: t('overview.board.undercut'),
      // What is on the market is the fact the undercut count lacks; the slots sit under the table.
      // Unchecked orders come first: "0 undercut" must not read as all-clear
      // when the competition behind it was never looked at.
      secondary:
        unchecked > 0
          ? { text: t('overview.widgets.orders.notChecked', { count: unchecked }) }
          : listed > 0
            ? { text: t('overview.widgets.orders.listed', { isk: formatIskCompact(listed) }) }
            : undefined,
      tone: undercut === 0 && severity !== 'critical' ? 'clear' : (severity ?? 'clear'),
      link:
        needFix > 0
          ? {
              label: t('overview.widgets.orders.workThrough', { total: needFix }),
              to: openOrdersHref({
                characterIds:
                  everyone || activeCharacterId === null ? undefined : [activeCharacterId],
                workThrough: true,
              }),
            }
          : undefined,
    },
    rows: [],
    table: ordersTable(
      t,
      rows,
      now,
      maxOrders !== null ? { used: rows.length, total: maxOrders } : null
    ),
    summary: ordersSummary(t, rows, needsReauth),
    chart: ordersStateChart(t, rows) ?? undefined,
  };
};

const contracts: Builder = (feeds, { t, now }) => {
  const feed = feeds.contracts;
  const data = feed?.data ?? null;
  const to = CONTRACTS_HREF;
  if (!data) return blank(to, statusOf(feed));
  const { summary } = data;
  const note = data.needsReauth ? null : contractsDeadlineNote(t, data);
  const soonest = summary.soonest;
  const list: ListRow[] = [
    {
      key: 'inProgress',
      title: t('overview.board.contractsInProgressTile'),
      value: count(summary.inProgress),
      tone: summary.inProgress > 0 ? 'watch' : 'clear',
    },
    {
      key: 'outstanding',
      title: t('overview.board.contractsOutstandingTile'),
      value: count(summary.outstanding),
      tone: summary.outstanding > 0 ? 'watch' : 'clear',
    },
    {
      key: 'dueSoon',
      title: t('overview.board.contractsDueTile'),
      value: count(summary.dueSoon),
      tone: summary.dueSoon > 0 ? 'warning' : 'clear',
    },
    {
      key: 'overdue',
      title: t('overview.widgets.contracts.overdue'),
      value: count(summary.overdue),
      tone: summary.overdue > 0 ? 'critical' : 'clear',
    },
  ];
  const tone = contractsSeverity(data) ?? 'clear';
  // Nothing is on a clock, so never say "Nothing due" beside a count of open offers: say when the first lapses.
  const noClockSecondary = (): NumberSecondary => {
    const nextOffer = summary.rows.find((row) => row.state === 'outstanding');
    if (summary.inProgress > 0 && summary.outstanding > 0) {
      return {
        text: t('overview.widgets.contracts.outstandingCount', { count: summary.outstanding }),
      };
    }
    if (nextOffer) {
      return {
        text: t('overview.widgets.contracts.outstandingExpires', {
          duration: formatCountdown(Math.max(0, nextOffer.atMs - now) / 1000),
        }),
      };
    }
    return { text: t('overview.board.contractsNothingDue') };
  };
  // The soonest clock leads; the hauls in flight are the one other fact. With no clock, the count itself leads.
  const number: NumberModel = soonest
    ? {
        value: soonest.overdue
          ? t('overview.widgets.contracts.overdue')
          : formatCountdown((soonest.atMs - now) / 1000),
        secondary:
          summary.inProgress > 0
            ? { text: t('overview.widgets.contracts.inProgress', { count: summary.inProgress }) }
            : { text: note ?? t('overview.board.contractsNothingDue') },
        tone,
      }
    : {
        // Hauls lead; with none in flight, outstanding contracts are the fact worth a number, not a 0.
        value: count(summary.inProgress === 0 ? summary.outstanding : summary.inProgress),
        unit:
          summary.inProgress === 0 && summary.outstanding > 0
            ? t('overview.widgets.contracts.outstandingUnit')
            : t('overview.widgets.contracts.unit'),
        secondary: noClockSecondary(),
        tone,
      };
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, hasStaleData: data.fetchedAt !== null })
    ),
    fetchedAt: data.fetchedAt,
    number,
    rows: list,
    table: contractsTable(t, summary.rows, data.routes, now),
    deadlines:
      soonest && note !== null
        ? [
            {
              at: soonest.atMs,
              note,
              severity: soonest.overdue ? 'critical' : 'warning',
              to,
            },
          ]
        : [],
    summary: contractsSummary(t, data, now),
  };
};

/** The headline is the ISK owed; how long it has been owed is the fact it lacks. */
function miningTaxSecondary(t: Translate, data: MiningTaxBoardData): NumberSecondary | undefined {
  if (data.unpaidIsk > 0 && data.oldestUnpaidDays !== null) {
    return { text: t('overview.widgets.miningTax.oldest', { days: data.oldestUnpaidDays }) };
  }
  if (data.unpaidIsk <= 0 && data.unassignedCount > 0) {
    return { text: t('overview.board.miningUnassigned', { count: data.unassignedCount }) };
  }
  return undefined;
}

const miningTax: Builder = (feeds, { t }) => {
  const feed = feeds.mining;
  const data = feed?.data ?? null;
  const to = '/mining/tax';
  if (!data) return blank(to, statusOf(feed));
  return {
    ...blank(to, statusOf(feed, { needsPermission: data.needsReauth })),
    fetchedAt: data.fetchedAt,
    number: {
      value: formatIskCompact(data.unpaidIsk),
      iskAmount: data.unpaidIsk,
      unit: t('overview.board.iskUnpaid'),
      secondary: miningTaxSecondary(t, data),
      tone: miningTaxSeverity(data) ?? 'clear',
    },
    rows: [],
    table: data.payees ? miningTaxTable(t, data.payees, data.unassignedCount) : undefined,
    summary: miningTaxSummary(t, data),
  };
};

const stock: Builder = (feeds, { t }) => {
  const feed = feeds.stock;
  const data = feed?.data ?? null;
  const to = STOCK_PATH;
  if (!data) return blank(to, statusOf(feed));
  const board = data.board;
  if (board === null) return blank(to, statusOf(feed, { isEmpty: true }));
  // Counts need the cached orders list. Until it is there they are unknown, not zero, and
  // that is a settled answer (the loader fills the cache first), never a spinner that could stick.
  if (!board.counted) {
    return {
      ...blank(to, statusOf(feed)),
      number: {
        value: UNKNOWN,
        secondary: { text: t('overview.board.stockNotCounted') },
        tone: 'clear',
      },
      summary: stockBoardSummary(t, board),
    };
  }
  const shortfall = board.totals.out + board.totals.low;
  const cost = board.markets.reduce((sum, market) => sum + market.summary.costToFill, 0);
  return {
    ...blank(to, statusOf(feed)),
    // The shortfall (out plus low) is the count to act on; "0 out" beside "2 low" hid it.
    number: {
      value: count(shortfall),
      unit: t('overview.widgets.stock.short'),
      secondary:
        cost > 0
          ? { text: t('overview.board.stockToSource', { isk: formatIskCompact(cost) }) }
          : undefined,
      tone: shortfall > 0 ? (stockBoardSeverity(board) ?? 'clear') : 'clear',
    },
    rows: [],
    // Every market, not only those short: the healthy ones are the answer to "am I fine".
    table: stockTable(t, board.markets),
    summary: stockBoardSummary(t, board),
    chart: stockChart(t, board.markets) ?? undefined,
  };
};

/** The closest target not yet crossed, by how far its price still is: the fact the hit count lacks. */
function nearestAlert(t: Translate, data: PriceAlertsBoardData): NumberSecondary | undefined {
  let best: { name: string; gap: number } | null = null;
  for (const alert of data.alerts) {
    if (alert.crossed || alert.price === null || alert.targetPrice <= 0) continue;
    const gap = Math.abs(alert.price - alert.targetPrice) / alert.targetPrice;
    if (best === null || gap < best.gap) best = { name: alert.name, gap };
  }
  if (best === null) return undefined;
  return {
    text: t('overview.widgets.priceWatch.nearest', {
      name: best.name,
      pct: Math.max(1, Math.round(best.gap * 100)),
    }),
  };
}

const priceWatch: Builder = (feeds, { t }) => {
  const feed = feeds.priceAlerts;
  const data = feed?.data ?? null;
  const to = '/market';
  if (!data) return blank(to, statusOf(feed));
  const crossed = data.alerts.filter((alert) => alert.crossed).length;
  return {
    ...blank(to, statusOf(feed, { isEmpty: data.alerts.length === 0 })),
    number: {
      value: count(crossed),
      unit: t('overview.board.priceAlertsHit'),
      secondary: nearestAlert(t, data),
      tone: priceAlertsSeverity(data) ?? 'clear',
    },
    rows: [],
    table: priceWatchTable(t, data.alerts),
    summary: priceAlertsSummary(t, data),
  };
};

/** Every widget kind: the feeds it reads and the builder that draws it. */
const KINDS: Readonly<Record<string, KindDef>> = {
  wallet: { feeds: ['wallet', 'journal'], build: wallet },
  training: { feeds: ['skills'], build: training },
  sp: { feeds: ['skills', 'spExtras'], build: sp },
  comingUp: { feeds: ['calendar'], build: comingUp },
  mail: { feeds: ['mail'], build: mail },
  orders: { feeds: ['orders', 'skills'], build: orders },
  contracts: { feeds: ['contracts'], build: contracts },
  miningTax: { feeds: ['mining'], build: miningTax },
  stock: { feeds: ['stock'], build: stock },
  priceWatch: { feeds: ['priceAlerts'], build: priceWatch },
  ...WORLD_DEFS,
  ...KIND_DEFS,
};

/** Kind -> the feeds it reads. A kind absent here reads no feed and draws without data. */
export const KIND_FEEDS: Readonly<Record<string, readonly FeedId[]>> = Object.fromEntries(
  Object.entries(KINDS).map(([kind, def]) => [kind, def.feeds])
);

/**
 * Kinds still marked coming soon in the catalogue, and kinds a newer build
 * wrote that this one has never heard of. Both read as "nothing to show yet": a
 * loading-free empty state the pilot can remove, never a spinner that would
 * not end.
 */
function placeholder(kind: string): KindView {
  return {
    ...blank(null, {
      loading: false,
      needsPermission: false,
      error: false,
      hasData: true,
      isEmpty: true,
    }),
    summary: kind,
  };
}

/** One widget kind's view of the feeds; the single seam the shell and the header read. */
export function buildView(kind: string, feeds: Feeds, ctx: BuildContext): KindView {
  const def = KINDS[kind];
  if (!def) return placeholder(kind);
  return zeroIsClear(def.build(feeds, ctx));
}

/**
 * A count of zero is never a warning: "⚠ 0 Timers" contradicts itself. The
 * tone follows the figure, so a zero headline draws plain whatever a builder's
 * severity ladder said about the rest of the domain.
 */
function zeroIsClear(view: KindView): KindView {
  const { number } = view;
  if (number.value !== '0' || number.tone === 'clear') return view;
  return { ...view, number: { ...number, tone: 'clear' } };
}
