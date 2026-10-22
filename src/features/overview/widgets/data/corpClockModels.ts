/**
 * Corp clock builders: Due soon, Offline services and Corp industry jobs.
 * Same contract as `models.ts`: pure, derived at render time.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { buildCorpBoard, type CorpBoardItem } from '@/engine/corp/board';
import {
  DEADLINE_STRIP_DAYS,
  DUE_SOON_WINDOW_MS,
  deadlinesByDay,
  dueSoon,
  groupBoardByKind,
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
import { fractionBar } from './cellKit';
import { hbarsFromRows } from './chartBuilders';
import type { CorpJobsFeed } from './corpFeeds';
import { toBoardStarbases } from './corpStarbaseModels';
import { elapsedShare } from './industryModels';
import { shortStructureName } from './structureModels';
import type { NumberSecondary, TableCell, TableModel, TableRowModel, Translate } from './types';

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

export const corpDeadlines: Builder = (feeds, { t, now, zone }) => {
  const list = [feeds.structures, feeds.moonChunks, feeds.corpJobs] as const;
  // A feed still on its first load: nothing to say until every read has an answer.
  const pending = list.find((feed) => !feed || (!feed.data && feed.loading));
  // Towers only add clocks: a Character may not read them, so they wait for an answer but never block one.
  const towers = feeds.corpStarbases;
  const towersPending = towers && !towers.data && towers.loading ? towers : undefined;
  if (list.some((feed) => !feed) || pending !== undefined || towersPending !== undefined) {
    return blank(null, statusOf(pending ?? towersPending));
  }

  // A source this Character cannot read contributes undefined, never [].
  const structures = feeds.structures?.data?.structures ?? undefined;
  // `chunks` says whether the read was allowed; `extractions` is what the board ranks.
  const chunks = feeds.moonChunks?.data?.chunks ?? undefined;
  const extractions = chunks ? (feeds.moonChunks?.data?.extractions ?? []) : undefined;
  const jobsData = feeds.corpJobs?.data?.readable ? feeds.corpJobs.data : undefined;
  const towersData = towers?.data?.readable ? towers.data : undefined;

  if (
    structures === undefined &&
    chunks === undefined &&
    jobsData === undefined &&
    towersData === undefined
  ) {
    const failed = [...list, towers].find((feed) => feed && !feed.data && feed.error);
    if (failed) return blank(null, statusOf(failed));
    const needsReauth =
      Boolean(feeds.structures?.data?.needsReauth) ||
      Boolean(feeds.moonChunks?.data?.needsReauth) ||
      Boolean(feeds.corpJobs?.data?.needsReauth);
    return corpUnreadable(null, feeds.structures, needsReauth, t);
  }

  const items = buildCorpBoard({
    nowMs: now,
    staleWindowMs: CORP_CACHE_WINDOW_MS,
    structures,
    extractions,
    jobs: jobsData ? toBoardJobs(jobsData.jobs, jobsData.typeNames) : undefined,
    starbases: towersData ? toBoardStarbases(towersData, now) : undefined,
  });
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

  const next = timed[0];
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
      { key: 'what', label: t('overview.widgets.corpDeadlines.col.what'), priority: 2 },
      {
        key: 'when',
        label: t('overview.widgets.corpDeadlines.col.when'),
        align: 'end',
        priority: 1,
      },
    ],
    rows: timed.map((item): TableRowModel => ({
      key: item.id,
      cells: [subjectOf(item), whatOf(item, t), whenOf(item, t)],
      tone: item.severity,
    })),
  };
  const fetched = [
    structures ? feeds.structures?.data?.fetchedAt : null,
    chunks ? feeds.moonChunks?.data?.fetchedAt : null,
    jobsData?.fetchedAt,
    towersData?.fetchedAt,
  ].filter((at): at is Date => at instanceof Date);

  return {
    ...blank(null, {
      ...statusOf(undefined, {
        loading: [...list, towers].some((feed) => feed?.loading),
        hasData: true,
        isEmpty: timed.length === 0,
      }),
      // Any failed read still draws what the other feeds gave, flagged as failed.
      error: [...list, towers].some((feed) => Boolean(feed && !feed.data && feed.error)),
    }),
    fetchedAt:
      fetched.length > 0 ? fetched.reduce((oldest, at) => (at < oldest ? at : oldest)) : null,
    fromCache: jobsData?.fromCache ?? false,
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
    rows: timed.map((item) => ({
      key: item.id,
      title: subjectOf(item),
      detail: whatOf(item, t),
      value: whenOf(item, t),
      tone: item.severity,
    })),
    table,
    summary: t('overview.widgets.corpDeadlines.summary', {
      count: due.total,
      overdue: due.overdue,
    }),
    chart: dayChart(t, items, now, zone),
  };
};

// --- Offline services -------------------------------------------------------------

export const corpServices: Builder = (feeds, { t, now }) => {
  const feed = feeds.structures;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (data.structures === null) return corpUnreadable(null, feed, data.needsReauth, t);

  const items = buildCorpBoard({
    nowMs: now,
    staleWindowMs: CORP_CACHE_WINDOW_MS,
    structures: data.structures,
  });
  const services = [...(groupBoardByKind(items).get('serviceOffline') ?? [])].sort(
    (a, b) =>
      shortStructureName(a.subject).localeCompare(shortStructureName(b.subject)) ||
      a.detail.localeCompare(b.detail)
  );

  const perStructure = new Map<string, number>();
  for (const item of services) {
    perStructure.set(item.subject, (perStructure.get(item.subject) ?? 0) + 1);
  }
  const [most] = [...perStructure].sort((a, b) => b[1] - a[1]);
  const secondary: NumberSecondary | undefined = most
    ? {
        text:
          perStructure.size > 1
            ? t('overview.widgets.corpServices.most', {
                name: shortStructureName(most[0]),
                count: most[1],
              })
            : shortStructureName(most[0]),
      }
    : undefined;

  return {
    ...blank(null, statusOf(feed, { isEmpty: services.length === 0 })),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(services.length),
      unit: t('overview.widgets.corpServices.unit'),
      secondary,
      tone: worstSeverity(services.map((item) => item.severity)),
    },
    rows: services.map((item) => ({
      key: item.id,
      title: shortStructureName(item.subject),
      detail: item.detail,
      value: t('overview.board.structureOffline'),
      tone: item.severity,
    })),
    table: {
      columns: [
        { key: 'structure', label: t('overview.widgets.corpServices.col.structure'), priority: 0 },
        { key: 'service', label: t('overview.widgets.corpServices.col.service'), priority: 1 },
      ],
      rows: services.map((item) => ({
        key: item.id,
        cells: [shortStructureName(item.subject), item.detail],
        tone: item.severity,
      })),
    },
    summary: t('overview.widgets.corpServices.summary', {
      count: services.length,
      structures: perStructure.size,
    }),
  };
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
