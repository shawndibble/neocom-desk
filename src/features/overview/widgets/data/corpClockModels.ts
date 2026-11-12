/**
 * Corp clock builders: Due soon and Corp industry jobs.
 * Same contract as `models.ts`: pure, derived at render time.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import {
  buildCorpBoard,
  mergeCorpBoards,
  type CorpBoardItem,
  type CorpBoardSources,
} from '@/engine/corp/board';
import {
  DEADLINE_STRIP_DAYS,
  DUE_SOON_WINDOW_MS,
  deadlinesByDay,
  dueSoon,
} from '@/engine/corp/deadlines';
import type { DayZone } from '@/engine/localDay';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import { structureStateLabel, toBoardJobs } from '@/features/corp/boardSources';
import { activityI18nKey, isCompletingSoon } from '@/features/industry/jobs';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatDateOnly } from '@/lib/timestamp';
import { CORP_CACHE_WINDOW_MS } from '../../data/corpCards';
import type { BarsChartModel } from '../charts/types';
import { blank, corpUnreadable, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import { corpCell, fractionBar } from './cellKit';
import { hbarsFromRows } from './chartBuilders';
import type { CorpLabel } from '@/features/corp/corpTicker';
import type { CorpDeadlinesSlice, CorpJobsFeed } from './corpFeeds';
import { toBoardHubFuel, toBoardSovereignty } from './corpSovereigntyModels';
import { toBoardStarbases } from './corpStarbaseModels';
import { elapsedShare } from './industryModels';
import { shortStructureName } from './structureModels';
import type {
  BuildContext,
  Feeds,
  KindView,
  NumberSecondary,
  RowDetailModel,
  TableCell,
  TableModel,
  TableRowModel,
} from './types';
import type { Translate } from '@/lib/translate';

// --- Due soon ---------------------------------------------------------------------

function subjectOf(item: CorpBoardItem): string {
  return item.kind === 'jobDelivery' ? item.subject : shortStructureName(item.subject);
}

function whatOf(item: CorpBoardItem, t: Translate): string {
  switch (item.kind) {
    case 'structureFuel':
      return t(item.timing === 'passed' ? 'corp.board.detail.fuelDry' : 'corp.board.detail.fuel');
    case 'structureTimer':
      return item.detail === 'unanchoring'
        ? t('corp.board.detail.unanchoring')
        : t('corp.board.detail.stateTimer', { state: structureStateLabel(item.detail) });
    case 'moonExtraction':
      return t(
        item.detail === 'decay' ? 'corp.board.detail.moonDecay' : 'corp.board.detail.moonArrival'
      );
    case 'jobDelivery':
      return t('corp.board.detail.jobReady');
    case 'serviceOffline':
      return t('corp.board.detail.serviceOffline', { service: item.detail });
    case 'sovRaid':
      return t(`corp.board.detail.sovRaid.${item.detail}`);
    case 'sovHubFuel':
      return t('corp.board.detail.hubReagents');
  }
}

/** The board's own clock wording: nothing shorter than the cache window is ticked down. */
function whenOf(item: CorpBoardItem, t: Translate): string {
  if (item.timing === 'untimed') return t('corp.board.noTimer');
  if (item.timing === 'passed') return t('corp.board.dry');
  if (item.withinStaleWindow) return t('corp.board.underCacheWindow');
  const remainingMs = item.remainingMs ?? 0;
  if (remainingMs <= 0) {
    return t('corp.board.overdueFor', { duration: formatDuration(-remainingMs / 1000) });
  }
  return formatCountdown(remainingMs / 1000);
}

