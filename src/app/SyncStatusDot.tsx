import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { SyncError, SyncOffline, SyncSynced, SyncSyncing } from '@/components/ui/icons';
import { focusRingClassName } from '@/components/ui/controlStyles';
import type { SyncStatus } from '@/sync';
import { syncDisplayState, type SyncDisplayState } from './syncStatus';

const GLYPH_SIZE = 14;

const GLYPH: Record<SyncDisplayState, { Icon: typeof SyncSynced; className: string }> = {
  idle: { Icon: SyncSynced, className: 'text-success' },
  syncing: { Icon: SyncSyncing, className: 'text-accent motion-safe:animate-spin' },
  error: { Icon: SyncError, className: 'text-danger' },
  offline: { Icon: SyncOffline, className: 'text-text-faint' },
};

interface SyncStatusDotProps {
  status: SyncStatus;
  online: boolean;
}

/** Small glyph reflecting sync state — a distinct shape per state, not hue alone — with an i18n'd tooltip. Purely presentational — see Layout for wiring. */
export function SyncStatusDot({ status, online }: SyncStatusDotProps) {
  const { t } = useTranslation();
  const displayState = syncDisplayState(status, online);
  const label = t(`sync.${displayState}`);
  const { Icon, className } = GLYPH[displayState];
  return (
    <Tooltip content={label}>
      <span
        role="status"
        aria-label={label}
        tabIndex={0}
        data-sync-state={displayState}
        className={`inline-flex shrink-0 rounded-full ${className} ${focusRingClassName}`}
      >
        <Icon size={GLYPH_SIZE} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
