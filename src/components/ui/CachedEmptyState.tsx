import { EmptyState } from './EmptyState';

interface CachedEmptyStateProps {
  /**
   * The cached read behind the list, or null/undefined when there is none.
   * A result that isn't `fromCache` means the fetch just succeeded, so an
   * empty list is genuinely empty — not stale, and not fixed by reconnecting.
   */
  result: { fromCache: boolean } | null | undefined;
  /** "Nothing cached / Reconnect" copy: never fetched, or served from cache. */
  title: string;
  hint?: string;
  /** Plain "none" line for a successful fetch that found nothing. */
  fetchedTitle: string;
  className?: string;
}

export function CachedEmptyState({
  result,
  title,
  hint,
  fetchedTitle,
  className,
}: CachedEmptyStateProps) {
  if (result && !result.fromCache) return <EmptyState title={fetchedTitle} className={className} />;
  return <EmptyState title={title} hint={hint} className={className} />;
}
