/**
 * Sync now's moon owner half (#6117): an editor of a book with moon owners reads every one of
 * them at once instead of waiting up to six hours for the schedule. The server rests it ten
 * minutes per book; a press inside that says when it runs again. The book reloads after a read.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isStillRead, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { utcTime } from './moonsFormat';
import { useBook } from './useBook';

/** A toast line; `instance` changes on every press so a repeated line replays (DESIGN.md Toast). */
export interface SyncNowNotice {
  message: string;
  instance: number;
}

export interface MoonOwnersSyncNow {
  /** Whether this viewer's Sync now also reads moon owners. */
  enabled: boolean;
  busy: boolean;
  run: () => Promise<void>;
  /** After a press that read nothing (too soon, refused, every read skipped); null otherwise. */
  notice: SyncNowNotice | null;
  clearNotice: () => void;
}

export function useMoonOwnersSyncNow(rows: readonly MoonOwnerRow[]): MoonOwnersSyncNow {
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
        say(t('corpTaxBook.moons.moonOwners.syncNow.tooSoon', { time: utcTime(result.retryAt) }));
      } else failed();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }, [enabled, busy, characterId, corporationId, reload, t]);

  return { enabled, busy, run, notice, clearNotice: () => setNotice(null) };
}
