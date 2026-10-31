import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { activityI18nKey, isCompletingSoon, isJobDone, type ActiveJob } from './jobs';
import { isLoggableHistoryJob, type HistoryJobState } from './jobHistory';

/** An `ActiveJob` plus the Character and owner the panel tags each row with (`JobRow`). */
export type JobCsvRow = ActiveJob & {
  characterName?: string;
  owner?: 'personal' | 'corporation';
};

/**
 * CSV columns for the active-jobs list: activity, blueprint, blueprint type
 * id, runs, start, end, cost, status. Dates and numbers pass through raw —
 * the panel's localized/formatted renderings (duration countdown, locale
 * date string, progress percent) are display-only and never leak into the
 * export. `cost` is blank (not 0, not a placeholder string) when the job has
 * none, matching ESI's optional field; an actual 0 cost stays 0 (`??`, not
 * `||`).
 *
 * Typed on `ActiveJob`, the structural subset the panel renders, so the same
 * export serves both a Character's jobs and its corporation's (issue #298).
 */
const OWNER_KEY = {
  personal: 'industry.csvJobOwnerPersonal',
  corporation: 'industry.csvJobOwnerCorporation',
} as const;

export interface JobsCsvOptions {
  /** Job History: the End date is the delivery, and a clock-derived state means nothing. */
  delivered?: boolean;
  /** The clock the State column reads, at export time. */
  now?: () => number;
}

export function jobsCsvColumns(
  t: CsvTranslate,
  nameFor: (blueprintTypeId: number) => string,
  { delivered = false, now = Date.now }: JobsCsvOptions = {}
): CsvColumn<JobCsvRow>[] {
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
            // The table's Done / Completing soon pill, derived from the clock, beside ESI's own status.
            header: t('industry.csvJobState'),
            value: (job: JobCsvRow) => {
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
      // The installer for a corp job.
      header: t('industry.csvCharacter'),
      value: (job) => job.characterName || null,
    },
    {
      header: t('industry.csvJobOwner'),
      value: (job) => (job.owner ? t(OWNER_KEY[job.owner]) : null),
    },
  ];
}

/**
 * Job History's export: the same facts as the Active list (its End date is the
 * delivery) plus whether the Production Log holds the delivery. Blank where a
 * job is not one the log can hold (not a manufacturing delivery).
 */
export function jobHistoryCsvColumns(
  t: CsvTranslate,
  nameFor: (blueprintTypeId: number) => string,
  states: ReadonlyMap<number, HistoryJobState>,
  dismissedJobIds: ReadonlySet<number>
): CsvColumn<JobCsvRow>[] {
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
