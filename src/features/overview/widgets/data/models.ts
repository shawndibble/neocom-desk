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
import { severityForRemaining, type DeadlineSeverity } from '@/engine/severity';
import { soonestCalendarDeadline, upcomingCommittedEvents } from '@/engine/calendarDeadline';
import { extractableSp, extractorCount } from '@/engine/spExtraction';
import { UNDERCUT_PROBLEMS } from '@/engine/market/orderProblems';
import type { CorpBoardItem } from '@/engine/corp/board';
import {
  activityI18nKey,
  isJobDone,
  secondsRemaining,
  sortJobsBySoonest,
  summarizeJobs,
} from '@/features/industry/jobs';
import {
  buildOpenOrderRows,
  needsAttentionCount,
  openOrderProblemCounts,
} from '@/features/market/openOrdersModel';
import { openOrdersHref } from '@/features/market/openOrdersFilter';
import { structureStateLabel } from '@/features/corp/boardSources';
import { stockBoardSeverity } from '@/features/stockTargets/stockBoard';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatAge } from '@/lib/age';
import { sortQueueEntries, selectActiveEntryFromSorted } from '@/routes/overviewQueue';
import { getKind } from '../kinds';
import type { WidgetStateInput } from '../state';
import {
  comingUpEventSeverity,
  comingUpSeverity,
  contractsSeverity,
  industrySeverity,
  jobSeverity,
  mailSeverity,
  miningTaxSeverity,
  ordersSeverity,
  planetarySeverity,
  priceAlertsSeverity,
  spExtractionSeverity,
} from '../../boardSeverity';
import {
  comingUpSummary,
  contractsDeadlineNote,
  contractsSummary,
  industrySummary,
  mailSummary,
  miningTaxSummary,
  moonChunksSummary,
  ordersSummary,
  planetarySummary,
  priceAlertsSummary,
  spExtractionSummary,
  stockBoardSummary,
  structuresSummary,
} from '../../boardSummary';
import {
  moonChunkSeverity,
  moonChunksDeadline,
  moonChunksSeverity,
  structureCounts,
  structuresDeadline,
  structuresSeverity,
  structuresView,
} from '../../corpCards';
import { incursionJumpsWhen, incursionsSeverity, incursionsSummary } from '../../incursionsBoard';
import type {
  BuildContext,
  FeedId,
  FeedState,
  Feeds,
  KindView,
  ListRow,
  NumberModel,
  Translate,
} from './types';

/** The Contracts History table filtered to accepted contracts, the courier hauls the widget counts. */
export const CONTRACTS_IN_PROGRESS_HREF = '/contracts/history?history.status=in_progress';
const STOCK_PATH = '/market/stock';

/** What a figure shows when the question cannot be answered at all, a lapsed grant, not a zero. */
const UNKNOWN = '—';

// --- Which reads a kind needs ------------------------------------------------

/** Kind -> the feeds it reads. A kind absent here has no data yet (the next stage fills it). */
export const KIND_FEEDS: Readonly<Record<string, readonly FeedId[]>> = {
  wallet: ['wallet'],
  training: ['skills'],
  sp: ['skills', 'spExtras'],
  comingUp: ['calendar'],
  mail: ['mail'],
  orders: ['orders', 'skills'],
  contracts: ['contracts'],
  industry: ['industry'],
  planetary: ['planetary'],
  miningTax: ['mining'],
  structures: ['structures'],
  moonChunks: ['moonChunks'],
  stock: ['stock'],
  priceWatch: ['priceAlerts'],
  incursions: ['incursions'],
};

/** The distinct feeds needed by `kinds`; only these are ever fetched. */
export function feedsFor(kinds: readonly string[]): FeedId[] {
  const out = new Set<FeedId>();
  for (const kind of kinds) for (const feed of KIND_FEEDS[kind] ?? []) out.add(feed);
  return [...out];
}

/** Kinds that read the whole account (or every Character) whatever the header Character is. */
const SUMS_ACROSS = new Set(['miningTax', 'stock', 'priceWatch', 'incursions', 'orders']);

export function kindSumsAcrossCharacters(kind: string): boolean {
  return SUMS_ACROSS.has(kind);
}

/** Account-wide whatever the scope: their reads never narrow to one Character, so no scope chip applies. */
const ACCOUNT_WIDE = new Set(['miningTax', 'stock', 'priceWatch', 'incursions']);

