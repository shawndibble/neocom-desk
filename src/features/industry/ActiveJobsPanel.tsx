import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { HintText } from '@/components/ui/HintText';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useNavigate } from 'react-router-dom';
import { captureException } from '@sentry/react';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useTicker } from '@/lib/ticker';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccountCharacters } from '@/features/character/useCharacters';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  Button,
  CaretToggle,
  DataAgeBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  LoadFailedState,
  Panel,
  SegmentedControl,
  Spinner,
  Toast,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { db, type BuildPlanRecord } from '@/db';
import { loadTypes } from '@/sde/loadSde';
import type { TypeMap } from '@/sde/types';
import {
  loadCharacterIndustryJobs,
  sortJobsBySoonest,
  isJobDone,
  isCompletingSoon,
  summarizeJobs,
  canLogProductionFromJob,
  JOBS_TICK_MS,
  activityI18nKey,
  flattenJobsWithCharacter,
  type ActiveJob,
  type JobsLoadResult,
} from './jobs';
import {
  EMPTY_CORP_JOBS,
  loadAccountCorpIndustryJobs,
  visibleCorpJobs,
  type CorpJobsSnapshot,
} from './corpJobs';
import {
  findMatchingBuildPlans,
  createBuildPlanForJob,
  jobProductionSeed,
} from './logProductionFromJob';
import { LogProductionFromJobDialog } from './LogProductionFromJobDialog';
import { countUnloggedDeliveries, isLoggableHistoryJob } from './jobHistory';
import { useHistoryStates, useJobHistoryData } from './useJobHistory';
import { setJobDismissed } from './jobHistoryStore';
import { formatDuration } from '@/lib/duration';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { jobHistoryCsvColumns, jobsCsvColumns } from './jobsCsv';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { jobSlotSkillsFromCharacterSkills } from '@/features/character/jobSlotSkills';
import { JOB_SLOT_CATEGORIES, type JobSlotSkills } from '@/engine/industry/jobSlots';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { enumParam, enumSetParam, idListParam } from '@/lib/urlState';
import { useIndustryCharacterFilter } from './industryCharacterFilter';
import { activeJobColumns, historyColumns, toneClass, type JobRow } from './activeJobColumns';
import { useJobSlotSummary, useJobsFanOut } from './useJobsFanOut';

type JobStatusFilter = 'completingSoon' | 'done';

const JOB_FILTER_PARAMS = {
  'jobs.activity': idListParam(),
  'jobs.status': enumSetParam<JobStatusFilter>(['completingSoon', 'done'], []),
  'jobs.view': enumParam(['active', 'history'] as const, 'active'),
};
const JOBS_DEFAULT_SORT = { columnId: 'endsIn', direction: 'asc' } as const;

