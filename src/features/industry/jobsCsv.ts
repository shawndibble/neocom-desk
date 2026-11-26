import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { JobRow } from './activeJobColumns';
import { activityI18nKey, isCompletingSoon, isJobDone } from './jobs';
import { isLoggableHistoryJob, type HistoryJobState } from './jobHistory';

const OWNER_KEY = {
  personal: 'industry.csvJobOwnerPersonal',
  corporation: 'industry.csvJobOwnerCorporation',
} as const;

export interface JobsCsvOptions {
  delivered?: boolean;
  now?: () => number;
}

export function jobsCsvColumns(
  t: CsvTranslate,
  nameFor: (blueprintTypeId: number) => string,
  { delivered = false, now = Date.now }: JobsCsvOptions = {}
): CsvColumn<JobRow>[] {
  return [
    {
      header: t('industry.csvJobActivity'),
      value: (job) => t(activityI18nKey(job.activity_id), { id: job.activity_id }),
    },
    {
      header: t('industry.csvJobBlueprint'),
      value: (job) => nameFor(job.blueprint_type_id),
    },
    {
      header: t('industry.csvJobBlueprintTypeId'),
      value: (job) => job.blueprint_type_id,
    },
    {
      header: t('industry.csvJobRuns'),
      value: (job) => job.runs,
    },
    {
      header: t('industry.csvJobStart'),
      value: (job) => job.start_date,
    },
    {
      header: delivered ? t('industry.historyColDelivered') : t('industry.csvJobEnd'),
      value: (job) => job.end_date,
    },
    {
      header: t('industry.csvJobCostIsk'),
      value: (job) => job.cost ?? null,
    },
    {
      header: t('industry.csvJobStatus'),
      value: (job) => job.status,
    },
    ...(delivered
      ? []
      : [
          {
            header: t('industry.csvJobState'),
            value: (job: JobRow) => {
              const at = now();
              if (isJobDone(job, at)) return t('industry.jobsDone');
              return isCompletingSoon(job, at) ? t('industry.jobsCompletingSoon') : null;
            },
          },
        ]),
    {
      header: t('industry.csvJobProduct'),
      value: (job) => (job.product_type_id != null ? nameFor(job.product_type_id) : null),
    },
    {
      header: t('industry.csvCharacter'),
      value: (job) => job.characterName || null,
    },
    {
      header: t('industry.csvJobOwner'),
      value: (job) => (job.owner ? t(OWNER_KEY[job.owner]) : null),
    },
  ];
}

export function jobHistoryCsvColumns(
  t: CsvTranslate,
  nameFor: (blueprintTypeId: number) => string,
  states: ReadonlyMap<number, HistoryJobState>,
  dismissedJobIds: ReadonlySet<number>
): CsvColumn<JobRow>[] {
  return [
    ...jobsCsvColumns(t, nameFor, { delivered: true }),
    {
      header: t('industry.csvJobLogState'),
      value: (job) => {
        if (!isLoggableHistoryJob(job)) return null;
        if (states.get(job.job_id)?.kind === 'logged') return t('industry.historyLogged');
        return dismissedJobIds.has(job.job_id)
          ? t('industry.historyDismissed')
          : t('industry.csvJobNotLogged');
      },
    },
    {
      header: t('industry.csvJobLoggedPlanId'),
      value: (job) => {
        const state = states.get(job.job_id);
        return state?.kind === 'logged' ? state.buildPlanId : null;
      },
    },
  ];
}
