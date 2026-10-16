import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/components/ui';

interface DataUnavailableProps {
  /** Already-translated headline saying what couldn't load. */
  title: string;
  /** Overrides the default hint ("Connect once and it will be kept on this device…"). */
  hint?: string;
  /** Tries the load again. Omit when something else (a reconnect, a Refresh button) already does. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The failed state for data a view needs but this device hasn't downloaded and
 * can't fetch right now: it says what is missing, that one connection fixes it,
 * and offers Retry. Use it instead of a spinner that a rejected load would leave
 * up forever.
 */
export function DataUnavailable({ title, hint, onRetry, className }: DataUnavailableProps) {
  const { t } = useTranslation();
  return (
    <EmptyState
      className={className}
      title={title}
      hint={hint ?? t('common.connectOnceHint')}
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