/** The Deadline Strip as day bars; absent when nothing lands in it. */
function dayChart(
  t: Translate,
  items: readonly CorpBoardItem[],
  now: number,
  zone: DayZone
): BarsChartModel | undefined {
  const days = deadlinesByDay(items, now, DEADLINE_STRIP_DAYS, zone);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  if (total === 0) return undefined;
  const labelOf = (startMs: number, index: number) =>
    index === 0 ? t('corp.standing.strip.today') : formatDateOnly(new Date(startMs), zone);
  const severityOf = (severity: DeadlineSeverity | null) =>
    t(`corp.board.severity.${severity ?? 'clear'}`);
  const detail = days
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.count > 0)
    .map(({ day, index }) =>
      t('corp.standing.strip.describeDay', {
        day: labelOf(day.startMs, index),
        count: day.count,
        severity: severityOf(day.severity),
      })
    )
    .join('; ');
  return {
    kind: 'bars',
    values: days.map((day) => day.count),
    max: String(Math.max(...days.map((day) => day.count))),
    xStart: t('corp.standing.strip.today'),
    xEnd: formatDateOnly(new Date(days[days.length - 1]!.startMs), zone),
    tips: days.map((day, index) => ({
      title: labelOf(day.startMs, index),
      rows: [{ label: severityOf(day.severity), value: String(day.count) }],
    })),
    note: t('overview.widgets.corpDeadlines.chartNote', { days: days.length }),
    summary: t('corp.standing.strip.describe', { days: days.length, detail }),
  };
}

/** One corporation's Due soon reads, whatever scope fetched them; absent or null means not read. */
type DeadlineReads = Partial<Omit<CorpDeadlinesSlice, 'corporationId' | 'failed'>>;

/** The readable reads as the board's sources, and when they landed. */
function readableSources(reads: DeadlineReads, now: number) {
  // A source this Character cannot read contributes undefined, never [].
  const structures = reads.structures?.structures ?? undefined;
  // `chunks` says whether the read was allowed; `extractions` is what the board ranks.
  const chunks = reads.moonChunks?.chunks ?? undefined;
  const extractions = chunks ? (reads.moonChunks?.extractions ?? []) : undefined;
  const jobs = reads.jobs?.readable ? reads.jobs : undefined;
  const towers = reads.starbases?.readable ? reads.starbases : undefined;
  const raids = reads.sovereignty?.readable ? reads.sovereignty : undefined;
  const fetched = [
    structures ? reads.structures?.fetchedAt : null,
    chunks ? reads.moonChunks?.fetchedAt : null,
    jobs?.fetchedAt,
    towers?.fetchedAt,
    raids?.fetchedAt,
  ].filter((at): at is Date => at instanceof Date);
  return {
    readable:
      structures !== undefined ||
      chunks !== undefined ||
      jobs !== undefined ||
      towers !== undefined ||
      raids !== undefined,
    sources: {
      structures,
      extractions,
      jobs: jobs ? toBoardJobs(jobs.jobs, jobs.typeNames) : undefined,
      starbases: towers ? toBoardStarbases(towers, now) : undefined,
      sovereignty: raids ? toBoardSovereignty(raids) : undefined,
      hubFuel: raids ? toBoardHubFuel(raids) : undefined,
    } satisfies Omit<CorpBoardSources, 'nowMs' | 'staleWindowMs'>,
    fetched,
    fromCache: Boolean(jobs?.fromCache),
  };
}

const boardOf = (sources: ReturnType<typeof readableSources>['sources'], now: number) =>
  buildCorpBoard({ nowMs: now, staleWindowMs: CORP_CACHE_WINDOW_MS, ...sources });

/** How the read went, for the view: the feeds' state, and when the oldest read landed. */
interface DeadlinesRead {
  loading: boolean;
  /** A read failed while others answered: the rest draws, flagged. */
  error: boolean;
  fetched: readonly Date[];
  fromCache: boolean;
}

/**
 * The widget over a built board. `labels` names each row's corporation, given only when
 * the rows come from more than one.
 */
