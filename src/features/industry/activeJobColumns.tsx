import { formatCount } from '@/lib/formatCount';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Pill } from '@/components/ui/Pill';
import { Button, type DataTableColumn } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { ItemInfoLink, CharacterLink } from '@/features/entities';
import { formatEveDateTime } from '@/lib/eveTime';
import { activityI18nKey, jobProgress, type ActiveJob } from './jobs';
import { JobEndsInCell, JobProgressCell } from './JobCells';
import { isLoggableHistoryJob, type HistoryJobState } from './jobHistory';

/**
 * A row on the table, tagged with its Character even in the single-character
 * view — so `rowKey` and the optional character column need no branch. For a
 * corp job (issue #2302) that Character is the installer, and `characterName`
 * is empty when the installer is a corpmate outside this account (only ever
 * the job an alert pointed at).
 */
export type JobRow = ActiveJob & {
  characterId: number;
  characterName: string;
  owner: 'personal' | 'corporation';
};

/** Picks a job tone's class out of a per-site map, `undefined` for the neutral case — the one place every `cellClassName`/`rowClassName`/fill-color call site turns a tone into a string. */
export function toneClass(
  tone: 'warning' | 'success' | undefined,
  classes: { warning: string; success: string }
): string | undefined {
  return tone && classes[tone];
}

interface ActiveJobColumnsDeps {
  t: TFunction;
  nameForBlueprint: (typeId: number) => string;
  soon: (job: ActiveJob) => boolean;
  done: (job: ActiveJob) => boolean;
  jobTone: (job: ActiveJob) => 'warning' | 'success' | undefined;
  showCharacterColumn: boolean;
  canLog: (job: JobRow) => boolean;
  handleLogProduction: (job: JobRow) => Promise<void>;
}

/**
 * The Active view's columns. The countdown and progress cells tick
 * themselves; the warning/done tone rebuilds the columns only when a job
 * crosses a threshold (`toneSig` in the panel).
 */
