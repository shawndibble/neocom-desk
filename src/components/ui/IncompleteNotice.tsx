import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

interface IncompleteNoticeProps {
  /** What is missing, after the title ("older history is missing"). Already translated. */
  hint?: ReactNode;
  /** A control that can fill the gap (a Retry button), after the text. */
  action?: ReactNode;
  className?: string;
}

/**
 * The line above a view's content when its fetch stopped short (a page cap, a
 * page that failed): "Incomplete data — some pages could not be loaded — …".
 * Amber micro-caps like `CachedNotice`, but a different state: a cached read
 * is whole and old, this one is fresh and partial, and a view can be both, so
 * each keeps its own line. Render it only while the result is truncated; it
 * keeps no state. Not a live region: it mounts with its text.
 *
 * @summary "Incomplete data — …" amber line above a view whose fetch was truncated, with an optional hint and Retry.
 */
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
