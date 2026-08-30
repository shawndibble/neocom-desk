import type { CsvColumn } from '@/lib/csv';
import type { IndustryJob } from '@/esi/endpoints';
import { activityI18nKey } from './jobs';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * CSV columns for the active-jobs list: activity, blueprint, blueprint type
 * id, runs, start, end, cost, status. Dates and numbers pass through raw —
 * the panel's localized/formatted renderings (duration countdown, locale
 * date string, progress percent) are display-only and never leak into the
 * export. `cost` is blank (not 0, not a placeholder string) when the job has
 * none, matching ESI's optional field; an actual 0 cost stays 0 (`??`, not
 * `||`).
 */
export function jobsCsvColumns(
  t: Translate,
  nameFor: (blueprintTypeId: number) => string
): CsvColumn<IndustryJob>[] {
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
      header: t('industry.csvJobEnd'),
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
  ];
}