export function activeJobColumns({
  t,
  nameForBlueprint,
  soon,
  done,
  jobTone,
  showCharacterColumn,
  canLog,
  handleLogProduction,
}: ActiveJobColumnsDeps): DataTableColumn<JobRow>[] {
  return [
    {
      id: 'blueprint',
      header: t('industry.jobsColBlueprint'),
      className: 'font-medium',
      sortValue: (job) => nameForBlueprint(job.blueprint_type_id),
      // The row's warning stripe. On a `<tr>` this would be a `box-shadow`,
      // which Chromium drops under the `border-collapse: collapse` every
      // table here inherits; a cell border paints. Held behind `sm:` — once
      // `.dt-stacked` blocks the cell there is no row edge to stripe, and the
      // card's tint already carries the state.
      cellClassName: (job) =>
        toneClass(jobTone(job), {
          warning: 'sm:border-l sm:border-l-warning',
          success: 'sm:border-l sm:border-l-success',
        }),
      render: (job) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <ItemInfoLink typeId={job.product_type_id ?? job.blueprint_type_id}>
            {nameForBlueprint(job.blueprint_type_id)}
          </ItemInfoLink>
          {soon(job) && <Pill tone="warning">{t('industry.jobsCompletingSoon')}</Pill>}
          {done(job) && <Pill tone="success">{t('industry.jobsDone')}</Pill>}
          {/* Only once more than one Character's jobs are on screen (`showCharacterColumn`) — same gate as `OpenOrdersPanel`'s `showCharacterStrip`. */}
          {job.owner === 'corporation' && (
            <Pill className="shrink-0">{t('industry.jobsCorpBadge')}</Pill>
          )}
          {showCharacterColumn && job.characterName !== '' && (
            <span className="ml-1.5 shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem]">
              <CharacterLink id={job.characterId}>{job.characterName}</CharacterLink>
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'activity',
      header: t('industry.jobsColActivity'),
      className: 'text-text-dim',
      sortValue: (job) => t(activityI18nKey(job.activity_id), { id: job.activity_id }),
      render: (job) => t(activityI18nKey(job.activity_id), { id: job.activity_id }),
    },
    {
      id: 'runs',
      header: t('industry.jobsColRuns'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (job) => job.runs,
      render: (job) => (
        <>
          {formatCount(job.runs)}
          {/* The card has no Runs header to say what the bare number is. */}
          <span className="sm:hidden"> {t('industry.jobsRunsUnit', { count: job.runs })}</span>
        </>
      ),
    },
    {
      id: 'progress',
      header: t('industry.jobsColProgress'),
      // Sorts on the raw fraction, not the rounded percent the cell prints.
      sortValue: (job) => jobProgress(job, Date.now()),
      // A thin line of its own under the meta line, % at its right end.
      stackEdge: 'below',
      render: (job) => (
        <JobProgressCell
          job={job}
          label={t('industry.jobsProgress', { name: nameForBlueprint(job.blueprint_type_id) })}
          tone={jobTone(job) ?? 'accent'}
        />
      ),
    },
    {
      id: 'endsIn',
      header: t('industry.jobsColEndsIn'),
      align: 'right',
      cardCorner: true,
      className: 'tabular-nums whitespace-nowrap',
      cellClassName: (job) =>
        toneClass(jobTone(job), {
          warning: 'font-semibold text-warning',
          success: 'font-semibold text-success',
        }),
      // The timestamp, never the printed duration: "1d 4h" sorts before "9h" as a string.
      sortFirst: 'asc',
      sortValue: (job) => Date.parse(job.end_date),
      render: (job) => <JobEndsInCell job={job} doneLabel={t('industry.jobsDone')} />,
    },
    {
      id: 'ends',
      header: t('industry.jobsColEnds'),
      className: 'whitespace-nowrap text-text-dim',
      sortFirst: 'asc',
      sortValue: (job) => Date.parse(job.end_date),
      render: (job) => {
        const endDate = new Date(job.end_date);
        // Off the phone card: the countdown in its corner already says when.
        return (
          <span data-dense-omit>
            <time dateTime={endDate.toISOString()}>{formatEveDateTime(endDate)}</time>
          </span>
        );
      },
    },
    {
      // The one trailing control: a finished job's primary next step. Rows
      // that can't be logged (running, corp-owned) render nothing.
      id: 'logProduction',
      header: '',
      align: 'right',
      // A text button, not the corner icon `cardActions` pins: closes the
      // phone card's meta line at its right end, 36px tall.
      stackEdge: 'end',
      cellClassName: () => 'dt-action-row',
      render: (job) =>
        canLog(job) ? (
          <Button size="sm" onClick={() => void handleLogProduction(job)}>
            {t('industry.jobsLogProduction')}
          </Button>
        ) : null,
    },
  ];
}

interface HistoryColumnsDeps {
  t: TFunction;
  nameForBlueprint: (typeId: number) => string;
  historyStates: ReadonlyMap<number, HistoryJobState>;
  dismissedJobIds: ReadonlySet<number>;
  setDismissed: (job: JobRow, dismissed: boolean) => Promise<void>;
  showHistoryCharacterColumn: boolean;
  planIdSet: ReadonlySet<string>;
  openLoggedPlan: (characterOwner: number, planId: string) => Promise<void>;
  handleLogProduction: (job: JobRow) => Promise<void>;
}

/** History's columns: what was delivered, when, and whether the Production Log has it. */
export function historyColumns({
  t,
  nameForBlueprint,
  historyStates,
  dismissedJobIds,
  setDismissed,
  showHistoryCharacterColumn,
  planIdSet,
  openLoggedPlan,
  handleLogProduction,
}: HistoryColumnsDeps): DataTableColumn<JobRow>[] {
  return [
    {
      id: 'blueprint',
      header: t('industry.jobsColBlueprint'),
      className: 'font-medium',
      sortValue: (job) => nameForBlueprint(job.blueprint_type_id),
      render: (job) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <ItemInfoLink typeId={job.product_type_id ?? job.blueprint_type_id}>
            {nameForBlueprint(job.blueprint_type_id)}
          </ItemInfoLink>
          {isLoggableHistoryJob(job) && historyStates.get(job.job_id)?.kind === 'logged' && (
            <Pill tone="success">{t('industry.historyLogged')}</Pill>
          )}
          {isLoggableHistoryJob(job) &&
            historyStates.get(job.job_id)?.kind !== 'logged' &&
            dismissedJobIds.has(job.job_id) && <Pill>{t('industry.historyDismissed')}</Pill>}
          {showHistoryCharacterColumn && job.characterName !== '' && (
            <span className="ml-1.5 shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem]">
              <CharacterLink id={job.characterId}>{job.characterName}</CharacterLink>
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'activity',
      header: t('industry.jobsColActivity'),
      className: 'text-text-dim',
      sortValue: (job) => t(activityI18nKey(job.activity_id), { id: job.activity_id }),
      render: (job) => t(activityI18nKey(job.activity_id), { id: job.activity_id }),
    },
    {
      id: 'runs',
      header: t('industry.jobsColRuns'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (job) => job.runs,
      render: (job) => formatCount(job.runs),
    },
    {
      id: 'delivered',
      header: t('industry.historyColDelivered'),
      className: 'whitespace-nowrap text-text-dim',
      sortValue: (job) => Date.parse(job.end_date),
      render: (job) => {
        const endDate = new Date(job.end_date);
        return <time dateTime={endDate.toISOString()}>{formatEveDateTime(endDate)}</time>;
      },
    },
    {
      // An unlogged delivery's next step, or the way to the plan that holds it.
      id: 'logProduction',
      header: '',
      align: 'right',
      // A text button, not the corner icon `cardActions` pins: its own
      // full-width row on the phone card, 36px tall.
      cellClassName: () => 'dt-action-row',
      render: (job) => {
        if (!isLoggableHistoryJob(job)) return null;
        const state = historyStates.get(job.job_id);
        if (state?.kind === 'logged') {
          return planIdSet.has(state.buildPlanId) ? (
            <Link
              to={`/industry/plans/${state.buildPlanId}`}
              className={inlineLinkClassName}
              onClick={(event) => {
                event.preventDefault();
                void openLoggedPlan(job.characterId, state.buildPlanId);
              }}
            >
              {t('industry.historyViewPlan')}
            </Link>
          ) : null;
        }
        const dismissed = dismissedJobIds.has(job.job_id);
        return (
          <span className="flex flex-wrap justify-end gap-1">
            <Button size="sm" onClick={() => void handleLogProduction(job)}>
              {t('industry.jobsLogProduction')}
            </Button>
            <Button size="sm" onClick={() => void setDismissed(job, !dismissed)}>
              {dismissed ? t('industry.historyRestore') : t('industry.historyDismiss')}
            </Button>
          </span>
        );
      },
    },
  ];
}
