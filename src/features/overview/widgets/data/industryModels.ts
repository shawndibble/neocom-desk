/**
 * Industry builder: jobs, slots and the Gantt chart. Same contract as `models.ts`:
 * pure, derived at render time.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import {
  activityI18nKey,
  isJobDone,
  secondsRemaining,
  sortJobsBySoonest,
  summarizeJobs,
} from '@/features/industry/jobs';
import { formatCountdown } from '@/lib/duration';
import { jobSeverity, industrySeverity } from '../../data/boardSeverity';
import { industrySummary } from '../../data/boardSummary';
import type { IndustryBoardData, IndustryCharacterSlots } from '../../data/boardData';
import {
  aggregateJobSlotSummary,
  JOB_SLOT_CATEGORIES,
  type JobSlotCategory,
} from '@/engine/industry/jobSlots';
import { ganttAxis } from '../charts/geometry';
import type { ChartModel } from '../charts/types';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import { hbarsFromRows } from './chartBuilders';
import type {
  NumberSecondary,
  TableCell,
  TableColumn,
  TableModel,
  TableRowModel,
  Translate,
} from './types';

const C = 'overview.widgets.chart';

export function elapsedShare(startMs: number, endMs: number, now: number): number | null {
  const span = endMs - startMs;
  if (!Number.isFinite(span) || span <= 0) return null;
  return Math.min(1, Math.max(0, (now - startMs) / span));
}

// --- Industry ---------------------------------------------------------------------

interface JobFacts {
  key: string;
  label: string;
  done: boolean;
  startMs: number;
  endMs: number;
  tone: DeadlineSeverity;
  /** Time left, or "Ready". */
  when: string;
  progress: number | null;
  activity: string;
  location: string | undefined;
}

/** "Jita IV - Moon 4 - Caldari Navy Assembly Plant" reads as where it is by its first part. */
function shortLocation(name: string | undefined): string | undefined {
  return name?.split(' - ')[0];
}

/** Finished jobs first (oldest waiting first), then running ones by soonest end. */
function jobFacts(
  data: IndustryBoardData,
  jobs: IndustryBoardData['jobs'],
  t: Translate,
  now: number
): JobFacts[] {
  const label = (job: IndustryBoardData['jobs'][number]) =>
    t('overview.board.jobSubject', {
      name: data.productNames.get(job.job_id) ?? t('overview.board.unknownProduct'),
      count: job.runs,
    });
  const facts = (job: IndustryBoardData['jobs'][number]): JobFacts => {
    const done = isJobDone(job, now);
    const endMs = Date.parse(job.end_date);
    const progress = done ? 1 : elapsedShare(Date.parse(job.start_date), endMs, now);
    return {
      key: String(job.job_id),
      label: label(job),
      done,
      startMs: Date.parse(job.start_date),
      endMs,
      tone: done ? 'warning' : jobSeverity(job, now),
      when: done ? t('overview.board.ready') : formatCountdown(secondsRemaining(job, now)),
      progress,
      activity: t(activityI18nKey(job.activity_id), { id: job.activity_id }),
      location: shortLocation(data.locationNames?.get(job.station_id)),
    };
  };
  const done = jobs
    .filter((job) => isJobDone(job, now))
    .sort((a, b) => Date.parse(a.end_date) - Date.parse(b.end_date))
    .map(facts);
  const running = sortJobsBySoonest(jobs.filter((job) => !isJobDone(job, now))).map(facts);
  return [...done, ...running];
}

const percent = (share: number | null): TableCell =>
  share === null ? UNKNOWN : { text: `${Math.round(share * 100)}%`, bar: share };

type SlotPools = Record<JobSlotCategory, { open: number; max: number }>;

