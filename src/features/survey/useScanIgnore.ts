/**
 * Sets a scan of a Survey aside (or brings it back), for its owner. Only the owner
 * does; the rules can't tell who that is, so the caller's `owned` check is the guard
 * and this refuses without a signed-in Character. `failed` is true after a write that
 * did not land, until the next attempt.
 */
import { useCallback, useState } from 'react';
import { setSurveyScanIgnored } from './surveyStore';

export function useScanIgnore({
  id,
  expiresAt,
  characterId,
  refresh,
}: {
  id: string | null;
  expiresAt: number | null;
  characterId: number | null;
  refresh: () => Promise<void>;
}) {
  const [failed, setFailed] = useState(false);
  const setIgnored = useCallback(
    async (scanId: string, ignored: boolean) => {
      if (id === null || expiresAt === null || characterId === null) return;
      setFailed(false);
      try {
        await setSurveyScanIgnored({ id, expiresAt, scanId, ignored, characterId });
        await refresh();
      } catch {
        setFailed(true);
      }
    },
    [id, expiresAt, characterId, refresh]
  );
  return { setIgnored, failed };
}
