import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  EmptyState,
  FilterChip,
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
  contextMenuTypeId,
  type ActiveJob,
  type JobsLoadResult,
} from './jobs';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { jobsCsvColumns } from './jobsCsv';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useCorpOwner } from '@/features/corp/owner';
import { OwnerSwitch } from '@/features/corp/OwnerSwitch';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { loadCorporationIndustryJobs, type CorpJobsLoadResult } from '@/features/corp/jobs';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';

interface ActiveJobsPanelProps {
  characterId: number;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the item under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
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
 *
 * For a Character holding the corp industry capability it also offers "My jobs
 * / Corp jobs" (issue #298) — genuinely the same list with a different owner,
 * since the two ESI job shapes differ only in fields this list never renders.
 * For everyone else the switch is not rendered at all and this panel is exactly
 * what it was.
 */
export function ActiveJobsPanel({
  characterId,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: ActiveJobsPanelProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  // View-only filters (not persisted): an empty set means "every activity",
  // matching how no chip pressed reads as no filter everywhere else in the app.
  const [activityFilter, setActivityFilter] = useState<ReadonlySet<number>>(new Set());
  const [completingSoonOnly, setCompletingSoonOnly] = useState(false);
  const { data, loading, refreshCount, refresh } = useRouteSnapshot(
    loadActiveJobsSnapshot,
    characterId,
    { cacheKey: 'industry:active-jobs' }
  );

  const {
    owner,
    setOwner,
    available: corpAvailable,
    corporationId,
  } = useCorpOwner('canReadIndustry');
  const showingCorp = owner === 'corporation' && corporationId !== null;

  // Nothing is fetched until the switch is actually flipped: the key is null
  // while the personal side is showing, and it carries the corporation so a
  // corp change resets rather than relabels.
  const corp = useCorpSnapshot<CorpJobsLoadResult | null>(
    showingCorp ? `${characterId}:${corporationId}` : null,
    async () =>
      corporationId === null ? null : loadCorporationIndustryJobs(characterId, corporationId)
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const types = data?.types ?? {};
  // Each side keeps its own result, so the badge below reports the age of the
  // data actually on screen — the two have different cache windows and must
  // never share one value.
  const result: JobsLoadResult | CorpJobsLoadResult | null = showingCorp
    ? corp.data
    : (data?.result ?? null);
  // `&& !…data`: with a retained snapshot the panel keeps its rows while the
  // re-read runs, so the spinner is only for having nothing at all to show.
  const listLoading = showingCorp ? corp.loading && corp.data === null : loading && !data;
  const listRefreshCount = showingCorp ? corp.refreshCount : refreshCount;
  const listRefresh = showingCorp ? corp.refresh : refresh;

  const jobs = useMemo(() => sortJobsBySoonest<ActiveJob>(result?.cached?.data ?? []), [result]);

  // Chips only for activities actually present — a chip for an activity type
  // this character never runs would just be a permanently-dead toggle.
  const presentActivityIds = useMemo(
    () => [...new Set(jobs.map((job) => job.activity_id))].sort((a, b) => a - b),
    [jobs]
  );

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (activityFilter.size > 0 && !activityFilter.has(job.activity_id)) return false;
        if (completingSoonOnly && !isCompletingSoon(job, now)) return false;
        return true;
      }),
    [jobs, activityFilter, completingSoonOnly, now]
  );