/** Free / max per pool for one Character right now; an over-capacity pool reads 0 free, never negative. */
function slotPools(row: IndustryCharacterSlots, now: number): SlotPools {
  const summary = aggregateJobSlotSummary([row], now);
  const pools = {} as SlotPools;
  for (const category of JOB_SLOT_CATEGORIES) {
    const pool = summary[category] ?? { open: 0, max: 0 };
    pools[category] = { open: Math.max(0, pool.open), max: pool.max };
  }
  return pools;
}

interface SlotRow {
  row: IndustryCharacterSlots;
  pools: SlotPools;
  free: number;
  max: number;
}

/** Character · Manufacturing · Science · Reactions, each "free/max". */
function slotsTable(t: Translate, rows: readonly SlotRow[]): TableModel {
  const W = 'overview.widgets.industry';
  return {
    columns: [
      { key: 'character', label: t(`${W}.col.character`), nameFloor: true },
      { key: 'mfg', label: t(`${W}.col.manufacturing`), align: 'end', priority: 1 },
      { key: 'sci', label: t(`${W}.col.science`), align: 'end', priority: 2 },
      { key: 'react', label: t(`${W}.col.reactions`), align: 'end', priority: 3 },
    ],
    rows: rows.map(({ row, pools }) => ({
      key: String(row.characterId),
      cells: [
        row.characterName,
        ...JOB_SLOT_CATEGORIES.map((c) => `${pools[c].open}/${pools[c].max}`),
      ],
    })),
    footer: t(`${W}.slotsFooter`),
  };
}

/** Free slots per Character as bars, the most free the longest. */
function slotsChart(t: Translate, rows: readonly SlotRow[]): ChartModel | undefined {
  return (
    hbarsFromRows(
      t,
      rows.map(({ row, free, max }) => ({
        key: String(row.characterId),
        label: row.characterName,
        value: free,
        text: t('overview.widgets.industry.slotsOf', { free, max }),
      })),
      t(`${C}.industry.slotsNote`)
    ) ?? undefined
  );
}

