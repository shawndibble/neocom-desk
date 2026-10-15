import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { useOnline } from '@/stores/network';
import { subscribeSyncStatus } from '@/sync/status';
import { mayHaveUnsyncedChanges } from './unsyncedChanges';

/**
 * Warning inside a Remove / Log out confirm: the local copy is about to go,
 * and it may be the only one holding the pilot's latest edits. Offline nothing
 * can be pushed (nor shared items and alert grants cleaned up); online, a
 * Character whose last sync was not a clean success may still have edits
 * waiting. Renders nothing when sync is not set up, or when online and clean.
 */
export function UnsyncedChangesWarning({
  characterIds,
  syncConfigured,
}: {
  characterIds: readonly number[];
  syncConfigured: boolean;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  // Re-evaluate when a sync starts, finishes or fails, or an edit is scheduled.
  const [, setTick] = useState(0);
  useEffect(() => subscribeSyncStatus(() => setTick((n) => n + 1)), []);
  if (!mayHaveUnsyncedChanges({ characterIds, syncConfigured, online })) return null;
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-text-dim">
      <Icon.Warn size={Icon.ICON_SIZE.sm} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>{t(online ? 'characters.unsyncedPending' : 'characters.unsyncedOffline')}</span>
    </p>
  );
}