export function kindIsAccountWide(kind: string): boolean {
  return ACCOUNT_WIDE.has(kind);
}

// --- Helpers ----------------------------------------------------------------

function statusOf(
  feed: FeedState<unknown> | undefined,
  over: { needsPermission?: boolean; isEmpty?: boolean; hasData?: boolean; loading?: boolean } = {}
): WidgetStateInput {
  return {
    loading: over.loading ?? feed?.loading ?? true,
    needsPermission: over.needsPermission ?? false,
    error: feed?.error ?? false,
    hasData: over.hasData ?? (feed?.data !== null && feed?.data !== undefined),
    isEmpty: over.isEmpty ?? false,
  };
}

const NEUTRAL_NUMBER: NumberModel = { value: UNKNOWN, tone: 'clear' };

/** A view with nothing in it yet; every builder starts from this and fills what it has. */
function blank(to: string, status: WidgetStateInput): KindView {
  return {
    status,
    fetchedAt: null,
    fromCache: false,
    number: NEUTRAL_NUMBER,
    rows: [],
    deadlines: [],
    summary: '',
    to,
    emptyMessage: undefined,
  };
}

const count = (n: number): string => String(n);

function ageText(t: Translate, nowMs: number, atMs: number | null): string {
  return atMs === null ? UNKNOWN : formatAge(Math.max(0, nowMs - atMs), t);
}

type Builder = (feeds: Feeds, ctx: BuildContext) => KindView;

// --- Builders ---------------------------------------------------------------

