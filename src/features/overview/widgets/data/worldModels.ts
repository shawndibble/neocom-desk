/**
 * Builders for the industry, planets and space kinds: industry, planetary,
 * structures, moon extractions, incursions, realized profit and mining yield.
 * Same contract as `models.ts`: pure, derived at render time. Each builds its
 * own Table (real columns, priorities as `tableModel.ts` reads them), a
 * Number that is a headline plus one fact the headline lacks, and a chart that
 * names what it draws.
 */
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { filterYieldRange, eveToday, rangeDates, daysCovered } from '@/engine/miningTax/yieldRange';
import type { MiningYieldRange } from '@/engine/miningTax/yieldRange';
import type { CorpBoardItem } from '@/engine/corp/board';
import {
  activityI18nKey,
  isJobDone,
  secondsRemaining,
  sortJobsBySoonest,
  summarizeJobs,
} from '@/features/industry/jobs';
import { structureStateLabel } from '@/features/corp/boardSources';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { formatCountdown } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { formatCompactNumber } from '@/lib/compactNumber';
import { jobSeverity, industrySeverity, planetarySeverity } from '../../data/boardSeverity';
import {
  industrySummary,
  moonChunksSummary,
  planetarySummary,
  structuresSummary,
} from '../../data/boardSummary';
import {
  moonChunkSeverity,
  moonChunksDeadline,
  moonChunksSeverity,
  structureCounts,
  structuresDeadline,
  structuresSeverity,
  structuresView,
} from '../../data/corpCards';
import {
  incursionJumpsWhen,
  incursionsSeverity,
  incursionsSummary,
} from '../../data/incursionsBoard';
import type { IncursionsBoardData } from '../../data/incursionsBoard';
import type {
  IndustryBoardData,
  IndustryCharacterSlots,
  PlanetaryBoardData,
} from '../../data/boardData';
import {
  aggregateJobSlotSummary,
  JOB_SLOT_CATEGORIES,
  type JobSlotCategory,
} from '@/engine/industry/jobSlots';
import { ganttAxis } from '../charts/geometry';
import type { ChartModel } from '../charts/types';
import { blank, count, statusOf, UNKNOWN, type Builder, type KindDef } from './builderKit';
import { fractionBar, signedCell } from './cellKit';
import { hbarsFromRows, severityColor } from './chartBuilders';
import { backwardBucketSums } from './chartSeries';
import { dayTitle, rollingTitles, signTone } from './chartTips';
import type {
  NumberModel,
  NumberSecondary,
  TableCell,
  TableColumn,
  TableModel,
  TableRowModel,
  Translate,
} from './types';

const C = 'overview.widgets.chart';
const D = 'overview.widgets.data';

const iskCell = (isk: number, text = formatIskCompactSigned(isk)): TableCell => ({
  text,
  iskAmount: isk,
});

/** A bounded 0..1 share of `done` out of `total`; null when the span is not a real one. */
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

// --- Planetary --------------------------------------------------------------------

interface ColonyFacts {
  key: string;
  name: string;
  kind: 'running' | 'expired' | 'idle';
  expiryMs: number | null;
  severity: DeadlineSeverity;
  programs: number | undefined;
}

const COLONY_ORDER = { expired: 0, running: 1, idle: 2 } as const;

function colonyFacts(data: PlanetaryBoardData, t: Translate): ColonyFacts[] {
  const out: ColonyFacts[] = [];
  for (const batch of data.batches) {
    for (const colony of batch.colonies) {
      out.push({
        key: String(colony.planetId),
        name: colony.name ?? t('overview.widgets.planetary.unnamed', { id: colony.planetId }),
        kind: batch.kind,
        expiryMs: colony.status.soonestExpiryMs,
        severity: batch.severity,
        programs: colony.programCount,
      });
    }
  }
  return out.sort(
    (a, b) =>
      COLONY_ORDER[a.kind] - COLONY_ORDER[b.kind] ||
      (a.expiryMs ?? Number.POSITIVE_INFINITY) - (b.expiryMs ?? Number.POSITIVE_INFINITY)
  );
}

