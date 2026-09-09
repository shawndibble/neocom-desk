import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Caret,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  Panel,
  ReauthBanner,
  Spinner,
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
import { useCorpOwner } from '@/features/corp/owner';
import { OwnerSwitch } from '@/features/corp/OwnerSwitch';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { loadCorporationIndustryJobs, type CorpJobsLoadResult } from '@/features/corp/jobs';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import {
  resolveCharacterFilter,
  fromStoredCharacterFilterValue,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';

/** A row on the table, tagged with its owning Character even in the single-character view — so `rowKey` and the optional character column need no branch. */
type JobRow = ActiveJob & { characterId: number; characterName: string };

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
   * (`resolveCharacterFilter` re-resolves it fresh every render) — or
   * All/a hand-picked subset once the pilot asks. Applies only to **My
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

  const resolvedJobsFilter = resolveCharacterFilter(jobsCharacterFilter, characterId);
  const showingAllJobs =
    !showingCorp &&
    (resolvedJobsFilter === 'all' ||
      resolvedJobsFilter.size !== 1 ||
      !resolvedJobsFilter.has(characterId));

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
    if (!showingAllJobs) return;
    let cancelled = false;
    void loadAllCharactersIndustryJobs().then((snapshot) => {
      if (!cancelled) setJobsFanOut(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [showingAllJobs, jobsFanOutRefreshCount]);
  const refreshJobsFanOut = useCallback(() => setJobsFanOutRefreshCount((c) => c + 1), []);
  const jobsFanOutLoading = jobsFanOut === null;

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

  // Chips only for activities actually present — a chip for an activity type
  // this character never runs would just be a permanently-dead toggle.
  const presentActivityIds = useMemo(
    () => [...new Set(jobs.map((job) => job.activity_id))].sort((a, b) => a - b),
    [jobs]
  );

  // The job an `industryJobComplete` alert pointed at, if any. It stays in
  // this list until it is delivered, which is exactly what the alert is about.
  const highlightedJobId = useHighlightParam();

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

  const nameForBlueprint = useCallback(
    (typeId: number): string => types[String(typeId)]?.name ?? `#${typeId}`,
    [types]
  );

  /** One binding of the warning state: the row tint, the stripe, the badge and the bar all read it. */
  const soon = useCallback((job: ActiveJob) => isCompletingSoon(job, now), [now]);

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
        cellClassName: (job) => (soon(job) ? 'sm:border-l sm:border-l-warning' : undefined),
        render: (job) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{nameForBlueprint(job.blueprint_type_id)}</span>
            {soon(job) && (
              <span className="rounded-xs border border-warning/50 bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-warning uppercase">
                {t('industry.jobsCompletingSoon')}
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
                  className={`block h-full ${soon(job) ? 'bg-warning' : 'bg-accent'}`}
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
        cellClassName: (job) => (soon(job) ? 'font-semibold text-warning' : undefined),
        // The timestamp, never the printed duration: "1d 4h" sorts before "9h" as a string.
        sortValue: (job) => Date.parse(job.end_date),
        render: (job) =>
          isJobDone(job, now) ? t('industry.jobsDone') : formatDuration(secondsRemaining(job, now)),
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
    [t, now, soon, nameForBlueprint, showCharacterColumn]
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
  const jobsMeta =
    showCharacterFilter || noneActive || collapsible ? (
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
                  className={
                    soon(summary.next.job) ? 'font-semibold text-warning' : 'text-text-dim'
                  }
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
    ) : undefined;

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
                rowClassName={(job) => (soon(job) ? 'bg-warning/10' : undefined)}
                rowContextMenu={jobContextMenu}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
