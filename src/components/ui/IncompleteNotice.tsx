import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

interface IncompleteNoticeProps {
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** @summary "Incomplete data — …" amber line above a view whose fetch was truncated, with an optional hint and Retry. */
export function IncompleteNotice({ hint, action, className }: IncompleteNoticeProps) {
  const { t } = useTranslation();
  const text = (
    <>
      {t('common.incompleteTitle')}
      {hint != null && hint !== '' && <> — {hint}</>}
    </>
  );
  return (
    <p
      className={cx(
        'text-[0.6875rem] text-warning uppercase',
        action != null && 'flex flex-wrap items-center gap-2',
        className
      )}
    >
      {action != null ? (
        <>
          <span>{text}</span>
          {action}
        </>
      ) : (
        text
      )}
    </p>
  );
}