export const industry: Builder = (feeds, { t, now, activeCharacterId, scopeAll }) => {
  const feed = feeds.industry;
  const data = feed?.data ?? null;
  const to = '/industry';
  if (!data) return blank(to, statusOf(feed));
  // `loadIndustryBoard` reads every Character's jobs and skills; a widget on
  // one Character narrows to the header Character's.
  const everyone = scopeAll || activeCharacterId === null;
  const jobs = everyone ? (data.allJobs ?? data.jobs) : data.jobs;
  const slotRows: SlotRow[] = (data.slots ?? [])
    .filter((row) => everyone || row.characterId === activeCharacterId)
    .map((row) => {
      const pools = slotPools(row, now);
      const all = JOB_SLOT_CATEGORIES.map((c) => pools[c]);
      return {
        row,
        pools,
        free: all.reduce((sum, p) => sum + p.open, 0),
        max: all.reduce((sum, p) => sum + p.max, 0),
      };
    });
  const slotNotes =
    slotRows.length > 0
      ? [
          t('overview.widgets.industry.slotsFree', {
            count: slotRows.reduce((sum, r) => sum + r.free, 0),
          }),
        ]
      : undefined;
  // On All characters the Table and Chart answer "who has a slot free", not "which job ends next".
  const slotView = everyone && slotRows.length > 0;
  const summary = summarizeJobs(jobs, now);
  const running = sortJobsBySoonest(jobs.filter((job) => !isJobDone(job, now)));
  const facts = jobFacts(data, jobs, t, now);
  const showLocation = facts.some((job) => job.location !== undefined);

  const columns: TableColumn[] = [
    { key: 'job', label: t('overview.widgets.industry.col.job'), priority: 0 },
    { key: 'ends', label: t('overview.widgets.industry.col.ends'), align: 'end', priority: 1 },
    {
      key: 'progress',
      label: t('overview.widgets.industry.col.progress'),
      align: 'end',
      priority: 2,
    },
    { key: 'activity', label: t('overview.widgets.industry.col.activity'), priority: 3 },
  ];
  if (showLocation) {
    columns.push({
      key: 'location',
      label: t('overview.widgets.industry.col.location'),
      priority: 4,
    });
  }
  const jobsTable: TableModel = {
    columns,
    rows: facts.map((job): TableRowModel => {
      const cells: TableCell[] = [job.label, job.when, percent(job.progress), job.activity];
      if (showLocation) cells.push(job.location ?? UNKNOWN);
      return { key: job.key, cells, tone: job.tone };
    }),
  };

  const nextJobMs = running.length > 0 ? Date.parse(running[0].end_date) : Number.NaN;
  const ready = summary.done > 0;
  // The headline is a count; the next clock is the fact it lacks.
  const next = running[0];
  const secondary: NumberSecondary | undefined = next
    ? {
        text: t('overview.widgets.industry.next', {
          name: t('overview.board.jobSubject', {
            name: data.productNames.get(next.job_id) ?? t('overview.board.unknownProduct'),
            count: next.runs,
          }),
          duration: formatCountdown(secondsRemaining(next, now)),
        }),
      }
    : undefined;

  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: data.needsReauth,
        isEmpty: jobs.length === 0 && !slotView,
      })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: count(ready ? summary.done : summary.running),
      unit: t(ready ? 'overview.widgets.industry.ready' : 'overview.widgets.industry.running'),
      secondary,
      notes: slotNotes,
      tone: industrySeverity(jobs, data.needsReauth, now),
    },
    rows: facts.map((job) => ({
      key: job.key,
      title: job.label,
      detail: job.activity,
      value: job.when,
      tone: job.tone,
    })),
    table: slotView ? slotsTable(t, slotRows) : jobsTable,
    deadlines: Number.isNaN(nextJobMs)
      ? []
      : [{ at: nextJobMs, note: t('overview.board.nextJob'), severity: 'watch', to }],
    summary: industrySummary(t, { ...data, jobs }, now),
    // Jobs on a time axis; Small falls back to one progress bar per job (the fallback is that model).
    chart: slotView ? slotsChart(t, slotRows) : industryChart(t, facts, now),
  };
};

/** Jobs laid on a shared time axis, with the progress-bar list as the Small fallback; undefined with no jobs. */
function industryChart(
  t: Translate,
  facts: readonly JobFacts[],
  now: number
): ChartModel | undefined {
  const fallback = hbarsFromRows(
    t,
    facts.map((job) => ({
      key: job.key,
      label: job.label.replace(' Blueprint', ' BP'),
      value: job.progress ?? 0,
      share: job.progress ?? 0,
      text: job.when,
      color: job.done ? ('warning' as const) : ('accent' as const),
    })),
    t(`${C}.industry.note`)
  );
  if (!fallback) return undefined;
  const axis = ganttAxis(facts, now);
  const rows = facts.map((job) => ({
    key: job.key,
    label: job.label.replace(' Blueprint', ' BP'),
    startMs: job.startMs,
    endMs: job.endMs,
    text: job.when,
    color: job.done ? ('warning' as const) : ('accent' as const),
  }));
  const note = t(`${C}.industry.ganttNote`);
  const jobs = facts.map((job) =>
    t(`${C}.industry.ganttJob`, {
      job: job.label,
      when: job.when,
      percent: Math.round((job.progress ?? 0) * 100),
    })
  );
  return {
    kind: 'gantt',
    rows,
    axis,
    labels: {
      from:
        axis.from >= now
          ? ''
          : t(`${C}.industry.ganttAgo`, { duration: formatCountdown((now - axis.from) / 1000) }),
      now: t(`${C}.industry.ganttNow`),
      to: t(`${C}.industry.ganttIn`, {
        duration: formatCountdown(Math.max(0, axis.to - now) / 1000),
      }),
    },
    note,
    summary: t(`${C}.industry.ganttSummary`, { note, jobs: jobs.join('; ') }),
    fallback,
  };
}
