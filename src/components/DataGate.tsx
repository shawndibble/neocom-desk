import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveStatus, LoadFailedState, Spinner } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';

interface DataGateProps {
  /** Where the load stands: still running, failed, or in and ready for `children`. */
  status: 'busy' | 'failed' | 'ok';
  /** Already-translated headline saying what couldn't load. Announced when `status` becomes `failed`. */
  title: string;
  /** Overrides the default hint ("Connect once…" offline, "Try again" online). */
  hint?: string;
  /** Tries the load again. Omit when something else (a reconnect, a Refresh button) already does. */
  onRetry?: () => void;
  /** Another Character (or anything else that restarts the load) drops a pending retry's focus. */
  resetKey?: unknown;
  /** What shows while `busy`; a centred `Spinner` when omitted. */
  busy?: ReactNode;
  className?: string;
  /** Shown once `status` is `ok`. */
  children?: ReactNode;
}

/**
 * A view's load, from spinner to result to "couldn't load".
 *
 * Use it instead of a spinner that a rejected load would leave up forever: a
 * failure says what is missing, that one connection fixes it, and offers Retry.
 * It owns the two things a failed state needs that callers keep getting wrong:
 * an always-mounted `LiveStatus` that announces the failure (a `role="status"`
 * node mounted together with its text is not announced), and `useRetryFocus`
 * (DESIGN.md Focus), so Retry unmounting into the busy state never drops focus
 * on `<body>`. Its wrapper is therefore mounted in every state.
 */
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
        (busy ?? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ))
      ) : (
        children
      )}
    </div>
  );
}
