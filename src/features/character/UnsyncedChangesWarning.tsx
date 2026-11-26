import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { useOnline } from '@/stores/network';
import { subscribeSyncStatus } from '@/sync/status';
import { mayHaveUnsyncedChanges } from './unsyncedChanges';

export function UnsyncedChangesWarning({
  characterIds,
  syncConfigured,
}: {
  characterIds: readonly number[];
  syncConfigured: boolean;
}) {
  const { t } = useTranslation();
  const online = useOnline();
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