const wallet: Builder = (feeds, { t }) => {
  const feed = feeds.wallet;
  const data = feed?.data ?? null;
  if (!data) return blank('/wallet', statusOf(feed));
  const balance = data.result?.data ?? null;
  return {
    ...blank('/wallet', statusOf(feed, { needsPermission: data.needsReauth })),
    fetchedAt: data.result?.fetchedAt ?? null,
    fromCache: data.result?.fromCache ?? false,
    number:
      balance === null
        ? NEUTRAL_NUMBER
        : {
            value: formatIskCompact(balance),
            iskAmount: balance,
            unit: t('overview.isk'),
            tone: 'clear',
          },
    rows:
      balance === null
        ? []
        : [
            {
              key: 'balance',
              title: t('overview.widgets.wallet.balance'),
              value: formatIsk(balance, 2),
              iskAmount: balance,
              tone: 'clear',
            },
          ],
    summary: balance === null ? UNKNOWN : `${formatIsk(balance, 2)} ${t('overview.isk')}`,
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
    ...blank(to, statusOf(feed, { needsPermission: data.queueNeedsReauth })),
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
        note: t('overview.board.notTraining'),
        tone: notTrainingAlert ? 'warning' : 'clear',
      },
      rows,
      summary: t('overview.board.notTraining'),
    };
  }
  const finish = finishOf(active);
  const queued = rows.length;
  return {
    ...base,
    number: {
      value: finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
      note: [
        nameOf(active.skill_id),
        queued > 1 ? t('overview.board.queued', { count: queued }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
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
            note: spExtractionSummary(t, extraction),
            tone: spExtractionSeverity(extraction) ?? 'clear',
          },
    rows,
    summary: spExtractionSummary(t, extraction),
  };
};

const comingUp: Builder = (feeds, { t, now }) => {
  const feed = feeds.calendar;
  const data = feed?.data ?? null;
  const to = '/calendar';
  if (!data) return blank(to, statusOf(feed));
  const upcoming = upcomingCommittedEvents(data.events, now);
  const next = upcoming[0];
  const soonest = soonestCalendarDeadline(data.events, now);
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: upcoming.length === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number: next
      ? {
          value: formatCountdown((next.atMs - now) / 1000),
          note: next.title,
          tone: comingUpSeverity(data, now) ?? 'clear',
        }
      : NEUTRAL_NUMBER,
    rows: upcoming.map((event) => ({
      key: String(event.eventId),
      title: event.title,
      detail: t(`overview.board.response.${event.response}`),
      value: formatDuration((event.atMs - now) / 1000),
      tone: comingUpEventSeverity(event.atMs, now),
    })),
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

const mail: Builder = (feeds, { t, now }) => {
  const feed = feeds.mail;
  const data = feed?.data ?? null;
  const to = '/mail';
  if (!data) return blank(to, statusOf(feed));
  return {
    ...blank(to, statusOf(feed, { needsPermission: data.needsReauth })),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(data.unread),
      unit: t('overview.widgets.mail.unit'),
      note: mailSummary(t, data),
      tone: mailSeverity(data) ?? 'clear',
    },
    rows: data.recent.map((item) => ({
      key: String(item.mailId),
      title: item.subject || t('overview.board.mailNoSubject'),
      detail: item.from ?? undefined,
      value: ageText(t, now, item.atMs),
      tone: 'watch',
    })),
    summary: mailSummary(t, data),
  };
};

const orders: Builder = (feeds, { t, activeCharacterId, scopeAll }) => {
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
  const href = (problems: Parameters<typeof openOrdersHref>[0]['problems']) =>
    openOrdersHref({
      problems,
      characterIds: everyone ? undefined : [activeCharacterId as number],
    });
  const row = (
    key: string,
    title: string,
    n: number,
    tone: DeadlineSeverity,
    problems: Parameters<typeof openOrdersHref>[0]['problems']
  ): ListRow => ({
    key,
    title,
    value: count(n),
    tone: n === 0 ? 'clear' : tone,
    // A zero is never a link: behind it is a page filtered down to nothing.
    to: n === 0 ? undefined : href(problems),
  });
  const list: ListRow[] = [
    row('undercut', t('overview.board.undercut'), undercut, 'warning', UNDERCUT_PROBLEMS),
    row('outbid', t('overview.board.outbid'), counts.outbid, 'warning', ['outbid']),
    row('relist', t('overview.board.relist'), counts.expiringOrStale, 'watch', ['expiringOrStale']),
  ];
  if (counts.belowFloor > 0) {
    list.push({
      key: 'belowFloor',
      title: t('overview.board.belowFloor', { count: counts.belowFloor }),
      value: count(counts.belowFloor),
      tone: 'critical',
    });
  }
  const severity = ordersSeverity(rows, needsReauth);
  return {
    ...blank(to, statusOf(feed, { needsPermission: needsReauth, isEmpty: rows.length === 0 })),
    number: {
      value: count(undercut),
      unit: t('overview.board.undercut'),
      note: [
        t('overview.board.ordersMeta', { count: needsAttentionCount(rows) }),
        maxOrders !== null
          ? t('overview.board.slotsUsed', { used: rows.length, total: maxOrders })
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: undercut === 0 && severity !== 'critical' ? 'clear' : (severity ?? 'clear'),
    },
    rows: list,
    summary: ordersSummary(t, rows, needsReauth),
  };
};

const contracts: Builder = (feeds, { t, now }) => {
  const feed = feeds.contracts;
  const data = feed?.data ?? null;
  const to = CONTRACTS_IN_PROGRESS_HREF;
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
  return {
    ...blank(to, statusOf(feed, { needsPermission: data.needsReauth })),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(summary.inProgress),
      unit: t('overview.widgets.contracts.unit'),
      note: note ?? t('overview.board.contractsNothingDue'),
      tone: contractsSeverity(data) ?? 'clear',
    },
    rows: list,
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

const industry: Builder = (feeds, { t, now }) => {
  const feed = feeds.industry;
  const data = feed?.data ?? null;
  const to = '/industry';
  if (!data) return blank(to, statusOf(feed));
  const { jobs } = data;
  const summary = summarizeJobs(jobs, now);
  const running = sortJobsBySoonest(jobs.filter((job) => !isJobDone(job, now)));
  const done = jobs.filter((job) => isJobDone(job, now));
  const oldestDoneMs =
    done.length > 0 ? Math.min(...done.map((job) => Date.parse(job.end_date))) : null;
  const list: ListRow[] = [];
  if (summary.done > 0) {
    list.push({
      key: 'ready',
      title: t('overview.board.jobsReady', { count: summary.done }),
      detail:
        oldestDoneMs === null
          ? undefined
          : t('overview.board.oldestFinished', {
              age: formatDuration(Math.max(0, now - oldestDoneMs) / 1000),
            }),
      value: t('overview.board.ready'),
      tone: 'warning',
    });
  }
  for (const job of running) {
    list.push({
      key: String(job.job_id),
      title: t('overview.board.jobSubject', {
        name: data.productNames.get(job.job_id) ?? t('overview.board.unknownProduct'),
        count: job.runs,
      }),
      detail: t(activityI18nKey(job.activity_id), { id: job.activity_id }),
      value: formatDuration(secondsRemaining(job, now)),
      tone: jobSeverity(job, now),
    });
  }
  const nextJobMs = running.length > 0 ? Date.parse(running[0].end_date) : Number.NaN;
  const ready = summary.done > 0;
  return {
    ...blank(to, statusOf(feed, { needsPermission: data.needsReauth, isEmpty: jobs.length === 0 })),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(ready ? summary.done : summary.running),
      unit: t(ready ? 'overview.widgets.industry.ready' : 'overview.widgets.industry.running'),
      note: industrySummary(t, data, now),
      tone: industrySeverity(jobs, data.needsReauth, now),
    },
    rows: list,
    deadlines: Number.isNaN(nextJobMs)
      ? []
      : [{ at: nextJobMs, note: t('overview.board.nextJob'), severity: 'watch', to }],
    summary: industrySummary(t, data, now),
  };
};

const planetary: Builder = (feeds, { t, now }) => {
  const feed = feeds.planetary;
  const data = feed?.data ?? null;
  const to = '/planetary-industry';
  if (!data) return blank(to, statusOf(feed));
  const nextBatch = data.batches.find((batch) => batch.kind === 'running');
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: data.colonyCount === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(data.colonyCount),
      unit: t('overview.widgets.planetary.unit'),
      note: planetarySummary(t, data),
      tone: planetarySeverity(data) ?? 'clear',
    },
    rows: data.batches.map((batch) => ({
      key: `${batch.kind}:${batch.expiryMs ?? 'none'}`,
      title: t(`overview.board.batch.${batch.kind}`, { count: batch.colonies.length }),
      detail: batch.colonies.map((colony) => colony.name ?? `#${colony.planetId}`).join(', '),
      value:
        batch.kind === 'idle'
          ? t('overview.board.noProgram')
          : batch.kind === 'expired'
            ? t('overview.board.stopped')
            : formatDuration(Math.max(0, (batch.expiryMs ?? 0) - now) / 1000),
      tone: batch.severity,
    })),
    deadlines: nextBatch?.expiryMs
      ? [
          {
            at: nextBatch.expiryMs,
            note: t('overview.board.batch.running', { count: nextBatch.colonies.length }),
            severity: nextBatch.severity,
            to,
          },
        ]
      : [],
    summary: planetarySummary(t, data),
  };
};

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
      note: miningTaxSummary(t, data),
      tone: miningTaxSeverity(data) ?? 'clear',
    },
    rows: [
      {
        key: 'unpaid',
        title: t('overview.board.iskUnpaid'),
        value: formatIskCompact(data.unpaidIsk),
        iskAmount: data.unpaidIsk,
        tone: data.unpaidIsk > 0 ? 'watch' : 'clear',
      },
      {
        key: 'payees',
        title: t('overview.widgets.miningTax.payees'),
        detail:
          data.oldestUnpaidDays === null
            ? undefined
            : t('overview.widgets.miningTax.oldest', { days: data.oldestUnpaidDays }),
        value: count(data.payeeCount),
        tone: 'clear',
      },
      {
        key: 'unassigned',
        title: t('overview.board.unassigned'),
        value: count(data.unassignedCount),
        tone: data.unassignedCount > 0 ? 'watch' : 'clear',
      },
    ],
    summary: miningTaxSummary(t, data),
  };
};

