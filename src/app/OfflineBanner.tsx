import { useTranslation } from 'react-i18next';
import { LiveStatus } from '@/components/ui/LiveStatus';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useOnline } from '@/stores/network';

/**
 * The strip itself, without the connection logic: what the shell shows, and
 * what the Interaction grammar story renders as the cue's sample.
 */
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

/**
 * The shell-wide "you're offline" strip, at every width. Before it the only
 * signal was the sync dot in the desktop-only rail, shown only when sync is
 * configured, so a phone said nothing at all.
 *
 * In flow at the top of `<main>`, never fixed: it pushes the page down rather
 * than covering it, so the safe areas and the phone tab bar are not its
 * concern. Neutral, not a warning: being offline is a state the app is built
 * for, and the cached data below is still good. Gone the moment the connection
 * returns (DESIGN.md §6c, "Strip under the page chrome, cloud-slash glyph").
 *
 * The announcement is a polite live region that is always mounted and filled
 * when the connection drops (a region inserted together with its text is not
 * reliably read); the visible text carries no role, so it is not read twice.
 * Carries its own `mb-4` so the online case takes no space.
 */
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
