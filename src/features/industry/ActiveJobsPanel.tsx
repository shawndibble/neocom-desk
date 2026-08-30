import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, ReauthBanner, Spinner } from '@/components/ui';
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

interface ActiveJobsPanelProps {
  characterId: number;
}

interface Snapshot {
  requestKey: string;
  result: JobsLoadResult;
  types: TypeMap;
}

/** Countdown recompute cadence; coarse (minutes granularity display) so 30s is plenty fresh. */
const TICK_MS = 30_000;

/**
 * "Active jobs" panel: the character's running industry jobs (all
 * activities — manufacturing, research, copying, invention, reactions),
 * sorted soonest-ending first. Sits above the Build Plan list on /industry.
 * Independent of the blueprint catalog/build-plan state: fetches its own
 * jobs + SDE type names, so it isn't blocked on that load.
 */
export function ActiveJobsPanel({ characterId }: ActiveJobsPanelProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestKey = `${characterId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [result, types] = await Promise.all([
        loadCharacterIndustryJobs(characterId),
        loadTypes(),
      ]);
      if (!cancelled) setSnapshot({ requestKey, result, types });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [characterId, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  const result = current?.result ?? null;
  const types = current?.types ?? {};

  const jobs = useMemo(() => sortJobsBySoonest(result?.cached?.data ?? []), [result]);

  return (
    <Panel
      title={t('industry.jobsTitle')}
      actions={
        <span className="flex items-center gap-2">
          {result?.cached?.fetchedAt && <DataAgeBadge date={result.cached.fetchedAt} />}
          <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            {t('industry.jobsRefresh')}
          </Button>
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
            <p className="text-[11px] text-warning uppercase">
              {refreshKey > 0 ? t('common.refreshFailedTitle') : t('common.offlineTitle')}
            </p>
          )}
          <ul className="space-y-2">
            {jobs.map((job) => {
              const name =
                types[String(job.blueprint_type_id)]?.name ?? `#${job.blueprint_type_id}`;
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
                        <span className="rounded-xs border border-warning/50 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-warning uppercase">
                          {t('industry.jobsCompletingSoon')}
                        </span>
                      )}
                      <span className="text-text-dim">
                        {t(activityI18nKey(job.activity_id), { id: job.activity_id })}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-dim">
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