function JobFilterMenu<T extends string | number>({
  triggerLabel,
  items,
  selected,
  onToggle,
}: {
  triggerLabel: string;
  items: readonly { value: T; label: string }[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">{triggerLabel}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.value}
            checked={selected.has(item.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(item.value)}
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ActiveJobsPanelProps {
  characterId: number;
}

interface Snapshot {
  result: JobsLoadResult;
  corpJobs: CorpJobsSnapshot;
  types: TypeMap;
  skills: JobSlotSkills | undefined;
}

async function loadActiveJobsSnapshot(characterId: number): Promise<Snapshot> {
  try {
    const nowMs = Date.now();
    const [result, types, corrected, corpJobs] = await Promise.all([
      loadCharacterIndustryJobs(characterId),
      loadTypes(),
      loadCorrectedSkills(characterId, nowMs, { skipQueueWithoutScope: true }),
      loadAccountCorpIndustryJobs(characterId),
    ]);
    return {
      result,
      corpJobs,
      types,
      skills: corrected.skillsResult
        ? jobSlotSkillsFromCharacterSkills(
            corrected.skillsResult.data.skills,
            corrected.queueResult?.data ?? [],
            nowMs
          )
        : undefined,
    };
  } catch {
    return {
      result: { cached: null, needsReauth: false },
      corpJobs: EMPTY_CORP_JOBS,
      types: {},
      skills: undefined,
    };
  }
}

export function ActiveJobsPanel({ characterId }: ActiveJobsPanelProps) {
  const { t } = useTranslation();
  const now = useTicker(JOBS_TICK_MS);
  const [jobFilters, setJobFilters] = useUrlParams(JOB_FILTER_PARAMS);
  const activityIds = jobFilters['jobs.activity'];
  const activityFilter = useMemo<ReadonlySet<number>>(() => new Set(activityIds), [activityIds]);
  const statusFilter = jobFilters['jobs.status'];
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const highlightedJobId = useHighlightParam();
  const { data, loading, refreshCount, refresh } = useRouteSnapshot(
    loadActiveJobsSnapshot,
    characterId,
    { cacheKey: 'industry:active-jobs' }
  );

  const [jobsCharacterFilter] = useIndustryCharacterFilter();

  const resolvedJobsFilter = useResolvedCharacterFilter(jobsCharacterFilter, characterId);
  const needsJobSlotFanOut =
    resolvedJobsFilter === 'all' ||
    resolvedJobsFilter.size !== 1 ||
    !resolvedJobsFilter.has(characterId);

  const { candidates: jobsFilterCandidates, namesById: characterNameById } = useAccountCharacters();

  const {
    snapshot: jobsFanOut,
    loading: jobsFanOutLoading,
    refreshCount: jobsFanOutRefreshCount,
    refresh: refreshJobsFanOut,
    skills: jobsFanOutSkills,
    selectedEntries: jobsFanOutSelectedEntries,
    skipped: jobsFanOutSkipped,
    reauth: jobsFanOutReauth,
    fromCacheAny: jobsFanOutFromCacheAny,
    oldestFetchedAt: jobsFanOutOldestFetchedAt,
  } = useJobsFanOut({ needsJobSlotFanOut, resolvedJobsFilter, jobsFilterCandidates });

  const types = useMemo(() => data?.types ?? {}, [data]);
  const result: JobsLoadResult | null = data?.result ?? null;
  const listLoading = needsJobSlotFanOut
    ? jobsFanOutLoading || (loading && !data)
    : loading && !data;
  const listRefreshCount = needsJobSlotFanOut ? jobsFanOutRefreshCount : refreshCount;
  const listRefresh = useCallback(() => {
    refresh();
    if (needsJobSlotFanOut) refreshJobsFanOut();
  }, [refresh, needsJobSlotFanOut, refreshJobsFanOut]);
  const corpJobs = data?.corpJobs ?? EMPTY_CORP_JOBS;

  const jobSlotSummary = useJobSlotSummary({
    needsJobSlotFanOut,
    fanOutEntries: jobsFanOutSelectedEntries,
    fanOutSkills: jobsFanOutSkills,
    characterId,
    singleSkills: data?.skills,
    singleJobs: data?.result.cached?.data,
    corpJobs,
    now,
  });
  const personalDataAgeDate = needsJobSlotFanOut
    ? jobsFanOutOldestFetchedAt
    : (result?.cached?.fetchedAt ?? null);
  const personalReads = needsJobSlotFanOut
    ? jobsFanOutSelectedEntries.map((entry) => entry.result)
    : result
      ? [result]
      : [];
  const personalReadFailed = personalReads.some(
    (read) => read.cached === null && !read.needsReauth
  );
  const dataAgeDate = personalReadFailed
    ? null
    : personalDataAgeDate && corpJobs.fetchedAt
      ? new Date(Math.min(personalDataAgeDate.getTime(), corpJobs.fetchedAt.getTime()))
      : (personalDataAgeDate ?? corpJobs.fetchedAt);
  const fromCacheAny =
    (needsJobSlotFanOut ? jobsFanOutFromCacheAny : (result?.cached?.fromCache ?? false)) ||
    corpJobs.fromCache;

  const jobs = useMemo<JobRow[]>(() => {
    const personal: JobRow[] = (
      needsJobSlotFanOut
        ? flattenJobsWithCharacter(jobsFanOut?.entries ?? [], resolvedJobsFilter)
        : (result?.cached?.data ?? []).map((job) => ({
            ...job,
            characterId,
            characterName: characterNameById.get(characterId) ?? '',
          }))
    ).map((job) => ({ ...job, owner: 'personal' as const }));
    const corp: JobRow[] = visibleCorpJobs(corpJobs.jobs, {
      accountCharacterIds: new Set(characterNameById.keys()),
      filter: needsJobSlotFanOut ? resolvedJobsFilter : new Set([characterId]),
      highlightJobId: highlightedJobId,
      personalJobIds: new Set(personal.map((job) => job.job_id)),
    }).map((job) => ({
      ...job,
      characterId: job.installer_id,
      characterName: characterNameById.get(job.installer_id) ?? '',
      owner: 'corporation' as const,
    }));
    return sortJobsBySoonest([...personal, ...corp]);
  }, [
    needsJobSlotFanOut,
    jobsFanOut,
    resolvedJobsFilter,
    result,
    characterId,
    characterNameById,
    corpJobs,
    highlightedJobId,
  ]);
  const summary = useMemo(() => summarizeJobs(jobs, now), [jobs, now]);
  const toneSig = jobs
    .map((job) => (isJobDone(job, now) ? 'd' : isCompletingSoon(job, now) ? 's' : '-'))
    .join('');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally frozen between tone changes
  const toneNow = useMemo(() => now, [toneSig]);
  const historyView = jobFilters['jobs.view'] === 'history';
  const historyData = useJobHistoryData();
  const historyRows = useMemo<JobRow[]>(() => {
    const selected = needsJobSlotFanOut ? resolvedJobsFilter : new Set([characterId]);
    return (historyData.jobs ?? [])
      .filter((job) => selected === 'all' || selected.has(job.characterId))
      .map((job) => ({
        ...job,
        characterName: characterNameById.get(job.characterId) ?? '',
        owner: 'personal' as const,
      }))
      .sort((a, b) => Date.parse(b.end_date) - Date.parse(a.end_date));
  }, [historyData.jobs, needsJobSlotFanOut, resolvedJobsFilter, characterId, characterNameById]);
  const historyStates = useHistoryStates(historyRows, historyData.runs);
  const dismissedJobIds = historyData.dismissedJobIds;
  const unloggedCount = countUnloggedDeliveries(historyRows, historyStates, { dismissedJobIds });
  const [historyToast, setHistoryToast] = useState<{ message: string; onUndo?: () => void } | null>(
    null
  );
  const setDismissed = useCallback(
    async (job: JobRow, dismissed: boolean) => {
      const ok = await setJobDismissed(job.characterId, job.job_id, dismissed);
      if (!ok) {
        setHistoryToast({ message: t('industry.historyDismissFailed') });
        return;
      }
      setHistoryToast(
        dismissed
          ? {
              message: t('industry.historyDismissedToast'),
              onUndo: () => {
                setHistoryToast(null);
                void setJobDismissed(job.characterId, job.job_id, false).then((restored) => {
                  if (!restored) setHistoryToast({ message: t('industry.historyDismissFailed') });
                });
              },
            }
          : null
      );
    },
    [t, setHistoryToast]
  );
  const planIds = useLiveQuery(() => db.buildPlans.toCollection().primaryKeys(), []);
  const showHistorySegment = historyRows.length > 0 || historyView;
  const blockingNeedsReauth = !needsJobSlotFanOut && (result?.needsReauth ?? false);
  const collapsible = historyView
    ? historyRows.length > 0
    : jobs.length > 0 && !listLoading && !blockingNeedsReauth;
  const listExpanded =
    expanded ??
    (historyView ||
      (highlightedJobId !== null && jobs.some((job) => job.job_id === highlightedJobId)));
  const showList = !collapsible || listExpanded;
  const showCharacterColumn = new Set(jobs.map((job) => job.characterId)).size > 1;
  const hasAnswered = needsJobSlotFanOut ? jobsFanOut !== null : result?.cached != null;
  const noneActive =
    !historyView && jobs.length === 0 && !listLoading && !blockingNeedsReauth && hasAnswered;
  const showBody = showList && !noneActive;
  const hasFanOutNotices =
    needsJobSlotFanOut && (jobsFanOutReauth.length > 0 || jobsFanOutSkipped.length > 0);

  const presentActivityIds = useMemo(
    () => [...new Set(jobs.map((job) => job.activity_id))].sort((a, b) => a - b),
    [jobs]
  );
  const activityMenuIds = useMemo(
    () => [...new Set([...presentActivityIds, ...activityIds])].sort((a, b) => a - b),
    [presentActivityIds, activityIds]
  );
  const showActivityFilter = activityFilter.size > 0 || presentActivityIds.length > 1;
  const showStatusFilter =
    statusFilter.size > 0 || summary.done > 0 || jobs.some((job) => isCompletingSoon(job, now));

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (activityFilter.size > 0 && !activityFilter.has(job.activity_id)) return false;
        if (statusFilter.size > 0) {
          const matchesSoon = statusFilter.has('completingSoon') && isCompletingSoon(job, now);
          const matchesDone = statusFilter.has('done') && isJobDone(job, now);
          if (!matchesSoon && !matchesDone) return false;
        }
        return true;
      }),
    [jobs, activityFilter, statusFilter, now]
  );

  function toggleActivity(activityId: number) {
    const next = activityIds.includes(activityId)
      ? activityIds.filter((id) => id !== activityId)
      : [...activityIds, activityId];
    setJobFilters({ 'jobs.activity': next });
  }

  function resetJobFilters() {
    setJobFilters({ 'jobs.activity': [], 'jobs.status': new Set() });
  }

  function toggleStatus(status: JobStatusFilter) {
    const next = new Set(statusFilter);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setJobFilters({ 'jobs.status': next });
  }

  const nameForBlueprint = useCallback(
    (typeId: number): string => types[String(typeId)]?.name ?? `#${typeId}`,
    [types]
  );

  const soon = useCallback((job: ActiveJob) => isCompletingSoon(job, toneNow), [toneNow]);
  const done = useCallback((job: ActiveJob) => isJobDone(job, toneNow), [toneNow]);
  const jobTone = useCallback(
    (job: ActiveJob): 'warning' | 'success' | undefined =>
      soon(job) ? 'warning' : done(job) ? 'success' : undefined,
    [soon, done]
  );

  const navigate = useNavigate();
  const [logJobDialog, setLogJobDialog] = useState<{
    job: JobRow;
    matches: BuildPlanRecord[];
  } | null>(null);
  const canLog = useCallback(
    (job: JobRow) => job.owner === 'personal' && canLogProductionFromJob(job, toneNow),
    [toneNow]
  );
  const navigateToPlanWithSeed = useCallback(
    async (planId: string, job: Pick<ActiveJob, 'runs' | 'cost'> & { characterId: number }) => {
      const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
      if (activeCharacterId !== job.characterId) {
        await setActiveCharacter(job.characterId);
      }
      navigate(`/industry/plans/${planId}`, {
        state: { logProductionFromJob: jobProductionSeed(job) },
      });
    },
    [navigate]
  );
  const handleLogProduction = useCallback(
    async (job: JobRow) => {
      try {
        const matches = await findMatchingBuildPlans(job.characterId, job);
        if (matches.length === 1) {
          await navigateToPlanWithSeed(matches[0].id, job);
          return;
        }
        setLogJobDialog({ job, matches });
      } catch (error) {
        captureException(error);
      }
    },
    [navigateToPlanWithSeed, setLogJobDialog]
  );

  const columns = useMemo(
    () =>
      activeJobColumns({
        t,
        nameForBlueprint,
        soon,
        done,
        jobTone,
        showCharacterColumn,
        canLog,
        handleLogProduction,
      }),
    [t, soon, done, jobTone, nameForBlueprint, showCharacterColumn, canLog, handleLogProduction]
  );
  const planIdSet = useMemo(() => new Set(planIds ?? []), [planIds]);
  const showHistoryCharacterColumn = new Set(historyRows.map((job) => job.characterId)).size > 1;
  const openLoggedPlan = useCallback(
    async (characterOwner: number, planId: string) => {
      const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
      if (activeCharacterId !== characterOwner) await setActiveCharacter(characterOwner);
      navigate(`/industry/plans/${planId}`);
    },
    [navigate]
  );
  const historyColumnDefs = useMemo(
    () =>
      historyColumns({
        t,
        nameForBlueprint,
        historyStates,
        dismissedJobIds,
        setDismissed,
        showHistoryCharacterColumn,
        planIdSet,
        openLoggedPlan,
        handleLogProduction,
      }),
    [
      t,
      nameForBlueprint,
      historyStates,
      dismissedJobIds,
      setDismissed,
      showHistoryCharacterColumn,
      planIdSet,
      openLoggedPlan,
      handleLogProduction,
    ]
  );
  const sortProps = useUrlSort(
    'jobs.sort',
    JOBS_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  const jobsCsv = useMemo(() => jobsCsvColumns(t, nameForBlueprint), [t, nameForBlueprint]);
  const jobsExport = useTableExport({
    surface: 'industry-jobs',
    rows: filteredJobs,
    columns: jobsCsv,
  });
  const historyCsv = useMemo(
    () => jobHistoryCsvColumns(t, nameForBlueprint, historyStates, dismissedJobIds),
    [t, nameForBlueprint, historyStates, dismissedJobIds]
  );
  const historyExport = useTableExport({
    surface: 'industry-job-history',
    rows: historyRows,
    columns: historyCsv,
  });

  const jobSlotSummaryElement = (
    <HintText
      content={JOB_SLOT_CATEGORIES.map((category) => {
        const entry = jobSlotSummary[category];
        const label = t(`characters.jobSlotCategory.${category}`);
        return entry
          ? t('industry.jobSlotBreakdown', {
              category: label,
              used: entry.max - entry.open,
              max: entry.max,
            })
          : t('industry.jobSlotBreakdownUnknown', { category: label });
      }).join(' · ')}
      className="flex items-center gap-1 text-xs tabular-nums"
    >
      <span className={cx(eyebrowClassName, 'hidden sm:inline')}>
        {t('industry.jobSlotSummaryLabel')}
      </span>
      {JOB_SLOT_CATEGORIES.map((category, index) => {
        const entry = jobSlotSummary[category];
        const tone = !entry
          ? 'text-text-dim'
          : entry.open === entry.max
            ? 'text-danger'
            : entry.open / entry.max >= 0.5
              ? 'text-warning'
              : 'text-text';
        return (
          <span key={category} className="flex items-center gap-1">
            {index > 0 && <span className="text-text-dim">/</span>}
            <span className={tone}>{entry ? entry.open : '—'}</span>
          </span>
        );
      })}
    </HintText>
  );

  const jobsMeta = (
    <span className="flex min-w-0 flex-1 basis-0 flex-wrap items-center gap-x-3 gap-y-1">
      {showHistorySegment && (
        <SegmentedControl
          label={t('industry.jobsViewLabel')}
          size="sm"
          value={historyView ? 'history' : 'active'}
          options={[
            { value: 'active', label: t('industry.jobsViewActive') },
            { value: 'history', label: t('industry.jobsViewHistory') },
          ]}
          onChange={(view) => {
            setJobFilters({ 'jobs.view': view });
            if (view === 'history') setExpanded(true);
          }}
        />
      )}
      {historyView ? (
        collapsible && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
            {unloggedCount > 0 && (
              <span className="font-semibold text-warning">
                {t('industry.jobsUnloggedPhrase', { count: unloggedCount })}
              </span>
            )}
          </span>
        )
      ) : noneActive ? (
        <span className="flex flex-wrap items-center gap-x-3 text-xs">
          <span className="text-text-dim">{t('industry.jobsNoneMeta')}</span>
          {unloggedCount > 0 && (
            <span className="font-semibold text-warning">
              {t('industry.jobsUnloggedPhrase', { count: unloggedCount })}
            </span>
          )}
        </span>
      ) : (
        collapsible && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
            <span className="text-text">
              {t('industry.jobsSummary', { running: summary.running, done: summary.done })}
            </span>
            {summary.next && (
              <span
                className={soon(summary.next.job) ? 'font-semibold text-warning' : 'text-text-dim'}
              >
                {t('industry.jobsNextFinish', {
                  name: nameForBlueprint(summary.next.job.blueprint_type_id),
                  time: formatDuration(summary.next.seconds),
                })}
              </span>
            )}
            {!listExpanded && unloggedCount > 0 && (
              <span className="font-semibold text-warning">
                {t('industry.jobsUnloggedPhrase', { count: unloggedCount })}
              </span>
            )}
          </span>
        )
      )}
    </span>
  );

  const listActions = (
    <span className="flex items-center gap-2">
      {dataAgeDate && <DataAgeBadge date={dataAgeDate} />}
      {jobs.length > 0 && !historyView && (
        <TableActionsMenu name={t('industry.jobsTitle')} tableExport={jobsExport} />
      )}
      {historyRows.length > 0 && historyView && (
        <TableActionsMenu name={t('industry.historyTableLabel')} tableExport={historyExport} />
      )}
      <IconButton
        size="sm"
        icon={<Icon.Refresh />}
        label={t('industry.jobsRefresh')}
        onClick={listRefresh}
        busy={listLoading}
      />
    </span>
  );

  return (
    <Panel
      title={t('industry.jobsTitle')}
      meta={jobsMeta}
      wrapMeta
      actions={
        <span className="flex items-center gap-2">
          {jobSlotSummaryElement}
          {!collapsible && listActions}
        </span>
      }
      onHeaderToggle={collapsible ? () => setExpanded(!listExpanded) : undefined}
      leading={
        collapsible && (
          <CaretToggle
            expanded={listExpanded}
            label={listExpanded ? t('industry.jobsHideList') : t('industry.jobsShowList')}
            onClick={() => setExpanded(!listExpanded)}
          />
        )
      }
      padded={showBody || hasFanOutNotices}
    >
      {hasFanOutNotices && (
        <div className="mb-2 space-y-2">
          {needsJobSlotFanOut &&
            jobsFanOutReauth.map((entry) => (
              <GrantBanner
                key={entry.characterId}
                characterId={entry.characterId}
                characterName={entry.characterName}
                endpoints={['getCharacterIndustryJobs']}
                variant="ghost"
              />
            ))}
          {needsJobSlotFanOut &&
            jobsFanOutSkipped.map((s) => (
              <p key={s.characterId} className="text-xs text-text-dim">
                {s.name} — <GrantMissingLink groups={['industry']} />
              </p>
            ))}
        </div>
      )}
      {!showBody ? null : historyView ? (
        <div className="space-y-2">
          {collapsible && <div className="flex justify-end">{listActions}</div>}
          {historyRows.length === 0 ? (
            <EmptyState
              title={t('industry.historyEmptyTitle')}
              hint={t('industry.historyEmptyHint')}
              className="py-4"
            />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                columns={historyColumnDefs}
                {...historyExport.tableProps}
                rows={historyRows}
                rowKey={(job) => job.job_id}
                label={t('industry.historyTableLabel')}
                defaultSort={{ columnId: 'delivered', direction: 'desc' }}
                density="compact"
                mobileSort
                rowClassName={(job) =>
                  isLoggableHistoryJob(job) &&
                  historyStates.get(job.job_id)?.kind !== 'logged' &&
                  !dismissedJobIds.has(job.job_id)
                    ? 'bg-warning/10'
                    : undefined
                }
              />
            </div>
          )}
        </div>
      ) : listLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : blockingNeedsReauth ? (
        <GrantBanner characterId={characterId} endpoints={['getCharacterIndustryJobs']} />
      ) : jobs.length === 0 ? (
        <LoadFailedState
          title={t('industry.jobsEmptyTitle')}
          onRetry={listRefresh}
          className="py-4"
        />
      ) : (
        <div className="space-y-2">
          {fromCacheAny && (
            <CachedNotice withBadge fetchedAt={dataAgeDate} refreshFailed={listRefreshCount > 0} />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {(showActivityFilter || showStatusFilter) && (
              <div
                role="group"
                aria-label={t('industry.jobsFilterLabel')}
                className="flex flex-wrap gap-1.5"
              >
                {showActivityFilter && (
                  <JobFilterMenu
                    triggerLabel={
                      activityFilter.size === 0
                        ? t('industry.jobsFilterActivity')
                        : t('industry.jobsFilterWithCount', {
                            label: t('industry.jobsFilterActivity'),
                            count: activityFilter.size,
                          })
                    }
                    items={activityMenuIds.map((activityId) => ({
                      value: activityId,
                      label: t(activityI18nKey(activityId), { id: activityId }),
                    }))}
                    selected={activityFilter}
                    onToggle={toggleActivity}
                  />
                )}
                {showStatusFilter && (
                  <JobFilterMenu
                    triggerLabel={
                      statusFilter.size === 0
                        ? t('industry.jobsFilterStatus')
                        : t('industry.jobsFilterWithCount', {
                            label: t('industry.jobsFilterStatus'),
                            count: statusFilter.size,
                          })
                    }
                    items={[
                      { value: 'completingSoon' as const, label: t('industry.jobsCompletingSoon') },
                      { value: 'done' as const, label: t('industry.jobsDone') },
                    ]}
                    selected={statusFilter}
                    onToggle={toggleStatus}
                  />
                )}
              </div>
            )}
            <span className="ml-auto">{listActions}</span>
          </div>
          {filteredJobs.length === 0 ? (
            <EmptyState
              title={t('industry.jobsFilteredEmptyTitle')}
              className="py-4"
              action={
                <Button size="sm" onClick={resetJobFilters}>
                  {t('common.resetFilters')}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                {...jobsExport.tableProps}
                columns={columns}
                rows={filteredJobs}
                rowKey={(job) => job.job_id}
                highlightRowKey={highlightedJobId}
                label={t('industry.jobsTitle')}
                {...sortProps}
                density="compact"
                stackLayout="dense"
                mobileSort
                rowClassName={(job) =>
                  toneClass(jobTone(job), { warning: 'bg-warning/10', success: 'bg-success/10' })
                }
              />
            </div>
          )}
        </div>
      )}
      {historyToast && (
        <Toast
          message={historyToast.message}
          instance={historyToast}
          undo={
            historyToast.onUndo
              ? { label: t('industry.historyUndo'), onUndo: historyToast.onUndo }
              : undefined
          }
          onClose={() => setHistoryToast(null)}
        />
      )}
      {logJobDialog && (
        <LogProductionFromJobDialog
          productName={nameForBlueprint(
            logJobDialog.job.product_type_id ?? logJobDialog.job.blueprint_type_id
          )}
          matches={logJobDialog.matches}
          onCreatePlan={() => createBuildPlanForJob(logJobDialog.job.characterId, logJobDialog.job)}
          onResolved={(planId) => {
            void navigateToPlanWithSeed(planId, logJobDialog.job);
            setLogJobDialog(null);
          }}
          onClose={() => setLogJobDialog(null)}
        />
      )}
    </Panel>
  );
}