function deadlinesView(
  board: readonly CorpBoardItem[],
  read: DeadlinesRead,
  { t, now, zone }: Pick<BuildContext, 't' | 'now' | 'zone'>,
  labels?: ReadonlyMap<number, CorpLabel>
): KindView {
  // A finished job is "Ready to deliver" on Corp industry jobs, not a deadline.
  const items = board.filter((item) => item.kind !== 'jobDelivery');
  // The board is already soonest-first; an offline service has no clock, so it is no deadline.
  const timed = items.filter((item) => item.timing !== 'untimed');
  const due = dueSoon(items, now);
  const dueTone = worstSeverity(
    timed
      .filter(
        (item) =>
          item.timing === 'passed' || (item.deadlineMs ?? Infinity) - now <= DUE_SOON_WINDOW_MS
      )
      .map((item) => item.severity)
  );
  const corpOf = (item: CorpBoardItem) =>
    labels && item.corporationId !== undefined ? labels.get(item.corporationId) : undefined;

  // Next is the soonest item still ahead; a dry or overdue one is listed, not "next".
  const next = timed.find((item) => item.timing === 'timed' && (item.deadlineMs ?? 0) > now);
  const secondary: NumberSecondary | undefined = next
    ? {
        text: t('overview.widgets.corpDeadlines.next', {
          name: subjectOf(next),
          when: whenOf(next, t),
        }),
      }
    : undefined;

  const table: TableModel = {
    columns: [
      { key: 'subject', label: t('overview.widgets.corpDeadlines.col.subject'), priority: 0 },
      ...(labels
        ? [{ key: 'corp', label: t('overview.widgets.corpDeadlines.col.corp'), priority: 3 }]
        : []),
      { key: 'what', label: t('overview.widgets.corpDeadlines.col.what'), priority: 2 },
      {
        key: 'when',
        label: t('overview.widgets.corpDeadlines.col.when'),
        align: 'end',
        priority: 1,
      },
    ],
    rows: timed.map((item): TableRowModel => {
      const corp = corpOf(item);
      return {
        key: item.id,
        cells: [
          subjectOf(item),
          ...(labels ? [corp ? corpCell(corp) : UNKNOWN] : []),
          whatOf(item, t),
          whenOf(item, t),
        ],
        tone: item.severity,
      };
    }),
  };

  return {
    ...blank(null, {
      ...statusOf(undefined, {
        loading: read.loading,
        hasData: true,
        isEmpty: timed.length === 0,
      }),
      error: read.error,
    }),
    fetchedAt:
      read.fetched.length > 0
        ? read.fetched.reduce((oldest, at) => (at < oldest ? at : oldest))
        : null,
    fromCache: read.fromCache,
    number: {
      value: count(due.total),
      unit: t('corp.standing.dueSoon'),
      secondary,
      notes:
        timed.length === 0
          ? undefined
          : [
              due.overdue > 0
                ? t('corp.standing.dueSoonOverdue', { count: due.overdue })
                : t('corp.standing.dueSoonNoneLate'),
            ],
      tone: due.total > 0 ? dueTone : 'clear',
    },
    rows: timed.map((item) => {
      const corp = corpOf(item);
      return {
        key: item.id,
        title: subjectOf(item),
        detail: corp ? `${corp.ticker} · ${whatOf(item, t)}` : whatOf(item, t),
        value: whenOf(item, t),
        tone: item.severity,
      };
    }),
    table,
    summary: t('overview.widgets.corpDeadlines.summary', {
      count: due.total,
      overdue: due.overdue,
    }),
    chart: dayChart(t, items, now, zone),
  };
}

/** Due soon across every corporation the pilot's Characters can read: one deadline-ranked list. */
function allCorpDeadlines(feeds: Feeds, ctx: BuildContext): KindView {
  const feed = feeds.corpDeadlinesAll;
  const data = feed?.data;
  if (!feed || !data) return blank(null, statusOf(feed));
  const reads = data.corporations.map((slice) => ({
    corporationId: slice.corporationId,
    read: readableSources(slice, ctx.now),
  }));
  const readable = reads.filter(({ read }) => read.readable);
  if (readable.length === 0) {
    // A read failed and none answered: Retry, not "your roles don't cover this".
    if (data.corporations.some((slice) => slice.failed)) {
      return blank(null, { ...statusOf(feed), error: true });
    }
    const needsReauth = data.corporations.some(
      (slice) =>
        slice.structures?.needsReauth || slice.moonChunks?.needsReauth || slice.jobs?.needsReauth
    );
    return corpUnreadable(null, feed, needsReauth, ctx.t);
  }
  const board = mergeCorpBoards(
    readable.map(({ corporationId, read }) => ({
      corporationId,
      items: boardOf(read.sources, ctx.now),
    }))
  );
  return deadlinesView(
    board,
    {
      loading: feed.loading,
      error: data.corporations.some((slice) => slice.failed),
      fetched: readable.flatMap(({ read }) => read.fetched),
      fromCache: readable.some(({ read }) => read.fromCache),
    },
    ctx,
    // One corporation's rows need no column naming it.
    readable.length > 1 ? data.labels : undefined
  );
}

