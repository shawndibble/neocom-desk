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
