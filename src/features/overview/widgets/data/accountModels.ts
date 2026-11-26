import {
  needsAttentionCount,
  notCheckedCount,
  openOrderProblemCounts,
} from '@/features/market/openOrdersModel';
import { openOrdersHref } from '@/features/market/openOrdersFilter';
import { openOrderRowsFromSnapshot } from '@/features/market/openOrdersSnapshotRows';
import { stockBoardSeverity } from '@/features/stockTargets/stockBoard';
import { formatCountdown } from '@/lib/duration';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { dailyWalletFromJournal } from '@/engine/netWorth/series';
import {
  contractsSeverity,
  mailSeverity,
  miningTaxSeverity,
  ordersSeverity,
  priceAlertsSeverity,
} from '../../data/boardSeverity';
import {
  contractsDeadlineNote,
  contractsSummary,
  mailSummary,
  miningTaxSummary,
  ordersSummary,
  priceAlertsSummary,
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
  byShow,
  type Builder,
  type KindDef,
} from './builderKit';
import { hbarsFromRows, walletArea } from './chartBuilders';
import { walletFlow } from './kindModels';
import { getKind } from '../kinds';
import { dailyBalanceSeries } from './chartSeries';
import { contractsTable, mailTable } from './characterTables';
import {
  balanceChange,
  journalTable,
  miningTaxTable,
  priceWatchTable,
  stockChart,
  stockTable,
} from './moneyModels';
import { ordersListed, ordersStateChart, ordersTable } from './ordersModels';
import type { Feeds, ListRow, NumberModel, NumberSecondary } from './types';
import type { Translate } from '@/lib/translate';
import { utcDay } from '@/engine/localDay';

export const CONTRACTS_HREF = '/contracts/history';

function walletSeries(feeds: Feeds, now: number, range: number, balance: number | null) {
  const journal = feeds.journal?.data?.result?.data;
  if (!journal || balance === null) return null;
  return dailyBalanceSeries(dailyWalletFromJournal(journal), utcDay(now), range);
}

const wallet: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.wallet;
  const data = feed?.data ?? null;
  if (!data) return blank('/wallet', statusOf(feed));
  const balance = data.result?.data ?? null;
  const series = walletSeries(feeds, now, range, balance);
  const journal = feeds.journal?.data?.result?.data;
  return {
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
            secondary: series ? balanceChange(t, series.values) : undefined,
            tone: 'clear',
          },
    rows: [],
    table: balance !== null && journal ? journalTable(t, journal, now) : undefined,
    summary: balance === null ? UNKNOWN : `${formatIsk(balance, 2)} ${t('overview.isk')}`,
    chart: series ? (walletArea(t, series, formatIskCompact) ?? undefined) : undefined,
  };
};

const walletAcross: Builder = (feeds, { t }) => {
  const feed = feeds.walletAll;
  const data = feed?.data ?? null;
  if (!data) return blank('/wallet', statusOf(feed));
  const K = 'overview.widgets.wallet';
  const read = data.characters.filter((c) => c.balance !== null);
  const total = read.reduce((sum, c) => sum + (c.balance ?? 0), 0);
  const lapsed = data.characters.length - read.length + data.skippedCount;
  const times = read.flatMap((c) => (c.fetchedAt === null ? [] : [c.fetchedAt]));
  const rows = [...read].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  return {
    ...blank(
      '/wallet',
      statusOf(feed, {
        needsPermission: read.length === 0 && data.characters.some((c) => c.needsReauth),
        isEmpty: data.characters.length === 0,
        hasStaleData: read.length > 0,
      })
    ),
    fetchedAt: times.length > 0 ? new Date(Math.min(...times)) : null,
    fromCache: read.some((c) => c.fromCache),
    number: {
      value: formatIskCompact(total),
      iskAmount: total,
      unit: t('overview.isk'),
      secondary: { text: t(`${K}.across.characters`, { count: read.length }) },
      notes: lapsed > 0 ? [t(`${K}.across.missing`, { count: lapsed })] : undefined,
      tone: 'clear',
    },
    rows: rows.map((c) => ({
      key: String(c.characterId),
      title: c.name,
      value: formatIskCompact(c.balance ?? 0),
      iskAmount: c.balance ?? 0,
      tone: 'clear',
    })),
    table: {
      columns: [
        { key: 'character', label: t(`${K}.across.col.character`), priority: 0 },
        { key: 'balance', label: t(`${K}.col.balance`), align: 'end', priority: 1 },
        { key: 'share', label: t(`${K}.across.col.share`), align: 'end', priority: 2 },
      ],
      rows: rows.map((c) => ({
        key: String(c.characterId),
        to: '/wallet',
        cells: [
          c.name,
          { text: formatIskCompact(c.balance ?? 0), iskAmount: c.balance ?? 0 },
          total > 0 ? `${Math.round(((c.balance ?? 0) / total) * 100)}%` : UNKNOWN,
        ],
      })),
    },
    summary: t(`${K}.across.summary`, { isk: formatIskCompact(total), count: read.length }),
    chart:
      total > 0
        ? (hbarsFromRows(
            t,
            rows
              .filter((c) => (c.balance ?? 0) > 0)
              .map((c) => {
                const share = (c.balance ?? 0) / total;
                return {
                  key: String(c.characterId),
                  label: c.name,
                  value: c.balance ?? 0,
                  share,
                  text: `${Math.round(share * 100)}%`,
                };
              }),
            t(`${K}.across.chartNote`)
          ) ?? undefined)
        : undefined,
  };
};