export const corpDeadlines: Builder = (feeds, ctx) => {
  if (ctx.scopeAll) return allCorpDeadlines(feeds, ctx);
  const { t, now } = ctx;
  const list = [feeds.structures, feeds.moonChunks, feeds.corpJobs] as const;
  // A feed still on its first load: nothing to say until every read has an answer.
  const pending = list.find((feed) => !feed || (!feed.data && feed.loading));
  // Towers only add clocks: a Character may not read them, so they wait for an answer but never block one.
  const towers = feeds.corpStarbases;
  const towersPending = towers && !towers.data && towers.loading ? towers : undefined;
  // Raid windows are the same kind of extra: waited for, never blocking.
  const raids = feeds.corpSovereignty;
  const raidsPending = raids && !raids.data && raids.loading ? raids : undefined;
  const extraPending = towersPending ?? raidsPending;
  if (list.some((feed) => !feed) || pending !== undefined || extraPending !== undefined) {
    return blank(null, statusOf(pending ?? extraPending));
  }

  const read = readableSources(
    {
      structures: feeds.structures?.data,
      moonChunks: feeds.moonChunks?.data,
      jobs: feeds.corpJobs?.data,
      starbases: towers?.data,
      sovereignty: raids?.data,
    },
    now
  );
  const all = [...list, towers, raids];
  if (!read.readable) {
    const failed = all.find((feed) => feed && !feed.data && feed.error);
    if (failed) return blank(null, statusOf(failed));
    const needsReauth =
      Boolean(feeds.structures?.data?.needsReauth) ||
      Boolean(feeds.moonChunks?.data?.needsReauth) ||
      Boolean(feeds.corpJobs?.data?.needsReauth);
    return corpUnreadable(null, feeds.structures, needsReauth, t);
  }

  return deadlinesView(
    boardOf(read.sources, now),
    {
      loading: all.some((feed) => feed?.loading),
      // Any failed read still draws what the other feeds gave, flagged as failed.
      error: all.some((feed) => Boolean(feed && !feed.data && feed.error)),
      fetched: read.fetched,
      fromCache: read.fromCache,
    },
    ctx
  );
};

// --- Corp industry jobs -----------------------------------------------------------

interface JobFacts {
  job: CorporationIndustryJob;
  done: boolean;
  endMs: number;
  label: string;
  tone: DeadlineSeverity;
}

/** Active and ready jobs: finished ones first (oldest waiting first), then running ones by soonest end. */
function jobFacts(data: CorpJobsFeed, t: Translate, now: number): JobFacts[] {
  const facts = data.jobs
    .filter((job) => job.status === 'active' || job.status === 'ready')
    .map((job): JobFacts => {
      const endMs = Date.parse(job.end_date);
      // ESI leaves a finished job `active` past its end, so the clock counts too.
      const done = job.status === 'ready' || now >= endMs;
      const name =
        (job.product_type_id === undefined ? undefined : data.typeNames.get(job.product_type_id)) ??
        data.typeNames.get(job.blueprint_type_id) ??
        t('overview.board.unknownProduct');
      return {
        job,
        done,
        endMs,
        label: t('overview.board.jobSubject', { name, count: job.runs }),
        tone: done ? 'warning' : isCompletingSoon(job, now) ? 'watch' : 'clear',
      };
    });
  const byEnd = (a: JobFacts, b: JobFacts) => a.endMs - b.endMs;
  return [...facts.filter((f) => f.done).sort(byEnd), ...facts.filter((f) => !f.done).sort(byEnd)];
}