function structureWhen(item: CorpBoardItem, t: Translate): string {
  if (item.timing === 'passed') return t('overview.board.structureDry');
  if (item.timing === 'untimed') return t('overview.board.structureOffline');
  // A clock shorter than CCP's hour-long cache may already be over, so it is not ticked down.
  if (item.withinStaleWindow) return t('overview.board.structureSoon');
  return formatDuration(Math.max(0, item.remainingMs ?? 0) / 1000);
}

const structures: Builder = (feeds, { t, now }) => {
  const feed = feeds.structures;
  const raw = feed?.data ?? null;
  const to = '/corp';
  if (!raw) return blank(to, statusOf(feed));
  const view = structuresView(raw, now);
  const items = view.items;
  // A grant lapsed: ask for it. No roles: a grant would not fix that, so say so.
  if (items === null) {
    return {
      ...blank(
        to,
        statusOf(feed, { needsPermission: view.needsReauth, isEmpty: !view.needsReauth })
      ),
      emptyMessage: t('overview.board.corpUnreadable'),
      summary: structuresSummary(t, view),
    };
  }
  const counts = structureCounts(items);
  const flagged = items.filter(
    (item) => item.kind !== 'structureFuel' || item.severity !== 'clear'
  );
  const clock = structuresDeadline(items, now);
  return {
    ...blank(to, statusOf(feed, { isEmpty: view.structureCount === 0 })),
    fetchedAt: view.fetchedAt,
    number: {
      value: count(counts.timers),
      unit: t('overview.board.reinforced'),
      note: structuresSummary(t, view),
      tone: structuresSeverity(view) ?? 'clear',
    },
    rows: flagged.map((item) => ({
      key: item.id,
      title: item.subject,
      detail:
        item.kind === 'structureTimer'
          ? structureStateLabel(item.detail)
          : item.kind === 'serviceOffline'
            ? t('overview.board.serviceOffline', { service: item.detail })
            : t('overview.board.fuelRunsOut'),
      value: structureWhen(item, t),
      tone: item.severity,
    })),
    deadlines: clock
      ? [
          {
            at: clock.atMs,
            note: t(`overview.board.structureDeadline.${clock.kind}`, { subject: clock.subject }),
            severity: clock.severity,
            to,
          },
        ]
      : [],
    summary: structuresSummary(t, view),
  };
};

