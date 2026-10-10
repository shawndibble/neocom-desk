import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import type { SyncStatus } from '@/sync';
import { syncDisplayState, type SyncDisplayState } from './syncStatus';

const DOT_CLASS: Record<SyncDisplayState, string> = {
  idle: 'bg-success',
  syncing: 'bg-accent motion-safe:animate-pulse',
  error: 'bg-danger',
  offline: 'bg-text-faint',
};

interface SyncStatusDotProps {
  status: SyncStatus;
  online: boolean;
}

/** Small colored dot reflecting sync state, with an i18n'd tooltip. Purely presentational — see Layout for wiring. */
export function SyncStatusDot({ status, online }: SyncStatusDotProps) {
  const { t } = useTranslation();
  const displayState = syncDisplayState(status, online);
  const label = t(`sync.${displayState}`);
  return (
    <Tooltip content={label}>
      <span
        role="status"
        aria-label={label}
        tabIndex={0}
        className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[displayState]} ${focusRingClassName}`}
      />
    </Tooltip>
  );
}
