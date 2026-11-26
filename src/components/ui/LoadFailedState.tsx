import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface LoadFailedStateProps {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}

export function LoadFailedState({ title, hint, onRetry, className }: LoadFailedStateProps) {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <EmptyState
      role="alert"
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
