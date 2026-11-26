import { useTranslation } from 'react-i18next';
import { LiveStatus } from '@/components/ui/LiveStatus';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useOnline } from '@/stores/network';

export function OfflineStrip({
  children,
  className,
  'data-testid': testId,
}: {
  children: string;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <p
      data-testid={testId}
      className={cx(
        'flex items-start gap-2 rounded-xs border border-line bg-panel px-3 py-1.5 text-xs text-text-dim',
        className
      )}
    >
      <Icon.SyncOffline aria-hidden="true" size={Icon.ICON_SIZE.sm} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  const message = t('offline.banner');
  return (
    <>
      <LiveStatus>{!online && message}</LiveStatus>
      {!online && (
        <OfflineStrip className="mb-4" data-testid="offline-banner">
          {message}
        </OfflineStrip>
      )}
    </>
  );
}
