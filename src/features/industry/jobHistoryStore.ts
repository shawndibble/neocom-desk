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
    await db.industryJobHistory.put({ characterId, jobs, fetchedAt: now });
  } catch (error) {
    // History is a bonus on top of the active list; a Dexie failure must not
    // take the list (or every alert reading it) down.
    captureException(error);
  }
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
