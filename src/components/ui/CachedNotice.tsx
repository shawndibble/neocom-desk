import { useTranslation } from 'react-i18next';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';

/** The same shared 30 s clock `DataAgeBadge` reads, so the two never disagree. */
const TICK_MS = 30_000;

interface CachedNoticeProps {
  /**
   * When the data on screen was fetched (a `Date`, or epoch ms), or null when
   * the loader does not know. Null drops the age and keeps the sentence.
   */
  fetchedAt?: Date | number | null;
  /**
   * The data is cached because a refresh was just attempted and failed (the
   * Refresh button was pressed), not because the app is offline. Says so.
   */
  refreshFailed?: boolean;
  className?: string;
}

/**
 * The line a view shows above its content while that content is a cached read:
 * "Showing cached data · 3h ago". Unlike `DataAgeBadge` it is not hidden below
 * `md`: the badge is header chrome that a phone drops, and this is the one
 * place a phone is told the figures may be old. Render it only while the
 * result is `fromCache`; it keeps no state of its own.
 *
 * Deliberately not `role="status"`: it mounts together with its text, which a
 * screen reader would not announce. The shell's `OfflineBanner` announces the
 * change of connection.
 *
 * @summary "Showing cached data · 3h ago" line for a cached read, at every width (the phone answer to the md-hidden DataAgeBadge).
 */
export function CachedNotice({
  fetchedAt = null,
  refreshFailed = false,
  className,
}: CachedNoticeProps) {
  const { t } = useTranslation();
  const now = useTicker(TICK_MS);
  const title = refreshFailed ? t('common.refreshFailedTitle') : t('common.offlineTitle');
  const at = fetchedAt === null ? null : new Date(fetchedAt);
  const valid = at !== null && !Number.isNaN(at.getTime());
  return (
    <p className={`text-[0.6875rem] text-warning uppercase ${className ?? ''}`.trimEnd()}>
      <span>{title}</span>
      {valid && (
        <>
          {' · '}
          <time dateTime={at.toISOString()}>{formatAge(Math.max(0, now - at.getTime()), t)}</time>
        </>
      )}
    </p>
  );
}