/** "Ending soon" rather than "Running" for a colony the severity ladder already flags. */
function colonyState(t: Translate, colony: ColonyFacts): string {
  if (colony.kind === 'expired') return t('overview.widgets.planetary.state.stopped');
  if (colony.kind === 'idle') return t('overview.widgets.planetary.state.idle');
  return colony.severity === 'warning' || colony.severity === 'critical'
    ? t('overview.widgets.planetary.state.soon')
    : t('overview.widgets.planetary.state.running');
}

export const planetary: Builder = (feeds, { t, now }) => {
  const feed = feeds.planetary;
  const data = feed?.data ?? null;
  const to = '/planetary-industry';
  if (!data) return blank(to, statusOf(feed));
  const colonies = colonyFacts(data, t);
  const nextBatch = data.batches.find((batch) => batch.kind === 'running');
  const stopped = colonies.filter((colony) => colony.kind === 'expired').length;
  const idle = colonies.filter((colony) => colony.kind === 'idle').length;
  const tone = planetarySeverity(data) ?? 'clear';

  // The question is when the first extractor runs out, not how many colonies there are.
  let number: NumberModel;
  if (nextBatch?.expiryMs) {
    const together = nextBatch.colonies.length;
    const secondary: NumberSecondary | undefined =
      stopped > 0
        ? { text: t('overview.widgets.planetary.stopped', { count: stopped }), tone: 'bad' }
        : together > 1
          ? {
              text: t('overview.widgets.planetary.together', {
                count: together,
                total: data.colonyCount,
              }),
            }
          : nextBatch.colonies[0]
            ? {
                text:
                  nextBatch.colonies[0].name ??
                  t('overview.widgets.planetary.unnamed', { id: nextBatch.colonies[0].planetId }),
              }
            : undefined;
    number = {
      value: formatCountdown(Math.max(0, nextBatch.expiryMs - now) / 1000),
      unit: t('overview.widgets.planetary.untilNext'),
      secondary,
      tone,
    };
  } else if (stopped > 0) {
    number = { value: count(stopped), unit: t('overview.widgets.planetary.stoppedUnit'), tone };
  } else if (idle > 0) {
    number = { value: count(idle), unit: t('overview.widgets.planetary.idleUnit'), tone };
  } else {
    number = { value: count(data.colonyCount), unit: t('overview.widgets.planetary.unit'), tone };
  }

  const table: TableModel = {
    columns: [
      { key: 'colony', label: t('overview.widgets.planetary.col.colony'), priority: 0 },
      { key: 'ends', label: t('overview.widgets.planetary.col.ends'), align: 'end', priority: 1 },
      { key: 'state', label: t('overview.widgets.planetary.col.state'), priority: 2 },
      {
        key: 'programs',
        label: t('overview.widgets.planetary.col.programs'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: colonies.map((colony) => ({
      key: colony.key,
      cells: [
        colony.name,
        colony.kind === 'running' && colony.expiryMs !== null
          ? formatCountdown(Math.max(0, colony.expiryMs - now) / 1000)
          : UNKNOWN,
        colonyState(t, colony),
        colony.programs === undefined ? UNKNOWN : count(colony.programs),
      ],
      tone: colony.severity,
    })),
  };

  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: data.colonyCount === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number,
    rows: data.batches.map((batch) => ({
      key: `${batch.kind}:${batch.expiryMs ?? 'none'}`,
      title: t(`overview.board.batch.${batch.kind}`, { count: batch.colonies.length }),
      detail: batch.colonies.map((colony) => colony.name ?? `#${colony.planetId}`).join(', '),
      value:
        batch.kind === 'idle'
          ? t('overview.board.noProgram')
          : batch.kind === 'expired'
            ? t('overview.board.stopped')
            : formatCountdown(Math.max(0, (batch.expiryMs ?? 0) - now) / 1000),
      tone: batch.severity,
    })),
    table,
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
    // Every colony on its own bar, stopped first then soonest: the batches hid which planet to visit.
    // A stopped or idle colony has no time left, so its bar is empty and its state is the figure.
    chart:
      hbarsFromRows(
        t,
        colonies
          .filter((colony) => colony.kind !== 'running' || colony.expiryMs !== null)
          .map((colony) => {
            if (colony.kind !== 'running') {
              return {
                key: colony.key,
                label: colony.name,
                value: 0,
                share: 0,
                text: colonyState(t, colony),
                color: colony.kind === 'expired' ? ('warning' as const) : undefined,
              };
            }
            const seconds = Math.max(0, (colony.expiryMs ?? 0) - now) / 1000;
            return {
              key: colony.key,
              label: colony.name,
              value: seconds,
              text: formatCountdown(seconds),
              color:
                seconds * 1000 < 12 * HOUR_MS
                  ? ('warning' as const)
                  : severityColor(colony.severity),
            };
          }),
        t(`${C}.planetary.note`)
      ) ?? undefined,
  };
};

// --- Structures -------------------------------------------------------------------

/** "Efa - Helios Prime" is long on a tile; the name after the system prefix is the one a pilot knows it by. */
export function shortStructureName(name: string): string {
  const cut = name.indexOf(' - ');
  return cut > 0 && cut + 3 < name.length ? name.slice(cut + 3) : name;
}

/**
 * A full tank is not in the data (ESI gives only when the fuel runs out), so the
 * bar reads against a fixed horizon: 30 days of fuel is a full bar.
 */
export const FUEL_BAR_HORIZON_MS = 30 * DAY_MS;

/** The fuel clock's text, with a bar only for a real clock (not "Dry", "Offline" or "Soon"). */
function fuelCell(item: CorpBoardItem, t: Translate): TableCell {
  const text = structureWhen(item, t);
  if (item.timing !== 'timed' || item.withinStaleWindow) return text;
  const bar = fractionBar(item.remainingMs ?? 0, FUEL_BAR_HORIZON_MS);
  return bar === undefined ? text : { text, bar };
}

function structureWhen(item: CorpBoardItem, t: Translate): string {
  if (item.timing === 'passed') return t('overview.board.structureDry');
  if (item.timing === 'untimed') return t('overview.board.structureOffline');
  // A clock shorter than CCP's hour-long cache may already be over, so it is not ticked down.
  if (item.withinStaleWindow) return t('overview.board.structureSoon');
  return formatCountdown(Math.max(0, item.remainingMs ?? 0) / 1000);
}

/**
 * The lowest fuel clock leads (the question a pilot asks of a fleet of
 * structures); with no fuel clock it falls back to the reinforcement count. A
 * zero count is never toned: a warning beside "0 Timers" contradicts itself.
 */
function structuresNumber(
  t: Translate,
  items: readonly CorpBoardItem[],
  timers: number,
  tone: DeadlineSeverity
): NumberModel {
  const lowest = items
    .filter((item) => item.kind === 'structureFuel' && item.timing === 'timed')
    .sort((a, b) => (a.remainingMs ?? 0) - (b.remainingMs ?? 0))[0];
  if (lowest) {
    return {
      value: formatCountdown(Math.max(0, lowest.remainingMs ?? 0) / 1000),
      unit: t('overview.widgets.structures.fuelLeft'),
      secondary: {
        text:
          timers > 0
            ? t('overview.board.structuresTimers', { count: timers })
            : shortStructureName(lowest.subject),
      },
      tone,
    };
  }
  return {
    value: count(timers),
    unit: t('overview.board.reinforced'),
    tone: timers > 0 ? tone : 'clear',
  };
}

export const structures: Builder = (feeds, { t, now }) => {
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
  const clock = structuresDeadline(items, now);
  const flagged = items.filter(
    (item) => item.kind !== 'structureFuel' || item.severity !== 'clear'
  );

  // One row per structure, healthy ones too: the pilot asks "is everything fuelled", not only "what is wrong".
  const rows = (raw.structures ?? []).map((source) => {
    const id = source.structureId;
    const fuel = items.find((item) => item.id === `fuel:${id}`);
    const timer = items.find((item) => item.id === `state:${id}`);
    const offline = items.filter((item) => item.id.startsWith(`service:${id}:`));
    const own = [fuel, timer, ...offline].filter(
      (item): item is CorpBoardItem => item !== undefined
    );
    const tone = worstSeverity(own.map((item) => item.severity));
    const state = timer
      ? structureStateLabel(timer.detail)
      : offline.length > 0
        ? t('overview.widgets.structures.state.offline')
        : fuel && (fuel.severity === 'warning' || fuel.severity === 'critical')
          ? t('overview.widgets.structures.state.lowFuel')
          : t('overview.widgets.structures.state.ok');
    return {
      id,
      remaining: fuel?.timing === 'timed' ? (fuel.remainingMs ?? 0) : Number.NEGATIVE_INFINITY,
      tone,
      cells: [
        shortStructureName(source.name),
        fuel ? fuelCell(fuel, t) : UNKNOWN,
        state,
        timer && timer.timing === 'timed' ? structureWhen(timer, t) : UNKNOWN,
      ] as TableCell[],
    };
  });
  rows.sort(
    (a, b) =>
      (a.tone === b.tone ? 0 : worstSeverity([a.tone, b.tone]) === a.tone ? -1 : 1) ||
      a.remaining - b.remaining
  );
  const table: TableModel = {
    columns: [
      { key: 'structure', label: t('overview.widgets.structures.col.structure'), priority: 0 },
      { key: 'fuel', label: t('overview.widgets.structures.col.fuel'), align: 'end', priority: 1 },
      { key: 'state', label: t('overview.widgets.structures.col.state'), priority: 2 },
      {
        key: 'timer',
        label: t('overview.widgets.structures.col.timer'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: rows.map((row) => ({ key: String(row.id), cells: row.cells, tone: row.tone })),
  };

  return {
    ...blank(to, statusOf(feed, { isEmpty: view.structureCount === 0 })),
    fetchedAt: view.fetchedAt,
    number: structuresNumber(t, items, counts.timers, structuresSeverity(view) ?? 'clear'),
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
    table,
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
    chart:
      hbarsFromRows(
        t,
        items
          .filter((item) => item.kind === 'structureFuel' && item.timing === 'timed')
          .map((item) => {
            const seconds = Math.max(0, item.remainingMs ?? 0) / 1000;
            return {
              key: item.id,
              label: shortStructureName(item.subject),
              value: seconds,
              text: formatCountdown(seconds),
              color: severityColor(item.severity),
            };
          }),
        t(`${C}.structures.note`)
      ) ?? undefined,
  };
};

// --- Moon extractions -------------------------------------------------------------

export const moonChunks: Builder = (feeds, { t, now }) => {
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
  const eventOf = (detail: string) =>
    t(`overview.widgets.moonChunks.event.${detail === 'decay' ? 'decay' : 'arrival'}`);
  const untilOf = (deadlineMs: number) => formatCountdown(Math.max(0, deadlineMs - now) / 1000);
  const tone = moonChunksSeverity(data, now) ?? 'clear';

  const table: TableModel = {
    columns: [
      { key: 'drill', label: t('overview.widgets.moonChunks.col.drill'), priority: 0 },
      { key: 'in', label: t('overview.widgets.moonChunks.col.in'), align: 'end', priority: 1 },
      { key: 'event', label: t('overview.widgets.moonChunks.col.event'), priority: 2 },
    ],
    rows: chunks.map((chunk, i) => ({
      key: `${chunk.id}:${i}`,
      cells: [shortStructureName(chunk.subject), untilOf(chunk.deadlineMs), eventOf(chunk.detail)],
      tone: moonChunkSeverity(chunk, now),
    })),
  };

  return {
    ...blank(to, statusOf(feed, { isEmpty: chunks.length === 0 })),
    fetchedAt: data.fetchedAt,
    number:
      ready > 0 || !nextChunk
        ? { value: count(ready), unit: t('overview.widgets.moonChunks.ready'), tone }
        : {
            value: formatCountdown(Math.max(0, nextChunk.deadlineMs - now) / 1000),
            unit: t('overview.widgets.moonChunks.untilNext'),
            secondary: {
              text:
                chunks.length > 1
                  ? t('overview.widgets.moonChunks.queued', {
                      name: shortStructureName(nextChunk.subject),
                      count: chunks.length,
                    })
                  : shortStructureName(nextChunk.subject),
            },
            tone,
          },
    rows: chunks.map((chunk, i) => ({
      key: `${chunk.id}:${i}`,
      title: shortStructureName(chunk.subject),
      detail: eventOf(chunk.detail),
      value: untilOf(chunk.deadlineMs),
      tone: moonChunkSeverity(chunk, now),
    })),
    table,
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

// --- Incursions -------------------------------------------------------------------

function incursionSystem(t: Translate, data: IncursionsBoardData, id: number): string {
  return data.systemNames.get(id) ?? t('travel.stops.unnamed', { id });
}

export const incursions: Builder = (feeds, { t }) => {
  const feed = feeds.incursions;
  const data = feed?.data ?? null;
  const to = '/travel/route';
  if (!data) return blank(to, statusOf(feed));
  const nearest = data.rows[0];
  const tone = incursionsSeverity(data) ?? 'clear';
  // Jumps to the nearest is the question; with no origin to count from, the active count is all there is.
  const number: NumberModel =
    nearest && nearest.jumps !== null
      ? {
          value: count(nearest.jumps),
          unit: t('overview.widgets.incursions.jumpsAway', { count: nearest.jumps }),
          secondary: {
            text: t('overview.widgets.incursions.nearestActive', {
              system: incursionSystem(t, data, nearest.stagingSystemId),
              count: data.rows.length,
            }),
          },
          tone,
        }
      : {
          value: count(data.rows.length),
          unit: t('overview.widgets.incursions.unit'),
          tone,
        };

  const table: TableModel = {
    columns: [
      { key: 'system', label: t('overview.widgets.incursions.col.system'), priority: 0 },
      {
        key: 'jumps',
        label: t('overview.widgets.incursions.col.jumps'),
        align: 'end',
        priority: 1,
      },
      { key: 'state', label: t('overview.widgets.incursions.col.state'), priority: 2 },
      {
        key: 'influence',
        label: t('overview.widgets.incursions.col.influence'),
        align: 'end',
        priority: 3,
        hideNarrow: true,
      },
      {
        key: 'constellation',
        label: t('overview.widgets.incursions.col.constellation'),
        priority: 4,
        hideNarrow: true,
      },
    ],
    rows: data.rows.map((row) => {
      const state = t(`travel.incursions.state.${row.state}`);
      return {
        key: String(row.constellationId),
        cells: [
          incursionSystem(t, data, row.stagingSystemId),
          incursionJumpsWhen(t, row, data.jumpsStatus),
          row.hasBoss ? t('overview.widgets.incursions.withBoss', { state }) : state,
          `${Math.round(row.influence * 100)}%`,
          data.constellationNames.get(row.constellationId) ??
            t('travel.incursions.constellation', { id: row.constellationId }),
        ],
        tone: 'clear' as DeadlineSeverity,
        to: routeToHref(row.stagingSystemId),
      };
    }),
  };

  return {
    ...blank(to, statusOf(feed)),
    number,
    rows: data.rows.map((row) => {
      const constellation =
        data.constellationNames.get(row.constellationId) ??
        t('travel.incursions.constellation', { id: row.constellationId });
      return {
        key: String(row.constellationId),
        title: incursionSystem(t, data, row.stagingSystemId),
        detail: t('overview.board.incursionsDetailLabel', {
          state: t(`travel.incursions.state.${row.state}`),
          constellation,
        }),
        value: incursionJumpsWhen(t, row, data.jumpsStatus),
        tone: 'clear' as DeadlineSeverity,
        to: routeToHref(row.stagingSystemId),
      };
    }),
    table,
    summary: incursionsSummary(t, data),
  };
};

// --- Realized profit --------------------------------------------------------------

export const profit: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.profit;
  const data = feed?.data ?? null;
  const to = '/industry';
  if (!data) return blank(to, statusOf(feed));
  const inWindow = (from: number, until: number) =>
    data.runs.filter((run) => run.loggedAt >= from && run.loggedAt <= until);
  const inRange = inWindow(now - range * DAY_MS, now);
  const previous = data.runs.filter(
    (run) => run.loggedAt >= now - 2 * range * DAY_MS && run.loggedAt < now - range * DAY_MS
  );
  const total = inRange.reduce((sum, run) => sum + run.profit, 0);
  // A week is the unit the spec asks for; a 7-day range has too few weeks to be a chart, so days.
  const daily = range <= 7;
  const bucketMs = daily ? DAY_MS : 7 * DAY_MS;
  const buckets = daily ? range : Math.ceil(range / 7);
  const values = backwardBucketSums(
    data.runs,
    (run) => run.loggedAt,
    (run) => run.profit,
    now,
    bucketMs,
    buckets
  );
  const byProduct = new Map<number, { profit: number; built: number }>();
  for (const run of inRange) {
    const row = byProduct.get(run.productTypeID) ?? { profit: 0, built: 0 };
    row.profit += run.profit;
    row.built += run.quantity;
    byProduct.set(run.productTypeID, row);
  }
  const products = [...byProduct.entries()].sort((a, b) => b[1].profit - a[1].profit);
  const nameOf = (typeId: number) => data.names.get(typeId) ?? `#${typeId}`;

  // The headline is the window's total; against the window before it is the fact it lacks. No earlier runs, no claim.
  let secondary: NumberSecondary | undefined;
  if (previous.length > 0) {
    const delta = total - previous.reduce((sum, run) => sum + run.profit, 0);
    secondary = {
      text: t('overview.widgets.profit.vsPrevious', {
        delta: formatIskCompactSigned(delta),
        count: range,
      }),
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      tone: delta > 0 ? 'good' : delta < 0 ? 'bad' : undefined,
    };
  }

  const table: TableModel = {
    columns: [
      { key: 'product', label: t('overview.widgets.profit.col.product'), priority: 0 },
      { key: 'profit', label: t('overview.widgets.profit.col.profit'), align: 'end', priority: 1 },
      { key: 'built', label: t('overview.widgets.profit.col.built'), align: 'end', priority: 2 },
      {
        key: 'perUnit',
        label: t('overview.widgets.profit.col.perUnit'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: products.map(([typeId, row]) => ({
      key: String(typeId),
      cells: [
        nameOf(typeId),
        iskCell(row.profit),
        formatCompactNumber(row.built),
        row.built > 0
          ? signedCell(formatIskCompactSigned(row.profit / row.built), row.profit)
          : UNKNOWN,
      ],
      tone: row.profit < 0 ? 'watch' : 'clear',
    })),
  };

  const summary = t(`${C}.profit.summary`, {
    total: formatIskCompactSigned(total),
    runs: inRange.length,
    range,
    buckets: values.map((v) => formatIskCompactSigned(v)).join(', '),
  });
  return {
    ...blank(to, statusOf(feed, { isEmpty: data.runs.length === 0 })),
    number: {
      value: formatIskCompactSigned(total),
      iskAmount: total,
      unit: t('overview.isk'),
      secondary,
      tone: 'clear',
    },
    rows: products.map(([typeId, row]) => ({
      key: String(typeId),
      title: nameOf(typeId),
      detail: t(`${D}.profit.built`, { count: row.built }),
      value: formatIskCompactSigned(row.profit),
      iskAmount: row.profit,
      tone: 'clear' as DeadlineSeverity,
    })),
    table,
    summary,
    chart:
      inRange.length === 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(Math.max(0, ...values)) }),
            gains: true,
            barLabels: values.map((v) => (v === 0 ? '' : formatIskCompactSigned(v))),
            xStart: t(daily ? `${C}.daysAgo` : `${C}.weeksAgo`, { count: buckets }),
            xEnd: t(daily ? `${C}.today` : `${C}.thisWeek`),
            tips: rollingTitles(t, daily ? 'day' : 'week', buckets).map((title, i) => ({
              title,
              rows: [
                {
                  label: t(`${C}.tip.profit`),
                  value: formatIskCompactSigned(values[i]!),
                  tone: signTone(values[i]!),
                },
              ],
            })),
            note: t(daily ? `${C}.profit.noteDaily` : `${C}.profit.noteWeekly`),
            summary,
          },
  };
};

// --- Mining yield -----------------------------------------------------------------

export const miningYield: Builder = (feeds, { t, now, range, scopeAll, activeCharacterId }) => {
  const feed = feeds.miningYield;
  const data = feed?.data ?? null;
  const to = '/mining';
  if (!data) return blank(to, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  const rows = data.rows.filter((row) => everyone || row.characterId === activeCharacterId);
  const needsPermission = everyone
    ? data.trackedIds.length > 0 && data.reauthIds.length === data.trackedIds.length
    : activeCharacterId !== null &&
      (data.reauthIds.includes(activeCharacterId) || !data.trackedIds.includes(activeCharacterId));
  const window = `${range}d` as MiningYieldRange;
  const today = eveToday(new Date(now));
  const inRange = filterYieldRange(rows, window, today);
  const perDay = new Map<string, number>();
  const perOre = new Map<number, { isk: number; units: number | null }>();
  for (const row of inRange) {
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.isk);
    for (const ore of row.ores) {
      const entry = perOre.get(ore.typeId) ?? { isk: 0, units: 0 };
      entry.isk += ore.isk;
      entry.units =
        ore.units === undefined || entry.units === null ? null : entry.units + ore.units;
      perOre.set(ore.typeId, entry);
    }
  }
  const values = rangeDates(window, today).map((date) => perDay.get(date) ?? 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = total / range;
  const best = Math.max(...values);
  const covered = daysCovered(
    inRange.map((row) => row.date),
    window,
    today,
    data.oldestSaved
  );
  const oreTotal = [...perOre.values()].reduce((sum, v) => sum + v.isk, 0);
  const ores = [...perOre.entries()].sort((a, b) => b[1].isk - a[1].isk);
  const nameOf = (typeId: number) => data.typeNames.get(typeId) ?? `#${typeId}`;
  const sharePct = (isk: number) => Math.round((isk / oreTotal) * 100);
  const showUnits = ores.some(([, ore]) => ore.units !== null);

  const columns: TableColumn[] = [
    { key: 'ore', label: t('overview.widgets.miningYield.col.ore'), priority: 0 },
    { key: 'isk', label: t('overview.widgets.miningYield.col.isk'), align: 'end', priority: 1 },
    { key: 'share', label: t('overview.widgets.miningYield.col.share'), align: 'end', priority: 2 },
  ];
  if (showUnits) {
    columns.push({
      key: 'units',
      label: t('overview.widgets.miningYield.col.units'),
      align: 'end',
      priority: 3,
    });
  }
  const table: TableModel = {
    columns,
    rows: ores.map(([typeId, ore]) => {
      const cells: TableCell[] = [
        nameOf(typeId),
        iskCell(ore.isk, formatIskCompact(ore.isk)),
        oreTotal > 0
          ? { text: `${sharePct(ore.isk)}%`, bar: fractionBar(ore.isk, oreTotal) }
          : UNKNOWN,
      ];
      if (showUnits) cells.push(ore.units === null ? UNKNOWN : formatCompactNumber(ore.units));
      return { key: String(typeId), cells, tone: 'clear' as DeadlineSeverity };
    }),
  };

  const summary = t(`${C}.miningYield.summary`, {
    average: formatIskCompact(average),
    days: covered.daysWithData,
    range,
    total: formatIskCompact(total),
  });
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission, isEmpty: !needsPermission && rows.length === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: formatIskCompact(average),
      iskAmount: average,
      unit: t(`${D}.miningYield.unit`),
      // The headline is the average; the best day is the fact it lacks. The history caveat lives in the chart caption.
      secondary:
        best > 0
          ? { text: t(`${D}.miningYield.bestDay`, { value: formatIskCompact(best) }) }
          : undefined,
      tone: 'clear',
    },
    rows: ores.map(([typeId, ore]) => ({
      key: String(typeId),
      title: nameOf(typeId),
      detail: oreTotal > 0 ? t(`${D}.miningYield.share`, { pct: sharePct(ore.isk) }) : undefined,
      value: formatIskCompact(ore.isk),
      iskAmount: ore.isk,
      tone: 'clear' as DeadlineSeverity,
    })),
    table,
    summary,
    chart:
      total <= 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(best) }),
            xStart: t(`${C}.daysAgo`, { count: range }),
            xEnd: t(`${C}.today`),
            tips: rangeDates(window, today).map((date, i) => ({
              title: dayTitle(date),
              rows: [{ label: t(`${C}.tip.mined`), value: formatIskCompact(values[i]!) }],
            })),
            ref: {
              value: average,
              label: t(`${C}.miningYield.average`, { value: formatIskCompact(average) }),
            },
            note:
              covered.historyStartsInRange !== null
                ? t(`${C}.miningYield.noteSince`, { date: covered.historyStartsInRange })
                : t(`${C}.miningYield.note`),
            summary,
          },
  };
};

/** The kinds built in this file, each with the feeds it reads. */
export const WORLD_DEFS: Readonly<Record<string, KindDef>> = {
  industry: { feeds: ['industry'], build: industry },
  planetary: { feeds: ['planetary'], build: planetary },
  structures: { feeds: ['structures'], build: structures },
  moonChunks: { feeds: ['moonChunks'], build: moonChunks },
  incursions: { feeds: ['incursions'], build: incursions },
  profit: { feeds: ['profit'], build: profit },
  miningYield: { feeds: ['miningYield'], build: miningYield },
};
