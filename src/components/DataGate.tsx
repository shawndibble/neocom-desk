import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveStatus, LoadFailedState, Spinner } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';

interface DataGateProps {
  status: 'busy' | 'failed' | 'ok';
  title: string;
  hint?: string;
  onRetry?: () => void;
  resetKey?: unknown;
  busy?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function DataGate({
  status,
  title,
  hint,
  onRetry,
  resetKey,
  busy,
  className,
  children,
}: DataGateProps) {
  const { t } = useTranslation();
  const [regionRef, , holdRetryFocus] = useRetryFocus<HTMLDivElement>(status, resetKey);
  return (
    <div ref={regionRef} tabIndex={-1} className={`focus:outline-none ${className ?? ''}`.trim()}>
      <LiveStatus>{status === 'failed' ? title : null}</LiveStatus>
      {status === 'failed' ? (
        <LoadFailedState
          title={title}
          hint={hint}
          onRetry={
            onRetry
              ? () => {
                  holdRetryFocus();
                  onRetry();
                }
              : undefined
          }
        />
      ) : status === 'busy' ? (
        (busy ?? <Spinner block="page" label={t('common.loading')} />)
      ) : (
        children
      )}
    </div>
  );
}