const walletFlowAcross: Builder = (feeds, ctx) =>
  walletFlow({ ...feeds, journal: feeds.journalAll }, ctx);

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

const mail: Builder = (feeds, { t, now, activeCharacterId }) => {
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
    table: mailTable(
      t,
      data.inbox ?? data.recent,
      (atMs) => ageText(t, now, atMs),
      activeCharacterId
    ),
    summary: mailSummary(t, data),
  };
};

function oldestFetch(entries: readonly { fetchedAt: number }[]): Date | null {
  const times = entries.map((entry) => entry.fetchedAt).filter((at) => at > 0);
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

const orders: Builder = (feeds, { t, now, activeCharacterId, scopeAll }) => {
  const feed = feeds.orders;
  const snapshot = feed?.data ?? null;
  const to = '/market/orders';
  if (!snapshot) return blank(to, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  const asked = snapshot.openOrders.entries.filter(
    (entry) => everyone || entry.characterId === activeCharacterId
  );
  if (asked.length > 0 && asked.every((entry) => entry.fetchedAt === 0 && !entry.needsReauth)) {
    return blank(to, { ...statusOf(feed, { hasData: false }), error: true });
  }
  const built = openOrderRowsFromSnapshot(snapshot);
  const rows = everyone ? built : built.filter((row) => row.characterId === activeCharacterId);
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
        hasStaleData: rows.length > 0,
      })
    ),
    fetchedAt: oldestFetch(asked),
    number: {
      value: count(undercut),
      unit: t('overview.board.undercut'),
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

function miningTaxSecondary(t: Translate, data: MiningTaxBoardData): NumberSecondary | undefined {
  if (data.unpaidIsk > 0 && data.oldestUnpaidDays !== null) {
    return { text: t('overview.widgets.miningTax.oldest', { days: data.oldestUnpaidDays }) };
  }
  if (data.unpaidIsk <= 0 && data.unassignedCount > 0) {
    return { text: t('overview.board.miningUnassigned', { count: data.unassignedCount }) };
  }
  return undefined;
}

const miningTax: Builder = (feeds, { t, activeCharacterId }) => {
  const feed = feeds.mining;
  const data = feed?.data ?? null;
  const to = '/mining/tax';
  if (!data) return blank(to, statusOf(feed));
  const missing = data.missingCharacterIds ?? [];
  const index = Math.max(0, activeCharacterId === null ? 0 : missing.indexOf(activeCharacterId));
  const grant =
    data.needsReauth && missing.length > 0
      ? {
          grantCharacterId: missing[index],
          grantCharacterName: data.missingCharacterNames[index],
        }
      : {};
  return {
    ...blank(to, statusOf(feed, { needsPermission: data.needsReauth })),
    ...grant,
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
    table: stockTable(t, board.markets),
    summary: stockBoardSummary(t, board),
    chart: stockChart(t, board.markets) ?? undefined,
  };
};

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

export const ACCOUNT_DEFS: Readonly<Record<string, KindDef>> = {
  wallet: {
    feeds: ['wallet', 'journal'],
    allFeeds: ['walletAll', 'journalAll'],
    scope: 'account',
    bySettings: ({ show }) => ({
      feeds: ['wallet', 'journal'],
      allFeeds: show === 'flow' ? ['journalAll'] : ['walletAll'],
      scope: 'account',
      endpoints: getKind('wallet')?.endpoints ?? [],
    }),
    build: (feeds, ctx) =>
      byShow(
        ctx.scopeAll
          ? { balance: walletAcross, flow: walletFlowAcross }
          : { balance: wallet, flow: walletFlow },
        ctx.scopeAll ? walletAcross : wallet
      )(feeds, ctx),
  },
  mail: {
    feeds: ['mail'],
    allFeeds: ['mailAll'],
    scope: 'account',
    build: (feeds, ctx) => mail(ctx.scopeAll ? { ...feeds, mail: feeds.mailAll } : feeds, ctx),
  },
  orders: { feeds: ['orders', 'skills'], scope: 'account', build: orders },
  contracts: {
    feeds: ['contracts'],
    allFeeds: ['contractsAll'],
    scope: 'account',
    build: (feeds, ctx) =>
      contracts(ctx.scopeAll ? { ...feeds, contracts: feeds.contractsAll } : feeds, ctx),
  },
  miningTax: { feeds: ['mining'], scope: 'account', build: miningTax },
  stock: { feeds: ['stock'], scope: 'account', build: stock },
  priceWatch: { feeds: ['priceAlerts'], scope: 'account', build: priceWatch },
};
