import { useEffect, useState } from 'react';
import type { Killmail } from '@/esi/endpoints';
import { srpMemberBackend } from './srpMemberBackend';
import type { KillmailSubject, Read } from './SrpKillmailView';

/** The ESI killmail, read once per modal. */
export function useKillmailRead(subject: KillmailSubject): Read<Killmail | null> {
  const { killmailId, killmailHash } = subject;
  const [read, setRead] = useState<{ id: number; value: Read<Killmail | null> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    srpMemberBackend()
      .killmail(killmailId, killmailHash)
      .then(
        (value) => !cancelled && setRead({ id: killmailId, value }),
        () => !cancelled && setRead({ id: killmailId, value: 'failed' })
      );
    return () => {
      cancelled = true;
    };
  }, [killmailId, killmailHash]);
  return read?.id === killmailId ? read.value : 'loading';
}
