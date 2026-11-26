import { useTimeZone } from '@/lib/timeFormat';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isStillRead, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { clockAt } from './moonsFormat';
import { useBook } from './useBook';

export interface SyncNowNotice {
  message: string;
  instance: number;
}

export interface MoonOwnersSyncNow {
  enabled: boolean;
  busy: boolean;
  run: () => Promise<void>;
  notice: SyncNowNotice | null;
  clearNotice: () => void;
}

export function useMoonOwnersSyncNow(rows: readonly MoonOwnerRow[]): MoonOwnersSyncNow {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { characterId, corporationId, canEdit, reload } = useBook();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SyncNowNotice | null>(null);
  const enabled = canEdit && rows.some((r) => isStillRead(r.status));

  const run = useCallback(async () => {
    if (!enabled || busy) return;
    setBusy(true);
    const say = (message: string) => setNotice({ message, instance: Date.now() });
    const failed = () => say(t('corpTaxBook.moons.moonOwners.syncNow.failed'));
    try {
      const { syncMoonOwnersNowRemote } = await import('@/sync/corpSyncGrantApi');
      const result = await syncMoonOwnersNowRemote({
        editorCharacterId: characterId,
        collectorCorporationId: corporationId,
      });
      if (result.kind === 'synced') {
        reload();
        if (result.read + result.stale === 0 && result.skipped > 0) failed();
      } else if (result.kind === 'rate-limited') {
        say(
          t('corpTaxBook.moons.moonOwners.syncNow.tooSoon', { time: clockAt(result.retryAt, zone) })
        );
      } else failed();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }, [enabled, busy, characterId, corporationId, reload, t, zone]);

  return { enabled, busy, run, notice, clearNotice: () => setNotice(null) };
}
