/**
 * The guest verify page's two callables (issue #4066, D27). The verify token
 * in the link is the only credential, so neither needs a session. Firebase:
 * reach this only from the lazy verify route (`app/bootImportGraph.test.ts`).
 */
import { callRouted } from '@/sync/routedCallable';
import type { VerifyPayload } from '@/engine/corpTaxBook/verifyView';

export async function readVerifyStatement(token: string): Promise<VerifyPayload> {
  return callRouted<{ token: string }, VerifyPayload>(
    'readCorpTaxBookStatementCallable',
    {
      token,
    },
    undefined
  );
}

/** "Stop reminders": the monthly Statement still goes. Returns the stored state. */
export async function setVerifyRemindersStopped(token: string, stopped: boolean): Promise<boolean> {
  const result = await callRouted<{ token: string; stopped: boolean }, { stopped: boolean }>(
    'stopCorpTaxBookRemindersCallable',
    { token, stopped },
    undefined
  );
  return result.stopped;
}
