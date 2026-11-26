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
  needsJobSlotFanOut: boolean;
  resolvedJobsFilter: MultiSelectFilter<number>;
  jobsFilterCandidates: readonly { characterId: number; characterName: string }[];
}

export function useJobsFanOut({
  needsJobSlotFanOut,
  resolvedJobsFilter,
  jobsFilterCandidates,
}: JobsFanOutInput) {
  const [jobsFanOut, setJobsFanOut] = useState<JobsFanOutSnapshot | null>(null);
  const [jobsFanOutFailed, setJobsFanOutFailed] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    if (!needsJobSlotFanOut) return;
    let cancelled = false;
    void loadAllCharactersIndustryJobs()
      .then((snapshot) => {
        if (cancelled) return;
        setJobsFanOut(snapshot);
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsJobSlotFanOut, resolvedJobsFilter, jobsFilterCandidates, refreshCount]);

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
  characterId: number;
  singleSkills: JobSlotSkills | undefined;
  singleJobs: readonly ActiveJob[] | undefined;
  corpJobs: CorpJobsSnapshot;
  now: number;
}

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
