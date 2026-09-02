import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  Panel,
  ReauthBanner,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadTypes } from '@/sde/loadSde';
import type { TypeMap } from '@/sde/types';
import {
  loadCharacterIndustryJobs,
  sortJobsBySoonest,
  jobProgress,
  isJobDone,
  isCompletingSoon,
  secondsRemaining,
  activityI18nKey,
  type JobsLoadResult,
} from './jobs';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { jobsCsvColumns } from './jobsCsv';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';

interface ActiveJobsPanelProps {
  characterId: number;
}

interface Snapshot {
  result: JobsLoadResult;
  types: TypeMap;
}

/** Countdown recompute cadence; coarse (minutes granularity display) so 30s is plenty fresh. */
const TICK_MS = 30_000;

async function loadActiveJobsSnapshot(characterId: number): Promise<Snapshot> {
  try {
    const [result, types] = await Promise.all([
      loadCharacterIndustryJobs(characterId),
      loadTypes(),
    ]);
    return { result, types };
  } catch {
    // `loadTypes()` throws when the SDE fetch fails. Resolving with an empty
    // snapshot rather than rejecting is what clears the spinner — a rejected
    // load would strand the panel with no data-cached branch to fall into.
    return { result: { cached: null, needsReauth: false }, types: {} };
  }
}

/**
 * "Active jobs" panel: the character's running industry jobs (all
 * activities — manufacturing, research, copying, invention, reactions),
 * sorted soonest-ending first. Sits above the Build Plan list on /industry.
 * Independent of the blueprint catalog/build-plan state: fetches its own
 * jobs + SDE type names, so it isn't blocked on that load.
 */
export function ActiveJobsPanel({ characterId }: ActiveJobsPanelProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const { data, loading, refreshCount, refresh } = useRouteSnapshot(
    loadActiveJobsSnapshot,
    characterId
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const result = data?.result ?? null;
  const types = data?.types ?? {};

  const jobs = useMemo(() => sortJobsBySoonest(result?.cached?.data ?? []), [result]);

  const nameForBlueprint = (typeId: number): string => types[String(typeId)]?.name ?? `#${typeId}`;

  return (
    <Panel
      title={t('industry.jobsTitle')}
      actions={
        <span className="flex items-center gap-2">
          {result?.cached?.fetchedAt && <DataAgeBadge date={result.cached.fetchedAt} />}
          <IconButton
            size="sm"
            icon={<Icon.Download />}
            label={t('industry.exportCsvJobs')}
            disabled={jobs.length === 0}
            onClick={() => downloadCsv('industry-jobs', jobs, jobsCsvColumns(t, nameForBlueprint))}
          />
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('industry.jobsRefresh')}
            onClick={refresh}
            disabled={loading}
          />
        </span>
      }
    >
      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : result?.needsReauth ? (
        <ReauthBanner
          title={t('industry.jobsReauthTitle')}
          hint={t('industry.jobsReauthHint')}
          actionLabel={t('industry.jobsReauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : jobs.length === 0 ? (
        // Distinguish "ESI/cache answered, character just has none running"
        // (the common case) from "no data at all" (never fetched, offline).
        result?.cached ? (
          <EmptyState
            title={t('industry.jobsNoneActiveTitle')}
            hint={t('industry.jobsNoneActiveHint')}
            className="py-4"
          />
        ) : (
          <EmptyState
            title={t('industry.jobsEmptyTitle')}
            hint={t('industry.jobsEmptyHint')}
            className="py-4"
          />
        )
      ) : (
        <div className="space-y-2">
          {result?.cached?.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {refreshCount > 0 ? t('common.refreshFailedTitle') : t('common.offlineTitle')}
            </p>
          )}
          <ul className="space-y-2">
            {jobs.map((job) => {
              const name = nameForBlueprint(job.blueprint_type_id);
              const done = isJobDone(job, now);
              const soon = !done && isCompletingSoon(job, now);
              const progress = Math.round(jobProgress(job, now) * 100);
              const endDate = new Date(job.end_date);
              return (
                <li
                  key={job.job_id}
                  className={`rounded-xs border px-3 py-2 ${
                    soon ? 'border-warning/60 bg-warning/10' : 'border-line bg-panel-2'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{name}</span>
                    <span className="flex items-center gap-1.5">
                      {soon && (
                        <span className="rounded-xs border border-warning/50 bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-warning uppercase">
                          {t('industry.jobsCompletingSoon')}
                        </span>
                      )}
                      <span className="text-text-dim">
                        {t(activityI18nKey(job.activity_id), { id: job.activity_id })}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[0.6875rem] text-text-dim">
                    <span>{t('industry.jobsRuns', { count: job.runs })}</span>
                    <time
                      dateTime={endDate.toISOString()}
                      title={endDate.toLocaleString()}
                      className={`tabular-nums ${done ? '' : soon ? 'font-semibold text-warning' : ''}`}
                    >
                      {done ? t('industry.jobsDone') : formatDuration(secondsRemaining(job, now))}
                    </time>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={t('industry.jobsProgress', { name })}
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel"
                  >
                    <div
                      className={`h-full ${soon ? 'bg-warning' : 'bg-accent'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
