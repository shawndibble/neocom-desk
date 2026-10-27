/**
 * Dexie side of the Job History (issue #2866): folds each fetch's delivered
 * jobs into `industryJobHistory`, one row per Character, so a job stays
 * listed after ESI stops returning it. Removed with the Character
 * (`removeCharacter.ts`).
 */
import { captureException } from '@sentry/react';
import { db } from '@/db';
import type { IndustryJob } from '@/esi/endpoints';
import { mergeJobHistory } from './jobHistory';

/** Tail of each Character's write chain: overlapping loads merge one after another, so a stale read can't overwrite a newer write. */
const writeChains = new Map<number, Promise<void>>();

async function writeHistory(
  characterId: number,
  fetched: readonly IndustryJob[],
  now: number
): Promise<void> {
  try {
    const stored = await db.industryJobHistory.get(characterId);
    const jobs = mergeJobHistory(stored?.jobs ?? [], fetched);
    if (stored && JSON.stringify(stored.jobs) === JSON.stringify(jobs)) return;
    await db.industryJobHistory.put({
      ...stored,
      characterId,
      jobs,
      fetchedAt: now,
    });
  } catch (error) {
    // History is a bonus on top of the active list; a Dexie failure must not
    // take the list (or every alert reading it) down.
    captureException(error);
  }
}

/**
 * Dismiss (or restore) one delivered job: it stops counting as "not logged"
 * but stays in History (issue #2991). Serialised with the fetch writes so a
 * concurrent merge can't drop it. Resolves false when the write failed.
 */
export function setJobDismissed(
  characterId: number,
  jobId: number,
  dismissed: boolean
): Promise<boolean> {
  let ok = true;
  const next = (writeChains.get(characterId) ?? Promise.resolve()).then(async () => {
    try {
      await db.industryJobHistory
        .where('characterId')
        .equals(characterId)
        .modify((row) => {
          const ids = new Set(row.dismissedJobIds ?? []);
          if (dismissed) ids.add(jobId);
          else ids.delete(jobId);
          row.dismissedJobIds = [...ids];
        });
    } catch (error) {
      captureException(error);
      ok = false;
    }
  });
  writeChains.set(characterId, next);
  return next.then(() => ok);
}

export function recordJobHistory(
  characterId: number,
  fetched: readonly IndustryJob[],
  now = Date.now()
): Promise<void> {
  const next = (writeChains.get(characterId) ?? Promise.resolve()).then(() =>
    writeHistory(characterId, fetched, now)
  );
  writeChains.set(characterId, next);
  return next;
}
