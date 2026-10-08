import { HintText } from '@/components/ui/HintText';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { captureException } from '@sentry/react';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useTicker } from '@/lib/ticker';
import { useLiveQuery } from 'dexie-react-hooks';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  Button,
  Caret,
  DataAgeBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Panel,
  SegmentedControl,
  Spinner,
  Toast,
  useTimedToast,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { GrantBanner } from '@/app/GrantNote';
import { ItemInfoLink } from '@/features/entities';
import { db, type BuildPlanRecord } from '@/db';
import { loadTypes } from '@/sde/loadSde';
import type { TypeMap } from '@/sde/types';
import {
  loadCharacterIndustryJobs,
  sortJobsBySoonest,
  jobProgress,
  isJobDone,
  isCompletingSoon,
  secondsRemaining,
  summarizeJobs,
  activityI18nKey,
  canLogProductionFromJob,
  loadAllCharactersIndustryJobs,
  flattenJobsWithCharacter,
  type ActiveJob,
  type JobsLoadResult,
  type JobsFanOutSnapshot,
} from './jobs';
import {
  EMPTY_CORP_JOBS,
  loadAccountCorpIndustryJobs,
  visibleCorpJobs,
  type CorpJobsSnapshot,
} from './corpJobs';
import type { CorporationIndustryJob } from '@/esi/endpoints';
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
import { formatEveDateTime } from '@/lib/eveTime';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { jobsCsvColumns } from './jobsCsv';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import {
  jobSlotSkillsFromCharacterSkills,
  toJobSlotJobs,
} from '@/features/character/jobSlotSkills';
import {
  aggregateJobSlotSummary,
  JOB_SLOT_CATEGORIES,
  type JobSlotSkills,
  type JobSlotCharacterInput,
} from '@/engine/industry/jobSlots';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CharacterLink } from '@/features/entities';
import {
  useResolvedCharacterFilter,
  fromStoredCharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { enumParam, enumSetParam, idListParam } from '@/lib/urlState';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';

/**
 * A row on the table, tagged with its Character even in the single-character
 * view — so `rowKey` and the optional character column need no branch. For a
 * corp job (issue #2302) that Character is the installer, and `characterName`
 * is empty when the installer is a corpmate outside this account (only ever
 * the job an alert pointed at).
 */
type JobRow = ActiveJob & {
  characterId: number;
  characterName: string;
  owner: 'personal' | 'corporation';
};

/** The two derived job states this panel's Status filter offers — not ESI's raw `status` enum, just what the list already highlights. */
type JobStatusFilter = 'completingSoon' | 'done';

/**
 * The Activity and Status filters in the URL (ADR 0015). Both start empty —
 * "no filter" — so the empty set is the default and never written.
 */
const JOB_FILTER_PARAMS = {
  'jobs.activity': idListParam(),
  'jobs.status': enumSetParam<JobStatusFilter>(['completingSoon', 'done'], []),
  // Active (default, never written) or History: delivered jobs (issue #2866).
  'jobs.view': enumParam(['active', 'history'] as const, 'active'),
};
const JOBS_DEFAULT_SORT = { columnId: 'endsIn', direction: 'asc' } as const;

/** Picks a job tone's class out of a per-site map, `undefined` for the neutral case — the one place every `cellClassName`/`rowClassName`/fill-color call site turns a tone into a string. */
function toneClass(
  tone: 'warning' | 'success' | undefined,
  classes: { warning: string; success: string }
): string | undefined {
  return tone && classes[tone];
}

/**
 * One grouped multiselect dropdown — Activity and Status are two instances
 * of the exact same shape (a `Button` trigger, a `DropdownMenuCheckboxItem`
 * per option), so this exists once rather than being hand-rolled twice in
 * `ActiveJobsPanel`. Not lifted out to `components/ui` or its own file: unlike
 * `CalendarKindFilterMenu`/`CharacterFilterControl` (each shared across
 * several panels), both instances of this one live in this single component,
 * so a local, unexported function is the proportionate amount of reuse.
 */
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
            // Without this the menu closes on the first toggle, which makes
            // a multi-select take one round trip per option
            // (`CalendarKindFilterMenu`'s precedent).
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
  /** Corp-owned jobs (issue #2302), loaded alongside so a corp-only pilot never sees "no active jobs" first. */
  corpJobs: CorpJobsSnapshot;
  types: TypeMap;
  /** Undefined: skills not cached/fetched yet — the job-slot header reads this as "unknown", never a guessed 0. */
  skills: JobSlotSkills | undefined;
}

