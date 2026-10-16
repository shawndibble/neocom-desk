import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface LoadFailedStateProps {
  /** @summary Already-translated headline saying what couldn't load. Defaults to "Couldn't load". */
  title?: string;
  /**
   * @summary One line on what is missing and what happens next. Defaults to "Try again" online and
   * "You're offline. Connect once…" offline, from the browser's own connection state.
   */
  hint?: string;
  /** @summary Runs the read again; shows a Retry button when given. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The read failed, so the list is not "empty". Pairs with `CachedEmptyState`:
 * that one is for a read that came back (stale or fresh), this one for a read
 * that did not come back at all. `DataGate` renders it for a whole view's load.
 *
 * @summary Empty state for a read that failed or could not be reached, with Retry; never worded as "none".
 */
export function LoadFailedState({ title, hint, onRetry, className }: LoadFailedStateProps) {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <EmptyState
      className={className}
      title={title ?? t('common.couldntLoad')}
      hint={hint ?? (online ? t('common.loadFailedRetryHint') : t('common.connectOnceHint'))}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
