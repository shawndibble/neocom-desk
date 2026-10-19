import { useCallback, useEffect, useMemo, useState } from 'react';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import {
  jobSlotSkillsFromCharacterSkills,
  toJobSlotJobs,
} from '@/features/character/jobSlotSkills';
import {
  aggregateJobSlotSummary,
  type JobSlotSkills,
  type JobSlotCharacterInput,
} from '@/engine/industry/jobSlots';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import { loadAllCharactersIndustryJobs, type ActiveJob, type JobsFanOutSnapshot } from './jobs';
import type { CorpJobsSnapshot } from './corpJobs';

interface JobsFanOutInput {
  /** Set once the filter names anyone but the current Character; nothing is fetched until then. */
  needsJobSlotFanOut: boolean;
  resolvedJobsFilter: MultiSelectFilter<number>;
  jobsFilterCandidates: readonly { characterId: number; characterName: string }[];
}

/**
 * The Active Jobs panel's cross-character fan-out (issue #607): every
 * Character's jobs plus the skills the job-slot header needs, and the
 * per-selection notes derived from them.
 */
export function useJobsFanOut({
  needsJobSlotFanOut,
  resolvedJobsFilter,
  jobsFilterCandidates,
}: JobsFanOutInput) {
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
  const [refreshCount, setRefreshCount] = useState(0);
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
  }, [needsJobSlotFanOut, refreshCount]);
  const refreshJobsFanOut = useCallback(() => setRefreshCount((c) => c + 1), []);
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
  }, [needsJobSlotFanOut, resolvedJobsFilter, jobsFilterCandidates, refreshCount]);

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
  return {
    snapshot: jobsFanOut,
    loading: jobsFanOutLoading,
    refreshCount,
    refresh: refreshJobsFanOut,
    skills: jobsFanOutSkills,
    selectedEntries: jobsFanOutSelectedEntries,
    skipped: jobsFanOutSkipped,
    reauth: jobsFanOutReauth,
    fromCacheAny: jobsFanOutFromCacheAny,
    oldestFetchedAt: jobsFanOutOldestFetchedAt,
  };
}

type JobsFanOutEntries = ReturnType<typeof useJobsFanOut>['selectedEntries'];

interface JobSlotSummaryInput {
  needsJobSlotFanOut: boolean;
  fanOutEntries: JobsFanOutEntries;
  fanOutSkills: ReadonlyMap<number, JobSlotSkills>;
  /** The single-Character path reuses the skills/jobs its own snapshot already loaded. */
  characterId: number;
  singleSkills: JobSlotSkills | undefined;
  singleJobs: readonly ActiveJob[] | undefined;
  corpJobs: CorpJobsSnapshot;
  now: number;
}

/** Issue #679's header readout: open slots per category for the panel's current Character selection. */
export function useJobSlotSummary({
  needsJobSlotFanOut,
  fanOutEntries,
  fanOutSkills,
  characterId,
  singleSkills,
  singleJobs,
  corpJobs,
  now,
}: JobSlotSummaryInput) {
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
      return fanOutEntries.map((entry) => ({
        skills: fanOutSkills.get(entry.characterId),
        jobs: withCorp(entry.characterId, entry.result.cached?.data),
      }));
    }
    return [
      {
        skills: singleSkills,
        jobs: withCorp(characterId, singleJobs),
      },
    ];
  }, [
    needsJobSlotFanOut,
    fanOutEntries,
    fanOutSkills,
    singleSkills,
    singleJobs,
    characterId,
    corpJobsByInstaller,
  ]);
  const jobSlotSummary = useMemo(
    () => aggregateJobSlotSummary(jobSlotCharacterInputs, now),
    [jobSlotCharacterInputs, now]
  );
  return jobSlotSummary;
}
