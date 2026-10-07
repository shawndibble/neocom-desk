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

export async function recordJobHistory(
  characterId: number,
  fetched: readonly IndustryJob[],
  now = Date.now()
): Promise<void> {
  try {
    // Read-merge-write without a transaction: two overlapping loads for one
    // Character write the same job set (ESI returns it whole each time), and a
    // job one of them dropped comes back on the next fetch while ESI still
    // lists it.
    const stored = await db.industryJobHistory.get(characterId);
    const jobs = mergeJobHistory(stored?.jobs ?? [], fetched);
    await db.industryJobHistory.put({ characterId, jobs, fetchedAt: now });
  } catch (error) {
    // History is a bonus on top of the active list; a Dexie failure must not
    // take the list (or every alert reading it) down.
    captureException(error);
  }
}