const moonChunks: Builder = (feeds, { t, now }) => {
  const feed = feeds.moonChunks;
  const data = feed?.data ?? null;
  const to = '/corp';
  if (!data) return blank(to, statusOf(feed));
  if (data.chunks === null) {
    return {
      ...blank(
        to,
        statusOf(feed, { needsPermission: data.needsReauth, isEmpty: !data.needsReauth })
      ),
      emptyMessage: t('overview.board.corpUnreadable'),
      summary: moonChunksSummary(t, data, now),
    };
  }
  const chunks = [...data.chunks].sort((a, b) => a.deadlineMs - b.deadlineMs);
  const ready = chunks.filter((chunk) => chunk.detail === 'decay').length;
  const nextChunk = moonChunksDeadline(data.chunks, now);
  return {
    ...blank(to, statusOf(feed, { isEmpty: chunks.length === 0 })),
    fetchedAt: data.fetchedAt,
    number:
      ready > 0 || !nextChunk
        ? {
            value: count(ready),
            unit: t('overview.widgets.moonChunks.ready'),
            note: moonChunksSummary(t, data, now),
            tone: moonChunksSeverity(data, now) ?? 'clear',
          }
        : {
            value: formatCountdown(Math.max(0, nextChunk.deadlineMs - now) / 1000),
            unit: t('overview.widgets.moonChunks.untilNext'),
            note: moonChunksSummary(t, data, now),
            tone: moonChunksSeverity(data, now) ?? 'clear',
          },
    rows: chunks.map((chunk) => ({
      key: chunk.id,
      title: chunk.subject,
      detail: t(`overview.board.chunk.${chunk.detail === 'decay' ? 'decay' : 'arrival'}`),
      value: formatDuration(Math.max(0, chunk.deadlineMs - now) / 1000),
      tone: moonChunkSeverity(chunk, now),
    })),
    deadlines: nextChunk
      ? [
          {
            at: nextChunk.deadlineMs,
            note: t(
              `overview.board.chunkDeadline.${nextChunk.detail === 'decay' ? 'decay' : 'arrival'}`,
              { subject: nextChunk.subject }
            ),
            severity: moonChunkSeverity(nextChunk, now),
            to,
          },
        ]
      : [],
    summary: moonChunksSummary(t, data, now),
  };
};

