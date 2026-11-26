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
      if (id === null || expiresAt === null) return;
      setFailed(false);
      try {
        await setSurveyScanIgnored({
          id,
          expiresAt,
          scanId,
          ignored,
          characterId: characterId ?? undefined,
        });
        await refresh();
      } catch {
        setFailed(true);
      }
    },
    [id, expiresAt, characterId, refresh]
  );
  return { setIgnored, failed };
}
