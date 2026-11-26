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
import { inventionOutcome, isLoggableHistoryJob, type HistoryJobState } from './jobHistory';

export type JobRow = ActiveJob & {
  characterId: number;
  characterName: string;
  owner: 'personal' | 'corporation';
};

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
          <span className="sm:hidden"> {t('industry.jobsRunsUnit', { count: job.runs })}</span>
        </>
      ),
    },
    {
      id: 'progress',
      header: t('industry.jobsColProgress'),
      sortValue: (job) => jobProgress(job, Date.now()),
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
        return (
          <span data-dense-omit>
            <time dateTime={endDate.toISOString()}>{formatEveDateTime(endDate)}</time>
          </span>
        );
      },
    },
    {
      id: 'logProduction',
      header: '',
      align: 'right',
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
      render: (job) => {
        const outcome = inventionOutcome(job);
        if (!outcome) return formatCount(job.runs);
        return t('industry.historyInventionSucceeded', {
          succeeded: formatCount(outcome.succeeded),
          runs: formatCount(outcome.runs),
        });
      },
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
      id: 'logProduction',
      header: '',
      align: 'right',
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