  function toggleActivity(activityId: number) {
    setActivityFilter((current) => {
      const next = new Set(current);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

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
            onClick={() =>
              downloadCsv(
                showingCorp ? 'corp-industry-jobs' : 'industry-jobs',
                jobs,
                jobsCsvColumns(t, nameForBlueprint)
              )
            }
          />
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('industry.jobsRefresh')}
            onClick={listRefresh}
            disabled={listLoading}
          />
        </span>
      }
    >
      {/*
        First row inside the body rather than beside the header's badge and two
        icon buttons: at 390px that row has no space left, and the switch is a
        change of what the list below shows, not a header action.
      */}
      {corpAvailable && (
        <OwnerSwitch
          className="mb-2"
          value={owner}
          onChange={setOwner}
          label={t('industry.jobsOwnerLabel')}
          personalLabel={t('industry.jobsOwnerPersonal')}
          corporationLabel={t('industry.jobsOwnerCorporation')}
        />
      )}
      {listLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : result?.needsReauth ? (
        <ReauthBanner
          title={t('industry.jobsReauthTitle')}
          // Only a 401 reaches here on the corp side — its 403 is the in-game
          // role gate, which `corpAuthFailure.ts` deliberately does not call a
          // re-auth — so the personal hint's "granted the new permission"
          // story would be the wrong explanation for it.
          hint={t(showingCorp ? 'industry.jobsCorpReauthHint' : 'industry.jobsReauthHint')}
          actionLabel={t('industry.jobsReauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : jobs.length === 0 ? (
        // Distinguish "ESI/cache answered, character just has none running"
        // (the common case) from "no data at all" (never fetched, offline).
        result?.cached ? (
          <EmptyState
            title={t(
              showingCorp ? 'industry.jobsCorpNoneActiveTitle' : 'industry.jobsNoneActiveTitle'
            )}
            hint={t(
              showingCorp ? 'industry.jobsCorpNoneActiveHint' : 'industry.jobsNoneActiveHint'
            )}
            className="py-4"
          />
        ) : (
          <EmptyState
            title={t('industry.jobsEmptyTitle')}
            hint={t(showingCorp ? 'industry.jobsCorpEmptyHint' : 'industry.jobsEmptyHint')}
            className="py-4"
          />
        )
      ) : (
        <div className="space-y-2">
          {result?.cached?.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {listRefreshCount > 0 ? t('common.refreshFailedTitle') : t('common.offlineTitle')}
            </p>
          )}
          {(presentActivityIds.length > 1 || jobs.some((job) => isCompletingSoon(job, now))) && (
            <div
              role="group"
              aria-label={t('industry.jobsFilterLabel')}
              className="flex flex-wrap gap-1.5"
            >
              {presentActivityIds.map((activityId) => (
                <FilterChip
                  key={activityId}
                  label={t(activityI18nKey(activityId), { id: activityId })}
                  selected={activityFilter.has(activityId)}
                  onToggle={() => toggleActivity(activityId)}
                />
              ))}
              <FilterChip
                label={t('industry.jobsCompletingSoon')}
                selected={completingSoonOnly}
                onToggle={() => setCompletingSoonOnly((v) => !v)}
              />
            </div>
          )}
          {filteredJobs.length === 0 ? (
            <EmptyState title={t('industry.jobsFilteredEmptyTitle')} className="py-4" />
          ) : (
            <ul className="space-y-2">
              {filteredJobs.map((job) => {
                const name = nameForBlueprint(job.blueprint_type_id);
                const done = isJobDone(job, now);
                const soon = !done && isCompletingSoon(job, now);
                const progress = Math.round(jobProgress(job, now) * 100);
                const endDate = new Date(job.end_date);
                const menuTypeId = contextMenuTypeId(job);
                const menuItemName = nameForBlueprint(menuTypeId);
                return (
                  <ItemContextMenu
                    key={job.job_id}
                    typeId={menuTypeId}
                    itemName={menuItemName}
                    blueprintTypeID={
                      job.product_type_id !== undefined ? job.blueprint_type_id : null
                    }
                    onAddToQuickbar={onAddToQuickbar}
                    quickbarAvailable={quickbarAvailable}
                    onShowInfo={onShowInfo}
                  >
                    <li
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
                          {done
                            ? t('industry.jobsDone')
                            : formatDuration(secondsRemaining(job, now))}
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
                  </ItemContextMenu>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
