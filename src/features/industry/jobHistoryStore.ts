import { captureException } from '@sentry/react';
import { db } from '@/db';
import type { IndustryJob } from '@/esi/endpoints';
import { mergeJobHistory } from './jobHistory';

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
    captureException(error);
  }
}

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