export const corpJobs: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpJobs;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  const facts = jobFacts(data, t, now);
  const ready = facts.filter((f) => f.done);
  const running = facts.filter((f) => !f.done);
  const next = running[0];
  // Under CCP's hour-long cache a finish time may already be past, so it is not ticked down.
  const left = (f: JobFacts) => {
    const remainingMs = f.endMs - now;
    return remainingMs < CORP_CACHE_WINDOW_MS
      ? t('corp.board.underCacheWindow')
      : formatCountdown(remainingMs / 1000);
  };

  const secondary: NumberSecondary | undefined =
    ready.length > 0
      ? { text: t('overview.widgets.corpJobs.ready', { count: ready.length }) }
      : next
        ? {
            text: t('overview.widgets.corpJobs.next', {
              name: next.label,
              duration: left(next),
            }),
          }
        : undefined;

  const endsCell = (f: JobFacts): TableCell => {
    if (f.done) return t('overview.board.ready');
    const text = left(f);
    const share = elapsedShare(Date.parse(f.job.start_date), f.endMs, now);
    const bar = share === null ? undefined : fractionBar(share, 1);
    return bar === undefined ? text : { text, bar };
  };
  const activityOf = (job: CorporationIndustryJob) =>
    t(activityI18nKey(job.activity_id), { id: job.activity_id });

  const detailOf = (f: JobFacts): RowDetailModel => ({
    title: f.label,
    facts: [
      { label: t('overview.widgets.corpJobs.col.activity'), value: activityOf(f.job) },
      {
        label: t('overview.widgets.corpJobs.col.installer'),
        value: data.installerNames.get(f.job.installer_id) ?? UNKNOWN,
      },
      {
        label: t('overview.widgets.corpJobs.col.ends'),
        value: f.done ? t('overview.board.ready') : left(f),
      },
    ],
  });

  return {
    ...blank(null, statusOf(feed, { isEmpty: facts.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(running.length),
      unit: t('overview.widgets.corpJobs.unit'),
      secondary,
      tone: worstSeverity(facts.map((f) => f.tone)),
    },
    rows: facts.map((f) => ({
      key: String(f.job.job_id),
      title: f.label,
      detail: activityOf(f.job),
      value: f.done ? t('overview.board.ready') : left(f),
      tone: f.tone,
    })),
    table: {
      columns: [
        { key: 'product', label: t('overview.widgets.corpJobs.col.product'), priority: 0 },
        { key: 'ends', label: t('overview.widgets.corpJobs.col.ends'), align: 'end', priority: 1 },
        // Product and time left are the row; who installed it and how read fine without at phone width.
        {
          key: 'installer',
          label: t('overview.widgets.corpJobs.col.installer'),
          priority: 2,
          hideNarrow: true,
        },
        {
          key: 'activity',
          label: t('overview.widgets.corpJobs.col.activity'),
          priority: 3,
          hideNarrow: true,
        },
      ],
      rows: facts.map((f): TableRowModel => ({
        key: String(f.job.job_id),
        cells: [
          f.label,
          endsCell(f),
          data.installerNames.get(f.job.installer_id) ?? UNKNOWN,
          activityOf(f.job),
        ],
        tone: f.tone,
        detail: detailOf(f),
      })),
    },
    summary: t('overview.widgets.corpJobs.summary', {
      running: running.length,
      ready: ready.length,
    }),
    chart:
      hbarsFromRows(
        t,
        facts.map((f) => {
          const seconds = f.done ? 0 : (f.endMs - now) / 1000;
          return {
            key: String(f.job.job_id),
            label: f.label,
            value: seconds,
            text: f.done ? t('overview.board.ready') : left(f),
            color: f.done ? ('warning' as const) : ('accent' as const),
          };
        }),
        t('overview.widgets.corpJobs.chartNote')
      ) ?? undefined,
  };
};
