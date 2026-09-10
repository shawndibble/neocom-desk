import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useLiveQuery } from 'dexie-react-hooks';
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
  ReauthBanner,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { db } from '@/db';
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
  contextMenuTypeId,
  loadAllCharactersIndustryJobs,
  flattenJobsWithCharacter,
  type ActiveJob,
  type JobsLoadResult,
  type JobsFanOutSnapshot,
} from './jobs';
import { formatDuration } from '@/lib/duration';
import { formatEveDateTime } from '@/lib/eveTime';
import { downloadCsv } from '@/lib/downloadCsv';
import { jobsCsvColumns } from './jobsCsv';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { loadCharacterSkills } from '@/features/skills/data';
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
import { useCorpOwner } from '@/features/corp/owner';
import { OwnerSwitch } from '@/features/corp/OwnerSwitch';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { loadCorporationIndustryJobs, type CorpJobsLoadResult } from '@/features/corp/jobs';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import {
  useResolvedCharacterFilter,
  fromStoredCharacterFilterValue,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';

/** A row on the table, tagged with its owning Character even in the single-character view — so `rowKey` and the optional character column need no branch. */
type JobRow = ActiveJob & { characterId: number; characterName: string };

/** The two derived job states this panel's Status filter offers — not ESI's raw `status` enum, just what the list already highlights. */
type JobStatusFilter = 'completingSoon' | 'done';

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
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the item under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

interface Snapshot {
  result: JobsLoadResult;
  types: TypeMap;
  /** Undefined: skills not cached/fetched yet — the job-slot header reads this as "unknown", never a guessed 0. */
  skills: JobSlotSkills | undefined;
}

/** Countdown recompute cadence; coarse (minutes granularity display) so 30s is plenty fresh. */
const TICK_MS = 30_000;

async function loadActiveJobsSnapshot(characterId: number): Promise<Snapshot> {
  try {
    const [result, types, skillsResult] = await Promise.all([
      loadCharacterIndustryJobs(characterId),
      loadTypes(),
      loadCharacterSkills(characterId),
    ]);
    return {
      result,
      types,
      skills: skillsResult ? jobSlotSkillsFromCharacterSkills(skillsResult.data.skills) : undefined,
    };
  } catch {
    // `loadTypes()` throws when the SDE fetch fails. Resolving with an empty
    // snapshot rather than rejecting is what clears the spinner — a rejected
    // load would strand the panel with no data-cached branch to fall into.
    return { result: { cached: null, needsReauth: false }, types: {}, skills: undefined };
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
  // View-only filters (not persisted): plain Sets, empty meaning "every
  // activity"/"every status" — matching how no chip pressed reads as no
  // filter everywhere else in the app. Deliberately not the shared
  // `MultiSelectFilter`/`toggleFilterMember` convention (`'all'` as the
  // no-filter sentinel): that pair is built for a picker that starts fully
  // selected and narrows by *unchecking* members (`CharacterFilterControl`).
  // This menu starts with nothing checked and narrows by *checking* the
  // activities/statuses to include, so the empty set has to mean "no
  // filter" from the very first click, not `'all'`.
  const [activityFilter, setActivityFilter] = useState<ReadonlySet<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<JobStatusFilter>>(new Set());
  // The list is folded away by default: the header's one-line read (how many
  // run, what finishes next, a bar per job) is what a pilot glancing at the
  // page wants, and the six-column table is one click away when they don't.
  const [expanded, setExpanded] = useState(false);
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
      corporationId === null ? null : loadCorporationIndustryJobs(characterId, corporationId),
    { name: 'industry:corp-jobs', characterId }
  );

  /**
   * The character-filter picker (issue #607): `'current'` by default —
   * today's exact behavior, no extra fan-out, and it keeps following the
   * active Character across a switch with no resync logic of its own
   * (`useResolvedCharacterFilter` re-resolves it whenever the active
   * Character changes) — or All/a hand-picked subset once the pilot asks. Applies only to **My
   * jobs**; Corp jobs are already "everyone in the corp," an orthogonal
   * axis, so the picker is hidden while `showingCorp` (see
   * `showCharacterFilter`, rendered in the panel header's `meta`).
   */
  const [jobsCharacterFilter, setJobsCharacterFilter] = useState<CharacterFilterValue>('current');
  // Seeded once from the synced default (Settings' Defaults panel) the
  // moment it hydrates — before that, `'current'` above is the safe seed,
  // identical to what the default itself defaults to. A press before
  // hydration lands is not overwritten: `seededFromDefault` only ever seeds
  // the picker's very first value.
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const defaultCharacterFilterHydrated = useDefaultCharacterFilter((state) => state.hydrated);
  const hydrateDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.hydrate);
  useEffect(() => {
    void hydrateDefaultCharacterFilter();
  }, [hydrateDefaultCharacterFilter]);
  const [seededFromDefault, setSeededFromDefault] = useState(false);
  if (defaultCharacterFilterHydrated && !seededFromDefault) {
    setSeededFromDefault(true);
    setJobsCharacterFilter(fromStoredCharacterFilterValue(defaultCharacterFilter));
  }

  const resolvedJobsFilter = useResolvedCharacterFilter(jobsCharacterFilter, characterId);
  // Whether the resolved filter needs more than "my own" jobs — decoupled
  // from the Corp Jobs toggle below because the job-slot header readout
  // (issue #679) must follow this filter's character set even while Corp
  // Jobs is showing: it always reports *personal* capacity, never the corp
  // list's jobs.
  const needsJobSlotFanOut =
    resolvedJobsFilter === 'all' ||
    resolvedJobsFilter.size !== 1 ||
    !resolvedJobsFilter.has(characterId);
  const showingAllJobs = !showingCorp && needsJobSlotFanOut;

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const jobsFilterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );
  const characterNameById = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );

  // Nothing fetched until the picker actually leaves "current" — same
  // opt-in shape as the corp read above, just not a corp read. No separate
  // "loading" state: `jobsFanOut === null` already means "nothing to show
  // yet" (set once, on the first successful load), and a manual refresh
  // deliberately leaves the previous snapshot in place while it re-fetches —
  // same retained-snapshot idiom `useRouteSnapshot`/`useCorpSnapshot` use
  // elsewhere in this app, and the only way to give the effect below no
  // synchronous `setState` call of its own (`react-hooks/set-state-in-effect`).
  const [jobsFanOut, setJobsFanOut] = useState<JobsFanOutSnapshot | null>(null);
  const [jobsFanOutRefreshCount, setJobsFanOutRefreshCount] = useState(0);
  useEffect(() => {
    if (!needsJobSlotFanOut) return;
    let cancelled = false;
    void loadAllCharactersIndustryJobs().then((snapshot) => {
      if (!cancelled) setJobsFanOut(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [needsJobSlotFanOut, jobsFanOutRefreshCount]);
  const refreshJobsFanOut = useCallback(() => setJobsFanOutRefreshCount((c) => c + 1), []);
  const jobsFanOutLoading = jobsFanOut === null;

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
    // which wraps each request explicitly): `loadCharacterSkills` ->
    // `loadWithCache` already swallows a failed fetch internally and
    // resolves `null` rather than rejecting, so one character's failure
    // can't sink the others or this `Promise.all` — it just leaves that
    // character out of `skillsById`, read as "unknown" below.
    void mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
      const result = await loadCharacterSkills(id);
      if (result) skillsById.set(id, jobSlotSkillsFromCharacterSkills(result.data.skills));
    }).then(() => {
      if (!cancelled) setJobsFanOutSkills(skillsById);
    });
    return () => {
      cancelled = true;
    };
  }, [needsJobSlotFanOut, resolvedJobsFilter, jobsFilterCandidates, jobsFanOutRefreshCount]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Stable `{}` fallback: `nameForBlueprint` closes over `types`, and
  // react-hooks/exhaustive-deps rejects a dependency that is a fresh object
  // on every render.
  const types = useMemo(() => data?.types ?? {}, [data]);
  // Each side keeps its own result, so the badge below reports the age of the
  // data actually on screen — the two have different cache windows and must
  // never share one value.
  const result: JobsLoadResult | CorpJobsLoadResult | null = showingCorp
    ? corp.data
    : (data?.result ?? null);
  const listLoading = showingCorp
    ? corp.loading && corp.data === null
    : showingAllJobs
      ? jobsFanOutLoading
      : // `&& !…data`: with a retained snapshot the panel keeps its rows while
        // the re-read runs, so the spinner is only for having nothing at all
        // to show.
        loading && !data;
  const listRefreshCount = showingCorp
    ? corp.refreshCount
    : showingAllJobs
      ? jobsFanOutRefreshCount
      : refreshCount;
  const listRefresh = showingCorp ? corp.refresh : showingAllJobs ? refreshJobsFanOut : refresh;

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
  // Always *personal* jobs + skills, regardless of `showingCorp` (issue
  // #679's header readout) — the single-character branch reuses `data`
  // (loaded unconditionally above), the multi-character branch reuses the
  // fan-out state above, gated on the same `needsJobSlotFanOut` that drives
  // both.
  const jobSlotCharacterInputs = useMemo<JobSlotCharacterInput[]>(() => {
    if (needsJobSlotFanOut) {
      return jobsFanOutSelectedEntries.map((entry) => ({
        skills: jobsFanOutSkills.get(entry.characterId),
        jobs: entry.result.cached ? toJobSlotJobs(entry.result.cached.data) : undefined,
      }));
    }
    return [
      {
        skills: data?.skills,
        jobs: data?.result.cached ? toJobSlotJobs(data.result.cached.data) : undefined,
      },
    ];
  }, [needsJobSlotFanOut, jobsFanOutSelectedEntries, jobsFanOutSkills, data]);
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
  // single-character paths (personal or corp) instead block the whole panel
  // behind one `ReauthBanner` below, since there is only one Character's
  // grant to ask about.
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
  const dataAgeDate = showingAllJobs
    ? jobsFanOutOldestFetchedAt
    : (result?.cached?.fetchedAt ?? null);
  const fromCacheAny = showingAllJobs
    ? jobsFanOutFromCacheAny
    : (result?.cached?.fromCache ?? false);

  const jobs = useMemo<JobRow[]>(() => {
    const unsorted: JobRow[] = showingAllJobs
      ? flattenJobsWithCharacter(jobsFanOut?.entries ?? [], resolvedJobsFilter)
      : (result?.cached?.data ?? []).map((job) => ({
          ...job,
          characterId,
          characterName: characterNameById.get(characterId) ?? '',
        }));
    return sortJobsBySoonest(unsorted);
  }, [showingAllJobs, jobsFanOut, resolvedJobsFilter, result, characterId, characterNameById]);
  const summary = useMemo(() => summarizeJobs(jobs, now), [jobs, now]);
  // A single blocking re-auth state only applies to the two single-Character
  // paths — the multi-character path never blocks the whole panel behind one
  // banner, since one alt's revoked grant must not hide everyone else's jobs.
  const blockingNeedsReauth = !showingAllJobs && (result?.needsReauth ?? false);
  // Loading, re-auth and the empty states are the whole story; only a real
  // list has anything to fold.
  const collapsible = jobs.length > 0 && !listLoading && !blockingNeedsReauth;
  const showList = !collapsible || expanded;
  // Whether more than one Character's jobs are actually on screen — the
  // character column and its badges only earn their place once they'd
  // disambiguate something (`OpenOrdersPanel`'s `showCharacterStrip` precedent).
  const showCharacterColumn = new Set(jobs.map((job) => job.characterId)).size > 1;
  // ESI or the cache answered and nothing is running. That is a one-word
  // fact, so it goes beside the title as `meta` and the body renders nothing
  // at all — a centred "no active jobs" card left the idle panel _taller_
  // than the same panel with jobs in it. Not the same as `jobsEmptyTitle`
  // below, which means we have never fetched and genuinely don't know.
  const hasAnswered = showingAllJobs ? jobsFanOut !== null : result?.cached != null;
  const noneActive = jobs.length === 0 && !listLoading && !blockingNeedsReauth && hasAnswered;
  // The owner switch still has to render when there are no corp jobs to show,
  // or flipping to an empty Corp jobs list is a dead end with no way back.
  const showBody = showList && !noneActive;
  // The per-character notes sit outside `showBody` — a revoked grant is worth
  // saying with the list folded — so the body is only genuinely empty, and the
  // panel only genuinely one line, when these are absent too.
  const hasFanOutNotices =
    showingAllJobs && (jobsFanOutReauth.length > 0 || jobsFanOutSkipped.length > 0);
  /**
   * Hidden outright for a one-Character account: "This character" and "All
   * characters" then resolve to the same pilot, so the picker is a control
   * that cannot change anything (`OpenOrdersPanel`'s `showCharacterStrip`
   * precedent). Hidden on the corp side too — Corp jobs are already "everyone
   * in the corp," an orthogonal axis to which of *my* pilots to include.
   */
  const showCharacterFilter = !showingCorp && jobsFilterCandidates.length > 1;

  // Menu entries only for activities actually present — an entry for an
  // activity type this character never runs would just be a permanently-dead
  // toggle.
  const presentActivityIds = useMemo(
    () => [...new Set(jobs.map((job) => job.activity_id))].sort((a, b) => a - b),
    [jobs]
  );
  // Only worth a control once there is more than one activity to tell apart.
  const showActivityFilter = presentActivityIds.length > 1;
  // Kept mounted while a status filter is still active even if no job
  // currently matches it — losing the control out from under an applied
  // filter would leave the list silently narrowed with no way to clear it.
  // `summary.done` (already computed above) stands in for a second
  // `jobs.some(isJobDone)` scan of the same list.
  const showStatusFilter =
    statusFilter.size > 0 || summary.done > 0 || jobs.some((job) => isCompletingSoon(job, now));

  // The job an `industryJobComplete` alert pointed at, if any. It stays in
  // this list until it is delivered, which is exactly what the alert is about.
  const highlightedJobId = useHighlightParam();

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
    setActivityFilter((current) => {
      const next = new Set(current);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  function toggleStatus(status: JobStatusFilter) {
    setStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
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
        // `.dt-stack` blocks the cell there is no row edge to stripe, and the
        // card's tint already carries the state.
        cellClassName: (job) =>
          toneClass(jobTone(job), {
            warning: 'sm:border-l sm:border-l-warning',
            success: 'sm:border-l sm:border-l-success',
          }),
        render: (job) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{nameForBlueprint(job.blueprint_type_id)}</span>
            {soon(job) && (
              <span className="rounded-xs border border-warning/50 bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-warning uppercase">
                {t('industry.jobsCompletingSoon')}
              </span>
            )}
            {done(job) && (
              <span className="rounded-xs border border-success/50 bg-success/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-success uppercase">
                {t('industry.jobsDone')}
              </span>
            )}
            {/* Only once more than one Character's jobs are on screen (`showCharacterColumn`) — same gate as `OpenOrdersPanel`'s `showCharacterStrip`. */}
            {showCharacterColumn && <CharacterBadge characterName={job.characterName} t={t} />}
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
                className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-panel sm:w-24"
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
    ],
    [t, now, soon, done, jobTone, nameForBlueprint, showCharacterColumn]
  );

  /** Right-click any row for the shared item menu. */
  const jobContextMenu = (job: JobRow, tr: ReactElement): ReactElement => {
    const menuTypeId = contextMenuTypeId(job);
    return (
      <ItemContextMenu
        typeId={menuTypeId}
        itemName={nameForBlueprint(menuTypeId)}
        blueprintTypeID={job.product_type_id !== undefined ? job.blueprint_type_id : null}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
      >
        {tr}
      </ItemContextMenu>
    );
  };

  /**
   * Open manufacturing/science/reaction slots for the panel's current
   * character-filter selection (issue #679) — sits in the header's `actions`
   * group (far right), not beside the title: parked next to "N running · N
   * done" it read as another fact about what's currently running, when it is
   * actually free *capacity* — unrelated to whether anything is running at
   * all (issue: the numbers looked like they described the same thing).
   *
   * A dashed underline expands to the used/max breakdown per category on
   * hover/focus, same wording `Characters.tsx`'s `openJobsColumn` tooltip
   * already uses (`{{used}}/{{max}} slots used`) — used, not open, is the
   * numerator a reader expects under a fraction, and here it also stays
   * legible when open happens to equal max (used reads `0/11`, not the
   * doubled-looking `11/11`). Tone is per-category, not on the group as a
   * whole: one idle pool is worth flagging even when the other two are busy.
   */
  const jobSlotSummaryElement = (
    <Tooltip
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
    >
      <span
        tabIndex={0}
        className="flex cursor-help items-center gap-1 text-xs tabular-nums underline decoration-dotted decoration-current/50 underline-offset-2"
      >
        <span className="hidden text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase sm:inline">
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
      </span>
    </Tooltip>
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
          characters={jobsFilterCandidates}
          activeCharacterId={characterId}
          value={jobsCharacterFilter}
          onChange={setJobsCharacterFilter}
        />
      )}
      {noneActive ? (
        <span className="text-xs text-text-dim">{t('industry.jobsNoneMeta')}</span>
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
          </span>
        )
      )}
    </span>
  );

  return (
    <Panel
      title={t('industry.jobsTitle')}
      meta={jobsMeta}
      actions={
        <span className="flex items-center gap-2">
          {collapsible && !expanded && (
            // One bar per job, desktop only: the fold's whole point is a
            // glance, and at phone width the names would not fit beside them.
            <span aria-hidden="true" className="hidden items-center gap-3 lg:flex">
              {jobs.slice(0, 4).map((job) => {
                const progress = Math.round(jobProgress(job, now) * 100);
                return (
                  <span
                    key={job.job_id}
                    className="flex items-center gap-1.5 text-[0.6875rem] text-text-dim"
                  >
                    <span className="max-w-28 truncate">
                      {nameForBlueprint(job.blueprint_type_id)}
                    </span>
                    <span className="block h-1.5 w-14 overflow-hidden rounded-full bg-panel">
                      <span
                        className={`block h-full ${
                          isJobDone(job, now)
                            ? 'bg-success'
                            : soon(job)
                              ? 'bg-warning'
                              : 'bg-accent'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  </span>
                );
              })}
            </span>
          )}
          {dataAgeDate && <DataAgeBadge date={dataAgeDate} />}
          {/* Grouped with `DataAgeBadge`, not appended after the caret: both
              are passive, hover-only readouts (nothing to click), while
              Export/Refresh/the caret are actions — interleaving the two
              kinds breaks the toolbar's scan order, and the caret in
              particular earns the literal last slot as this panel's primary
              affordance. Landing in `actions` at all (rather than `meta`,
              beside "N running · N done") is what answers the original ask:
              it no longer reads as a description of what's currently running. */}
          {jobSlotSummaryElement}
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
          {collapsible && (
            <IconButton
              size="sm"
              icon={<Caret expanded={expanded} />}
              label={expanded ? t('industry.jobsHideList') : t('industry.jobsShowList')}
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            />
          )}
        </span>
      }
      // Nothing renders below with the list folded and no per-character note
      // to make, so the panel sheds its padding and collapses to the header.
      padded={showBody || corpAvailable || hasFanOutNotices}
    >
      {/*
        First row inside the body rather than beside the header's badge and two
        icon buttons: at 390px that row has no space left, and the switch is a
        change of what the list below shows, not a header action. Unlike the
        character filter above it stays in the body — it is a two-option
        segmented control, far wider than a dropdown trigger.
      */}
      {corpAvailable && (
        <OwnerSwitch
          className={showBody || hasFanOutNotices ? 'mb-2' : undefined}
          value={owner}
          onChange={setOwner}
          label={t('industry.jobsOwnerLabel')}
          personalLabel={t('industry.jobsOwnerPersonal')}
          corporationLabel={t('industry.jobsOwnerCorporation')}
        />
      )}
      {hasFanOutNotices && (
        <div className="mb-2 space-y-2">
          {jobsFanOutReauth.map((entry) => (
            <ReauthBanner
              key={entry.characterId}
              variant="ghost"
              title={`${entry.characterName} — ${t('industry.jobsReauthTitle')}`}
              hint={t('industry.jobsReauthHint')}
              actionLabel={t('industry.jobsReauthAction')}
              onLogin={() => void beginEveLogin()}
            />
          ))}
          {jobsFanOutSkipped.map((s) => (
            <p key={s.characterId} className="text-xs text-text-dim">
              {s.name} — {t('industry.jobsCharacterNotShared')}
            </p>
          ))}
        </div>
      )}
      {!showBody ? null : listLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : blockingNeedsReauth ? (
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
        // Only the "no data at all" case reaches here — `noneActive` has
        // already taken "answered, none running" out of the body.
        <EmptyState
          title={t('industry.jobsEmptyTitle')}
          hint={t(showingCorp ? 'industry.jobsCorpEmptyHint' : 'industry.jobsEmptyHint')}
          className="py-4"
        />
      ) : (
        <div className="space-y-2">
          {fromCacheAny && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {listRefreshCount > 0 ? t('common.refreshFailedTitle') : t('common.offlineTitle')}
            </p>
          )}
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
                  items={presentActivityIds.map((activityId) => ({
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
          {filteredJobs.length === 0 ? (
            <EmptyState title={t('industry.jobsFilteredEmptyTitle')} className="py-4" />
          ) : (
            // Six columns overflow the route's `lg:grid-cols-[20rem_1fr]`
            // column at tablet widths; `.dt-stack` only rescues below `sm`.
            <div className="overflow-x-auto">
              <DataTable
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
                defaultSort={{ columnId: 'endsIn', direction: 'asc' }}
                density="compact"
                rowClassName={(job) =>
                  toneClass(jobTone(job), { warning: 'bg-warning/10', success: 'bg-success/10' })
                }
                rowContextMenu={jobContextMenu}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
