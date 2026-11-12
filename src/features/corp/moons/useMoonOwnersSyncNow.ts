/**
 * Sync now's moon owner half (#6117): an editor of a book with moon owners reads every one of
 * them at once instead of waiting up to six hours for the schedule. The server rests it ten
 * minutes per book; a press inside that says when it runs again. The book reloads after a read.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { utcTime } from './moonsFormat';
import { useBook } from './useBook';

/** Moon owners the scheduled sync still reads, so Sync now has something to do. */
const READ: ReadonlySet<MoonOwnerRow['status']> = new Set([
  'active',
  'cant-read',
  'removal-pending',
  'settled-otherwise',
]);

export interface MoonOwnersSyncNow {
  /** Whether this viewer's Sync now also reads moon owners. */
  enabled: boolean;
  busy: boolean;
  run: () => Promise<void>;
  /** A toast line after a press that did not read (too soon, refused); null otherwise. */
  notice: string | null;
  clearNotice: () => void;
}

export function useMoonOwnersSyncNow(rows: readonly MoonOwnerRow[]): MoonOwnersSyncNow {
  const { t } = useTranslation();
  const { characterId, corporationId, canEdit, reload } = useBook();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const enabled = canEdit && rows.some((r) => READ.has(r.status));

  const run = useCallback(async () => {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      const { syncMoonOwnersNowRemote } = await import('@/sync/corpSyncGrantApi');
      const result = await syncMoonOwnersNowRemote({
        editorCharacterId: characterId,
        collectorCorporationId: corporationId,
      });
      if (result.kind === 'synced') reload();
      else if (result.kind === 'rate-limited') {
        setNotice(
          t('corpTaxBook.moons.moonOwners.syncNow.tooSoon', {
            time: utcTime(result.retryAt),
          })
        );
      } else setNotice(t('corpTaxBook.moons.moonOwners.syncNow.failed'));
    } catch {
      setNotice(t('corpTaxBook.moons.moonOwners.syncNow.failed'));
    } finally {
      setBusy(false);
    }
  }, [enabled, busy, characterId, corporationId, reload, t]);

  return { enabled, busy, run, notice, clearNotice: () => setNotice(null) };
}
