import { EmptyState } from './EmptyState';

interface CachedEmptyStateProps {
  result: { fromCache: boolean } | null | undefined;
  title: string;
  hint?: string;
  fetchedTitle: string;
  fetchedHint?: string;
  className?: string;
}

export function CachedEmptyState({
  result,
  title,
  hint,
  fetchedTitle,
  fetchedHint,
  className,
}: CachedEmptyStateProps) {
  if (result && !result.fromCache)
    return <EmptyState title={fetchedTitle} hint={fetchedHint} className={className} />;
  return <EmptyState title={title} hint={hint} className={className} />;
}
