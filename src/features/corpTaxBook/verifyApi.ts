/**
 * The guest verify page's two callables (issue #4066, D27). The verify token
 * in the link is the only credential, so neither needs a session. Firebase:
 * reach this only from the lazy verify route (`app/bootImportGraph.test.ts`).
 */
import { httpsCallable } from 'firebase/functions';
import { getSyncFunctions } from '@/sync/firebaseApp';
import type { VerifyPayload } from '@/engine/corpTaxBook/verifyView';

export async function readVerifyStatement(token: string): Promise<VerifyPayload> {
  const result = await httpsCallable<{ token: string }, VerifyPayload>(
    getSyncFunctions(),
    'readCorpTaxBookStatementCallable'
  )({ token });
  return result.data;
}

/** "Stop reminders": the monthly Statement still goes. Returns the stored state. */
export async function setVerifyRemindersStopped(token: string, stopped: boolean): Promise<boolean> {
  const result = await httpsCallable<{ token: string; stopped: boolean }, { stopped: boolean }>(
    getSyncFunctions(),
    'stopCorpTaxBookRemindersCallable'
  )({ token, stopped });
  return result.data.stopped;
}
