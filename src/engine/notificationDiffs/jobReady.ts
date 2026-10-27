/**
 * The shape `diffIndustryJobComplete` and `diffCorpIndustryJobReady` (#299)
 * both diff — same edge-trigger, same fields, same personal-vs-corp job
 * shape, differing only in which endpoint filled it and which `eventId`
 * names the fire. Kept as a private helper rather than two independent
 * copies of the loop.
 */
export interface JobReadyEntry {
  jobId: number;
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface JobReadyFire<TEventId extends string> {
  eventId: TEventId;
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
  endMs: number;
}

/**
 * Fires per job whose `endMs` is newly in the past — edge-triggered the same
 * way as `diffSkillLevelComplete`, comparing the job's own fixed finish
 * instant against `prev.nowMs` rather than matching job identity against
 * `prev.entries`. Both loaders this feeds (`loadCharacterIndustryJobs`,
 * `loadCorporationIndustryJobs`) only return non-completed jobs (GLOSSARY.md/
 * ADR: ESI keeps a finished-but-undelivered job at status `ready` in that
 * list until collected), so a job can sit in `next.entries` for many polls
 * after completing — the `endMs <= prev.nowMs` check is what stops a re-fire
 * on every one of those polls.
 */
export function diffJobReady<TEventId extends string, TEntry extends JobReadyEntry>(
  eventId: TEventId,
  characterId: number,
  prev: { entries: readonly TEntry[]; nowMs: number } | undefined,
  next: { entries: readonly TEntry[]; nowMs: number }
): JobReadyFire<TEventId>[] {
  if (!prev) return [];
  const fires: JobReadyFire<TEventId>[] = [];
  for (const entry of next.entries) {
    if (entry.endMs > next.nowMs) continue;
    if (entry.endMs <= prev.nowMs) continue;
    fires.push({
      eventId,
      characterId,
      jobId: entry.jobId,
      blueprintTypeId: entry.blueprintTypeId,
      productTypeId: entry.productTypeId,
      activityId: entry.activityId,
      endMs: entry.endMs,
    });
  }
  return fires;
}