const stock: Builder = (feeds, { t }) => {
  const feed = feeds.stock;
  const data = feed?.data ?? null;
  const to = STOCK_PATH;
  if (!data) return blank(to, statusOf(feed));
  const board = data.board;
  if (board === null) return blank(to, statusOf(feed, { isEmpty: true }));
  // Counts need the orders list; until it is cached they are unknown, not zero.
  if (!board.counted) return blank(to, statusOf(feed, { hasData: false, loading: true }));
  const needing = board.markets.filter(
    (market) => market.summary.out > 0 || market.summary.low > 0
  );
  const detail = (summary: (typeof board.markets)[number]['summary']) =>
    [
      summary.readyToList > 0 && t('overview.board.stockReady', { count: summary.readyToList }),
      summary.costToFill > 0 &&
        t('overview.board.stockToSource', { isk: formatIskCompact(summary.costToFill) }),
    ]
      .filter(Boolean)
      .join(' · ');
  return {
    ...blank(to, statusOf(feed)),
    number: {
      value: count(board.totals.out),
      unit: t('overview.board.stockOut'),
      note: t('overview.widgets.stock.low', { count: board.totals.low }),
      tone: stockBoardSeverity(board) ?? 'clear',
    },
    rows: needing.map((market) => {
      const out = market.summary.out > 0;
      return {
        key: market.listId,
        // "Amarr VIII (Oris) - Emperor Family Academy" reads as its first part on a widget.
        title: market.name.split(' - ')[0],
        detail: detail(market.summary) || undefined,
        value: out
          ? t('stockTargets.need.out', { count: market.summary.out })
          : t('stockTargets.need.low', { count: market.summary.low }),
        tone: out ? 'critical' : 'warning',
        to: `${STOCK_PATH}/${encodeURIComponent(market.listId)}`,
      };
    }),
    summary: stockBoardSummary(t, board),
  };
};

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
      note: priceAlertsSummary(t, data),
      tone: priceAlertsSeverity(data) ?? 'clear',
    },
    rows: data.alerts.map((alert) => ({
      key: String(alert.typeId),
      title: alert.name,
      detail: t(`overview.board.priceAlertTargetLabel.${alert.direction}`, {
        isk: formatIskCompact(alert.targetPrice),
      }),
      value: alert.price === null ? UNKNOWN : formatIskCompact(alert.price),
      iskAmount: alert.price ?? undefined,
      tone: alert.crossed ? 'warning' : 'clear',
    })),
    summary: priceAlertsSummary(t, data),
  };
};

const incursions: Builder = (feeds, { t }) => {
  const feed = feeds.incursions;
  const data = feed?.data ?? null;
  const to = '/travel/route';
  if (!data) return blank(to, statusOf(feed));
  return {
    ...blank(to, statusOf(feed)),
    number: {
      value: count(data.rows.length),
      unit: t('overview.widgets.incursions.unit'),
      note: incursionsSummary(t, data),
      tone: incursionsSeverity(data) ?? 'clear',
    },
    rows: data.rows.map((row) => {
      const system =
        data.systemNames.get(row.stagingSystemId) ??
        t('travel.stops.unnamed', { id: row.stagingSystemId });
      const constellation =
        data.constellationNames.get(row.constellationId) ??
        t('travel.incursions.constellation', { id: row.constellationId });
      return {
        key: String(row.constellationId),
        title: system,
        detail: t('overview.board.incursionsDetailLabel', {
          state: t(`travel.incursions.state.${row.state}`),
          constellation,
        }),
        value: incursionJumpsWhen(t, row, data.jumpsStatus),
        tone: 'clear' as DeadlineSeverity,
        to: routeToHref(row.stagingSystemId),
      };
    }),
    summary: incursionsSummary(t, data),
  };
};

const BUILDERS: Readonly<Record<string, Builder>> = {
  wallet,
  training,
  sp,
  comingUp,
  mail,
  orders,
  contracts,
  industry,
  planetary,
  miningTax,
  structures,
  moonChunks,
  stock,
  priceWatch,
  incursions,
};

/**
 * Kinds in the catalogue whose data the next stage adds, and kinds a newer
 * build wrote that this one has never heard of. Both read as "nothing to show
 * yet": a loading-free empty state the pilot can remove, never a spinner that
 * would not end.
 */
function placeholder(kind: string): KindView {
  return {
    ...blank('/overview', {
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
  const builder = BUILDERS[kind];
  if (!builder) return placeholder(kind);
  return builder(feeds, ctx);
}

/** Whether `kind` is in the catalogue at all (a kind from a newer build is not). */
export function isKnownKindId(kind: string): boolean {
  return getKind(kind) !== undefined;
}
