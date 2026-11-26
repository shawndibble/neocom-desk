import { useCallback } from 'react';
import type { Killmail } from '@/esi/endpoints';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { srpMemberBackend } from './srpMemberBackend';
import type { KillmailSubject, Read } from './SrpKillmailView';

export function useKillmailRead(subject: KillmailSubject): Read<Killmail | null> {
  const { killmailId, killmailHash } = subject;
  const load = useCallback(
    () => srpMemberBackend().killmail(killmailId, killmailHash),
    [killmailId, killmailHash]
  );
  const read = useKeyedLoad(String(killmailId), load);
  return read.status === 'failed' ? 'failed' : read.status === 'ready' ? read.data : 'loading';
}
