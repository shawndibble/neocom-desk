import { useTranslation } from 'react-i18next';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';

const TICK_MS = 30_000;

interface CachedNoticeProps {
  fetchedAt?: Date | number | null;
  refreshFailed?: boolean;
  withBadge?: boolean;
  className?: string;
}

/**
 * @summary "Showing cached data · 3h ago" line for a cached read, at every width (the phone answer to the md-hidden DataAgeBadge).
 */
export function CachedNotice({
  fetchedAt = null,
  refreshFailed = false,
  withBadge = false,
  className,
}: CachedNoticeProps) {
  const { t } = useTranslation();
  const now = useTicker(TICK_MS);
  const title = refreshFailed ? t('common.refreshFailedTitle') : t('common.offlineTitle');
  const at = fetchedAt === null ? null : new Date(fetchedAt);
  const valid = at !== null && !Number.isNaN(at.getTime());
  const hideOnDesktop = withBadge && !refreshFailed ? 'md:hidden ' : '';
  return (
    <p
      className={`${hideOnDesktop}text-[0.6875rem] text-warning uppercase ${className ?? ''}`.trimEnd()}
    >
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
