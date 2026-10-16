import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface LoadFailedStateProps {
  /**
   * @summary Force the offline wording. Left out, it follows the browser's own connection state.
   */
  offline?: boolean;
  /** @summary Already-translated headline, replacing the shared "Couldn't load" one. */
  title?: string;
  /** @summary One line on what is missing and what happens next. */
  hint?: string;
  /** @summary Runs the read again; shows a Retry button when given. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The read failed, so the list is not "empty". Pairs with `CachedEmptyState`:
 * that one is for a read that came back (stale or fresh), this one for a read
 * that did not come back at all.
 *
 * @summary Empty state for a read that failed or could not be reached, with Retry; never worded as "none".
 */
export function LoadFailedState({
  offline,
  title,
  hint,
  onRetry,
  className,
}: LoadFailedStateProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const isOffline = offline ?? !online;
  return (
    <EmptyState
      className={className}
      title={title ?? t(isOffline ? 'common.couldntLoadOffline' : 'common.couldntLoad')}
      hint={hint}
      action={onRetry ? <Button onClick={onRetry}>{t('common.retry')}</Button> : undefined}
    />
  );
}
