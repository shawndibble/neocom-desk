import { callRouted } from '@/sync/routedCallable';
import type { VerifyPayload } from '@/engine/corpTaxBook/verifyView';

export async function readVerifyNotice(token: string): Promise<VerifyPayload> {
  return callRouted<{ token: string }, VerifyPayload>(
    'readCorpTaxBookStatementCallable',
    {
      token,
    },
    undefined
  );
}

export async function setVerifyRemindersStopped(token: string, stopped: boolean): Promise<boolean> {
  const result = await callRouted<{ token: string; stopped: boolean }, { stopped: boolean }>(
    'stopCorpTaxBookRemindersCallable',
    { token, stopped },
    undefined
  );
  return result.stopped;
}