/** Countdown recompute cadence; coarse (minutes granularity display) so 30s is plenty fresh. */
const TICK_MS = 30_000;

async function loadActiveJobsSnapshot(characterId: number): Promise<Snapshot> {
  try {
    const nowMs = Date.now();
    const [result, types, corrected, corpJobs] = await Promise.all([
      loadCharacterIndustryJobs(characterId),
      loadTypes(),
      loadCorrectedSkills(characterId, nowMs, { skipQueueWithoutScope: true }),
      // Never rejects (`corpJobs.ts`), so it cannot take the personal list
      // down into the catch below with it.
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
    // `loadTypes()` throws when the SDE fetch fails. Resolving with an empty
    // snapshot rather than rejecting is what clears the spinner — a rejected
    // load would strand the panel with no data-cached branch to fall into.
    return {
      result: { cached: null, needsReauth: false },
      corpJobs: EMPTY_CORP_JOBS,
      types: {},
      skills: undefined,
    };
  }
}

/**
 * "Active jobs" panel: the character's running industry jobs (all
 * activities — manufacturing, research, copying, invention, reactions),
 * sorted soonest-ending first. Sits above the Build Plan list on /industry.
 * Independent of the blueprint catalog/build-plan state: fetches its own
 * jobs + SDE type names, so it isn't blocked on that load.
 *
 * Corp-owned jobs are listed too, by installer (issue #2302): the Characters
 * the filter selects are "whose jobs", whoever owns them. ESI's character
 * endpoint never returns a corp job, so a pilot who only runs corp jobs
 * otherwise saw an empty panel.
 */
export function ActiveJobsPanel({ characterId }: ActiveJobsPanelProps) {
  const { t } = useTranslation();
  // Shared with every other 30 s clock on screen; paused while the tab is hidden.
  const now = useTicker(TICK_MS);
  // URL-backed filters (ADR 0015), empty meaning "every activity"/"every
  // status" — matching how no chip pressed reads as no
  // filter everywhere else in the app. Deliberately not the shared
  // `MultiSelectFilter`/`toggleFilterMember` convention (`'all'` as the
  // no-filter sentinel): that pair is built for a picker that starts fully
  // selected and narrows by *unchecking* members (`CharacterFilterControl`).
  // This menu starts with nothing checked and narrows by *checking* the
  // activities/statuses to include, so the empty set has to mean "no
  // filter" from the very first click, not `'all'`.
  const [jobFilters, setJobFilters] = useUrlParams(JOB_FILTER_PARAMS);
  const activityIds = jobFilters['jobs.activity'];
  const activityFilter = useMemo<ReadonlySet<number>>(() => new Set(activityIds), [activityIds]);
  const statusFilter = jobFilters['jobs.status'];
  // The list is folded away by default: the header's one-line read (how many
  // run, what finishes next) is what a pilot glancing at the page wants, and
  // the six-column table is one click away when they don't.
  // `null` until the pilot toggles it: folded, unless an alert sent them here
  // to a job in the list (`listExpanded` below) — a pulsed row inside a folded
  // panel is a pulse nobody sees.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  // The job an `industryJobComplete`/`corpIndustryJobReady` alert pointed at,
  // if any. It stays in this list until it is delivered, which is exactly
  // what the alert is about.
  const highlightedJobId = useHighlightParam();
  const { data, loading, refreshCount, refresh } = useRouteSnapshot(
    loadActiveJobsSnapshot,
    characterId,
    { cacheKey: 'industry:active-jobs' }
  );

  /**
   * The character-filter picker (issue #607): `'current'` by default —
   * today's exact behavior, no extra fan-out, and it keeps following the
   * active Character across a switch with no resync logic of its own
   * (`useResolvedCharacterFilter` re-resolves it whenever the active
   * Character changes) — or `'all'` once the pilot asks.
   *
   * Kept in the URL (`jobs.chars`); absent, it is the synced default
   * (Settings' Defaults panel), which reads as `'current'` until it hydrates.
   * The URL never writes back to that setting.
   */
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const hydrateDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.hydrate);
  useEffect(() => {
    void hydrateDefaultCharacterFilter();
  }, [hydrateDefaultCharacterFilter]);
  const jobsCharacterParams = useMemo(
    () => ({
      'jobs.chars': characterFilterParam(fromStoredCharacterFilterValue(defaultCharacterFilter)),
    }),
    [defaultCharacterFilter]
  );
  const [jobsCharacterValues, setJobsCharacterValues] = useUrlParams(jobsCharacterParams);
  const jobsCharacterFilter = jobsCharacterValues['jobs.chars'];

  const resolvedJobsFilter = useResolvedCharacterFilter(jobsCharacterFilter, characterId);
  // Set once the filter names anyone but the current Character: gates the
  // whole list data path onto the fan-out below, and the job-slot readout
  // (issue #679) onto the same Character set.
  const needsJobSlotFanOut =
    resolvedJobsFilter === 'all' ||
    resolvedJobsFilter.size !== 1 ||
    !resolvedJobsFilter.has(characterId);

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const jobsFilterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );
  const characterNameById = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );

  // Nothing fetched until the picker actually leaves "current". No separate
  // "loading" state: `jobsFanOut === null` already means "nothing to show
  // yet" (set once, on the first successful load), and a manual refresh
  // deliberately leaves the previous snapshot in place while it re-fetches —
  // same retained-snapshot idiom `useRouteSnapshot`/`useCorpSnapshot` use
  // elsewhere in this app, and the only way to give the effect below no
  // synchronous `setState` call of its own (`react-hooks/set-state-in-effect`).
  const [jobsFanOut, setJobsFanOut] = useState<JobsFanOutSnapshot | null>(null);
  // The per-Character ESI reads are caught inside `loadAllCharactersIndustryJobs`,
  // so only its own Dexie reads can reject it — and `jobsFanOut === null` alone
  // would then mean "still loading" forever, spinner and all. This flag ends the
  // spinner without inventing an answer: `hasAnswered` stays false, so the panel
  // lands in the "no data cached" empty state, exactly where
  // `loadActiveJobsSnapshot`'s own catch puts the single-Character path.
  const [jobsFanOutFailed, setJobsFanOutFailed] = useState(false);
  const [jobsFanOutRefreshCount, setJobsFanOutRefreshCount] = useState(0);
  useEffect(() => {
    if (!needsJobSlotFanOut) return;
    let cancelled = false;
    void loadAllCharactersIndustryJobs()
      .then((snapshot) => {
        if (cancelled) return;
        setJobsFanOut(snapshot);
        // Cleared here rather than at the top of the effect: a synchronous
        // `setState` in the effect body is what the retained-snapshot shape
        // above exists to avoid (`react-hooks/set-state-in-effect`).
        setJobsFanOutFailed(false);
      })
      .catch(() => {
        if (!cancelled) setJobsFanOutFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsJobSlotFanOut, jobsFanOutRefreshCount]);
  const refreshJobsFanOut = useCallback(() => setJobsFanOutRefreshCount((c) => c + 1), []);
  const jobsFanOutLoading = jobsFanOut === null && !jobsFanOutFailed;

  // Skills for the job-slot header's max-per-category, for every character
  // the resolved filter names beyond the current one — the single-character
  // path below reuses `data.skills` (already loaded alongside its jobs) and
  // never reaches here. No new poll: this fires on the same triggers as the
  // jobs fan-out above, not its own interval.
  const [jobsFanOutSkills, setJobsFanOutSkills] = useState<ReadonlyMap<number, JobSlotSkills>>(
    new Map()
  );
  useEffect(() => {
    if (!needsJobSlotFanOut) return;
    const ids =
      resolvedJobsFilter === 'all'
        ? jobsFilterCandidates.map((c) => c.characterId)
        : [...resolvedJobsFilter];
    let cancelled = false;
    const skillsById = new Map<number, JobSlotSkills>();
    // No per-character try/catch here (unlike `rosterAttention.ts`'s fan-out,
    // which wraps each request explicitly): `loadCorrectedSkills` ->
    // `loadWithCache` already swallows a failed fetch internally and
    // resolves `null`/no cached result rather than rejecting, so one
    // character's failure can't sink the others or this `Promise.all` — it
    // just leaves that character out of `skillsById`, read as "unknown"
    // below.
    void mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
      const nowMs = Date.now();
      const corrected = await loadCorrectedSkills(id, nowMs, { skipQueueWithoutScope: true });
      if (corrected.skillsResult) {
        skillsById.set(
          id,
          jobSlotSkillsFromCharacterSkills(
            corrected.skillsResult.data.skills,
            corrected.queueResult?.data ?? [],
            nowMs
          )
        );
      }
    })
      .then(() => {
        if (!cancelled) setJobsFanOutSkills(skillsById);
      })
      // Nothing to record: `jobsFanOutSkills` starts empty and an absent
      // Character already reads as "unknown" in the job-slot header. This only
      // stops a Dexie failure here becoming an unhandled rejection.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsJobSlotFanOut, resolvedJobsFilter, jobsFilterCandidates, jobsFanOutRefreshCount]);

  // Stable `{}` fallback: `nameForBlueprint` closes over `types`, and
  // react-hooks/exhaustive-deps rejects a dependency that is a fresh object
  // on every render.
  const types = useMemo(() => data?.types ?? {}, [data]);
  const result: JobsLoadResult | null = data?.result ?? null;
  const listLoading = needsJobSlotFanOut
    ? // The snapshot carries the corp jobs in this mode too.
      jobsFanOutLoading || (loading && !data)
    : // `&& !…data`: with a retained snapshot the panel keeps its rows while
      // the re-read runs, so the spinner is only for having nothing at all
      // to show.
      loading && !data;
  const listRefreshCount = needsJobSlotFanOut ? jobsFanOutRefreshCount : refreshCount;
  // Corp jobs ride the snapshot above in both modes — one read per load, not
  // a second copy in the fan-out — so a fan-out refresh re-reads it too.
  const listRefresh = useCallback(() => {
    refresh();
    if (needsJobSlotFanOut) refreshJobsFanOut();
  }, [refresh, needsJobSlotFanOut, refreshJobsFanOut]);
  const corpJobs = data?.corpJobs ?? EMPTY_CORP_JOBS;

  // Every derived note/badge below reads only the Characters the picker
  // actually selected — narrowing to two of five must not still show a
  // reauth banner or "hasn't shared" note for one of the other three.
  const jobsFanOutSelectedEntries = useMemo(
    () =>
      (jobsFanOut?.entries ?? []).filter(
        (entry) => resolvedJobsFilter === 'all' || resolvedJobsFilter.has(entry.characterId)
      ),
    [jobsFanOut, resolvedJobsFilter]
  );
  // Issue #679's header readout — the single-character branch reuses `data`
  // (loaded unconditionally above), the multi-character branch reuses the
  // fan-out state above, gated on the same `needsJobSlotFanOut` that drives
  // both.
  // A corp job occupies its installer's slot like a personal one (issue
  // #2302) — without these, a corp-only pilot's header read every slot open
  // beside a list full of running jobs.
  const corpJobsByInstaller = useMemo(() => {
    const byInstaller = new Map<number, CorporationIndustryJob[]>();
    const seen = new Set<number>();
    for (const job of corpJobs.jobs) {
      if (seen.has(job.job_id)) continue;
      seen.add(job.job_id);
      byInstaller.set(job.installer_id, [...(byInstaller.get(job.installer_id) ?? []), job]);
    }
    return byInstaller;
  }, [corpJobs]);
  const jobSlotCharacterInputs = useMemo<JobSlotCharacterInput[]>(() => {
    const withCorp = (id: number, personal: readonly ActiveJob[] | undefined) => {
      if (personal === undefined) return undefined;
      const ids = new Set(personal.map((job) => job.job_id));
      const corp = (corpJobsByInstaller.get(id) ?? []).filter((job) => !ids.has(job.job_id));
      return toJobSlotJobs([...personal, ...corp]);
    };
    if (needsJobSlotFanOut) {
      return jobsFanOutSelectedEntries.map((entry) => ({
        skills: jobsFanOutSkills.get(entry.characterId),
        jobs: withCorp(entry.characterId, entry.result.cached?.data),
      }));
    }
    return [
      {
        skills: data?.skills,
        jobs: withCorp(characterId, data?.result.cached?.data),
      },
    ];
  }, [
    needsJobSlotFanOut,
    jobsFanOutSelectedEntries,
    jobsFanOutSkills,
    data,
    characterId,
    corpJobsByInstaller,
  ]);
  const jobSlotSummary = useMemo(
    () => aggregateJobSlotSummary(jobSlotCharacterInputs, now),
    [jobSlotCharacterInputs, now]
  );
  const jobsFanOutSkipped = useMemo(
    () =>
      (jobsFanOut?.skipped ?? []).filter(
        (s) => resolvedJobsFilter === 'all' || resolvedJobsFilter.has(s.characterId)
      ),
    [jobsFanOut, resolvedJobsFilter]
  );
  // Per-character reauth notes for the multi-character path — the
  // single-Character path instead blocks the whole panel behind one
  // `ReauthBanner` below, since there is only one Character's grant to ask
  // about.
  const jobsFanOutReauth = useMemo(
    () => jobsFanOutSelectedEntries.filter((entry) => entry.result.needsReauth),
    [jobsFanOutSelectedEntries]
  );
  const jobsFanOutFromCacheAny = useMemo(
    () => jobsFanOutSelectedEntries.some((entry) => entry.result.cached?.fromCache),
    [jobsFanOutSelectedEntries]
  );
  const jobsFanOutOldestFetchedAt = useMemo(() => {
    const times = jobsFanOutSelectedEntries
      .map((entry) => entry.result.cached?.fetchedAt.getTime())
      .filter((t): t is number => t !== undefined);
    return times.length > 0 ? new Date(Math.min(...times)) : null;
  }, [jobsFanOutSelectedEntries]);
  const personalDataAgeDate = needsJobSlotFanOut
    ? jobsFanOutOldestFetchedAt
    : (result?.cached?.fetchedAt ?? null);
  // The oldest of the two reads, like the fan-out's own oldest-Character rule.
  const dataAgeDate =
    personalDataAgeDate && corpJobs.fetchedAt
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
  // Job History (issue #2866): delivered jobs of the Characters the picker
  // names, read live from Dexie — the loader folds each fetch into it.
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
  useTimedToast(historyToast, () => setHistoryToast(null));
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
    [t]
  );
  const planIds = useLiveQuery(() => db.buildPlans.toCollection().primaryKeys(), []);
  const showHistorySegment = historyRows.length > 0 || historyView;
  const blockingNeedsReauth = !needsJobSlotFanOut && (result?.needsReauth ?? false);
  // Loading, re-auth and the empty states are the whole story; only a real
  // list has anything to fold.
  const collapsible = historyView
    ? historyRows.length > 0
    : jobs.length > 0 && !listLoading && !blockingNeedsReauth;
  // History opens unfolded: a pilot who picked it (or followed the Build Plan
  // page's badge to it) came for the rows.
  const listExpanded =
    expanded ??
    (historyView ||
      (highlightedJobId !== null && jobs.some((job) => job.job_id === highlightedJobId)));
  const showList = !collapsible || listExpanded;
  // Whether more than one Character's jobs are actually on screen — the
  // character column and its badges only earn their place once they'd
  // disambiguate something (`OpenOrdersPanel`'s `showCharacterStrip` precedent).
  const showCharacterColumn = new Set(jobs.map((job) => job.characterId)).size > 1;
  // ESI or the cache answered and nothing is running. That is a one-word
  // fact, so it goes beside the title as `meta` and the body renders nothing
  // at all — a centred "no active jobs" card left the idle panel _taller_
  // than the same panel with jobs in it. Not the same as `jobsEmptyTitle`
  // below, which means we have never fetched and genuinely don't know.
  const hasAnswered = needsJobSlotFanOut ? jobsFanOut !== null : result?.cached != null;
  const noneActive =
    !historyView && jobs.length === 0 && !listLoading && !blockingNeedsReauth && hasAnswered;
  const showBody = showList && !noneActive;
  // The per-character notes sit outside `showBody` — a revoked grant is worth
  // saying with the list folded — so the body is only genuinely empty, and the
  // panel only genuinely one line, when these are absent too.
  const hasFanOutNotices =
    needsJobSlotFanOut && (jobsFanOutReauth.length > 0 || jobsFanOutSkipped.length > 0);
  /**
   * Hidden outright for a one-Character account: "This character" and "All
   * characters" then resolve to the same pilot, so the picker is a control
   * that cannot change anything (`OpenOrdersPanel`'s `showCharacterStrip`
   * precedent).
   */
  const showCharacterFilter = jobsFilterCandidates.length > 1;

  const presentActivityIds = useMemo(
    () => [...new Set(jobs.map((job) => job.activity_id))].sort((a, b) => a - b),
    [jobs]
  );
  // Menu entries: present activities (an activity this character never runs
  // would be a dead toggle), plus any still-selected one with no job left
  // (character switch, delivered jobs, shared URL) so it can be unchecked.
  const activityMenuIds = useMemo(
    () => [...new Set([...presentActivityIds, ...activityIds])].sort((a, b) => a - b),
    [presentActivityIds, activityIds]
  );
  // Only worth a control once there is more than one activity to tell apart —
  // or while a filter is applied, same guard as Status below.
  const showActivityFilter = activityFilter.size > 0 || presentActivityIds.length > 1;
  // Kept mounted while a status filter is still active even if no job
  // currently matches it — losing the control out from under an applied
  // filter would leave the list silently narrowed with no way to clear it.
  // `summary.done` (already computed above) stands in for a second
  // `jobs.some(isJobDone)` scan of the same list.
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

  /** One binding of the warning state: the row tint, the stripe, the badge and the bar all read it. */
  const soon = useCallback((job: ActiveJob) => isCompletingSoon(job, now), [now]);
  /** One binding of the done state: same four places as `soon`, in success tone — mutually exclusive with it (`isCompletingSoon` requires time still remaining). */
  const done = useCallback((job: ActiveJob) => isJobDone(job, now), [now]);
  /** The one precedence rule (`soon` beats `done`, though they're mutually exclusive) shared by every place a job's tone shows up, so the four call sites below each pick a class from a lookup rather than re-deriving the same `soon ? … : done ? … : …` chain. */
  const jobTone = useCallback(
    (job: ActiveJob): 'warning' | 'success' | undefined =>
      soon(job) ? 'warning' : done(job) ? 'success' : undefined,
    [soon, done]
  );

  /**
   * Issue #1787: a done manufacturing/reaction job's row menu offers "Log
   * production…", resolving to whichever of the character's own Build Plans
   * builds this blueprint (0: offer to create one; 1: go straight there;
   * 2+: ask which) before landing on the plan page with the job's runs/cost
   * ready to prefill Log Production.
   */
  const navigate = useNavigate();
  const [logJobDialog, setLogJobDialog] = useState<{
    job: JobRow;
    matches: BuildPlanRecord[];
  } | null>(null);
  // Personal jobs only: the production log has no corp dimension yet
  // (`20260905-181537-production-log-row-per-allocation-sync-accept-wallet.md`).
  const canLog = useCallback(
    (job: JobRow) => job.owner === 'personal' && canLogProductionFromJob(job, now),
    [now]
  );
  const navigateToPlanWithSeed = useCallback(
    async (planId: string, job: Pick<ActiveJob, 'runs' | 'cost'> & { characterId: number }) => {
      // Active Jobs' cross-character view (issue #607) can surface a done
      // job for a character other than the active one — the plan page
      // redirects away from any plan whose `characterId` isn't the active
      // Character's, so this job's own owner must become active first, or
      // landing there would silently bounce back to the plan index.
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

  /**
   * Rebuilt on every countdown tick — the remaining time, the progress
   * fraction and the warning tone are all relative to `now`, so memoising on
   * `t` alone would freeze the clock.
   */
  const columns = useMemo<DataTableColumn<JobRow>[]>(
    () => [
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
            {soon(job) && (
              <span className="rounded-xs bg-warning/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                {t('industry.jobsCompletingSoon')}
              </span>
            )}
            {done(job) && (
              <span className="rounded-xs bg-success/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-success uppercase">
                {t('industry.jobsDone')}
              </span>
            )}
            {/* Only once more than one Character's jobs are on screen (`showCharacterColumn`) — same gate as `OpenOrdersPanel`'s `showCharacterStrip`. */}
            {job.owner === 'corporation' && (
              <span className="shrink-0 rounded-xs bg-panel-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('industry.jobsCorpBadge')}
              </span>
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
        render: (job) => job.runs.toLocaleString(),
      },
      {
        id: 'progress',
        header: t('industry.jobsColProgress'),
        // Sorts on the raw fraction, not the rounded percent the cell prints.
        sortValue: (job) => jobProgress(job, now),
        render: (job) => {
          const progress = Math.round(jobProgress(job, now) * 100);
          return (
            // Fixed track: `flex-1` in a shrink-to-fit cell has no width to
            // fill and collapses. Nothing may right-align itself below `sm`
            // either (docs/DESIGN.md §4a) — hence `sm:text-right`.
            <span className="flex items-center gap-2">
              <span
                role="progressbar"
                aria-label={t('industry.jobsProgress', {
                  name: nameForBlueprint(job.blueprint_type_id),
                })}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-panel-2 sm:w-24"
              >
                <span
                  className={`block h-full ${
                    toneClass(jobTone(job), { warning: 'bg-warning', success: 'bg-success' }) ??
                    'bg-accent'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="w-8 shrink-0 tabular-nums text-text-dim sm:text-right">
                {progress}%
              </span>
            </span>
          );
        },
      },
      {
        id: 'endsIn',
        header: t('industry.jobsColEndsIn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        cellClassName: (job) =>
          toneClass(jobTone(job), {
            warning: 'font-semibold text-warning',
            success: 'font-semibold text-success',
          }),
        // The timestamp, never the printed duration: "1d 4h" sorts before "9h" as a string.
        sortValue: (job) => Date.parse(job.end_date),
        render: (job) =>
          done(job) ? t('industry.jobsDone') : formatDuration(secondsRemaining(job, now)),
      },
      {
        id: 'ends',
        header: t('industry.jobsColEnds'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (job) => Date.parse(job.end_date),
        render: (job) => {
          const endDate = new Date(job.end_date);
          return <time dateTime={endDate.toISOString()}>{formatEveDateTime(endDate)}</time>;
        },
      },
      {
        // The one trailing control: a finished job's primary next step. Rows
        // that can't be logged (running, corp-owned) render nothing.
        id: 'logProduction',
        header: '',
        align: 'right',
        // A text button, not the corner icon `cardActions` pins: its own
        // full-width row on the phone card, 44px tall.
        cellClassName: () => 'dt-action-row',
        render: (job) =>
          canLog(job) ? (
            <Button size="sm" onClick={() => void handleLogProduction(job)}>
              {t('industry.jobsLogProduction')}
            </Button>
          ) : null,
      },
    ],
    [
      t,
      now,
      soon,
      done,
      jobTone,
      nameForBlueprint,
      showCharacterColumn,
      canLog,
      handleLogProduction,
    ]
  );
  const planIdSet = useMemo(() => new Set(planIds ?? []), [planIds]);
  const showHistoryCharacterColumn = new Set(historyRows.map((job) => job.characterId)).size > 1;
  /** A logged row's plan link: the plan page bounces off a plan that isn't the active Character's, so the owner becomes active first (`navigateToPlanWithSeed`'s same reasoning). */
  const openLoggedPlan = useCallback(
    async (characterOwner: number, planId: string) => {
      const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
      if (activeCharacterId !== characterOwner) await setActiveCharacter(characterOwner);
      navigate(`/industry/plans/${planId}`);
    },
    [navigate]
  );
  /** History's columns: what was delivered, when, and whether the Production Log has it. */
  const historyColumns = useMemo<DataTableColumn<JobRow>[]>(
    () => [
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
              <span className="rounded-xs bg-success/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-success uppercase">
                {t('industry.historyLogged')}
              </span>
            )}
            {isLoggableHistoryJob(job) &&
              historyStates.get(job.job_id)?.kind !== 'logged' &&
              dismissedJobIds.has(job.job_id) && (
                <span className="rounded-xs bg-panel-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('industry.historyDismissed')}
                </span>
              )}
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
        render: (job) => job.runs.toLocaleString(),
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
        // full-width row on the phone card, 44px tall.
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
    ],
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
  // What the table shows (filtered, in its sort order) — with the list folded
  // there is no mounted table, so it falls back to the filtered rows.
  const jobsExport = useTableExport({
    surface: 'industry-jobs',
    rows: filteredJobs,
    columns: jobsCsv,
  });

  /**
   * Open manufacturing/science/reaction slots for the panel's current
   * character-filter selection (issue #679) — sits in the header's `actions`
   * group (far right), not beside the title: parked next to "N running · N
   * done" it read as another fact about what's currently running, when it is
   * actually free *capacity* — unrelated to whether anything is running at
   * all (issue: the numbers looked like they described the same thing).
   *
   * A dotted underline (HintText) expands to the used/max breakdown per category on
   * hover/focus, same wording `Characters.tsx`'s `openJobsColumn` tooltip
   * already uses (`{{used}}/{{max}} slots used`) — used, not open, is the
   * numerator a reader expects under a fraction, and here it also stays
   * legible when open happens to equal max (used reads `0/11`, not the
   * doubled-looking `11/11`). Tone is per-category, not on the group as a
   * whole: one idle pool is worth flagging even when the other two are busy.
   */
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
      <span className="hidden text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase sm:inline">
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

  /**
   * The header's one-line read: who this panel is showing, then what it holds.
   *
   * The character filter sits here beside the title rather than in a row of
   * its own inside the body, where issue #607 first put it. Three states
   * forced the move: folded, the body is hidden but a body row was not, so the
   * "collapsed" panel stayed two rows tall with a stray control under the
   * summary; idle, the body is empty, so the picker sat alone in a padded box;
   * and the summary it stands beside — "3 running · 1 done" — has no subject
   * without it. `Panel`'s left-hand group deliberately doesn't wrap (it holds
   * every panel's title), so the wrapper here carries its own.
   */
  const jobsMeta = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {showCharacterFilter && (
        <CharacterFilterControl
          activeCharacterId={characterId}
          value={jobsCharacterFilter}
          onChange={(next) => setJobsCharacterValues({ 'jobs.chars': next })}
        />
      )}
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

  /**
   * Last-updated, Export and Refresh. With a list to fold they live inside the
   * accordion body, on the filter row's far right, so the title bar stays just
   * the summary, the slot readout and the caret. With no list (idle, loading,
   * re-auth, nothing cached) there is no body to hold them, so they fall back
   * to the header — an idle panel must still be refreshable.
   */
  const listActions = (
    <span className="flex items-center gap-2">
      {dataAgeDate && <DataAgeBadge date={dataAgeDate} />}
      {jobs.length > 0 && !historyView && (
        <TableActionsMenu name={t('industry.jobsTitle')} tableExport={jobsExport} />
      )}
      <IconButton
        size="sm"
        icon={<Icon.Refresh />}
        label={t('industry.jobsRefresh')}
        onClick={listRefresh}
        disabled={listLoading}
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
          {/* In `actions` (rather than `meta`, beside "N running · N done") so
              it doesn't read as a description of what's currently running;
              the caret keeps the literal last slot as the primary affordance. */}
          {jobSlotSummaryElement}
          {!collapsible && listActions}
          {collapsible && (
            <IconButton
              size="sm"
              icon={<Caret expanded={listExpanded} />}
              label={listExpanded ? t('industry.jobsHideList') : t('industry.jobsShowList')}
              aria-expanded={listExpanded}
              onClick={() => setExpanded(!listExpanded)}
            />
          )}
        </span>
      }
      // Nothing renders below with the list folded and no per-character note
      // to make, so the panel sheds its padding and collapses to the header.
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
                title={t('industry.jobsReauthTitle')}
                hint={t('industry.jobsReauthHint')}
                actionLabel={t('industry.jobsReauthAction')}
              />
            ))}
          {needsJobSlotFanOut &&
            jobsFanOutSkipped.map((s) => (
              <p key={s.characterId} className="text-xs text-text-dim">
                {s.name} — {t('industry.jobsCharacterNotShared')}
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
                columns={historyColumns}
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
        <GrantBanner
          characterId={characterId}
          endpoints={['getCharacterIndustryJobs']}
          title={t('industry.jobsReauthTitle')}
          hint={t('industry.jobsReauthHint')}
          actionLabel={t('industry.jobsReauthAction')}
        />
      ) : jobs.length === 0 ? (
        // Only the "no data at all" case reaches here — `noneActive` has
        // already taken "answered, none running" out of the body.
        <EmptyState
          title={t('industry.jobsEmptyTitle')}
          hint={t('industry.jobsEmptyHint')}
          className="py-4"
        />
      ) : (
        <div className="space-y-2">
          {fromCacheAny && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {listRefreshCount > 0 ? t('common.refreshFailedTitle') : t('common.offlineTitle')}
            </p>
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
            {/* Always rendered here, even with no filters to offer — this is
                the only place Export/Refresh live while the list is open. */}
            <span className="ml-auto">{listActions}</span>
          </div>
          {filteredJobs.length === 0 ? (
            // Jobs exist but none pass, so a filter is always on here.
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
            // Six columns overflow the route's `lg:grid-cols-[20rem_1fr]`
            // column at tablet widths; `.dt-stacked` only rescues below `sm`.
            <div className="overflow-x-auto">
              <DataTable
                {...jobsExport.tableProps}
                columns={columns}
                rows={filteredJobs}
                // Bare job_id, not a character-qualified key: ESI's job ids
                // are already globally unique (same reasoning as
                // OpenOrdersPanel's bare order_id), and highlightedJobId
                // below — a raw job_id from a notification's deep link —
                // must equal exactly what this returns for the pulse to find
                // its row (`DataTable`'s `rowKey(row) === highlightRowKey`).
                rowKey={(job) => job.job_id}
                highlightRowKey={highlightedJobId}
                label={t('industry.jobsTitle')}
                {...sortProps}
                density="compact"
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
          undo={
            historyToast.onUndo
              ? { label: t('industry.historyUndo'), onUndo: historyToast.onUndo }
              : undefined
          }
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
