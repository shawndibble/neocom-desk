import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

/**
 * "1234 / 10000" beside a compose field; danger-toned once `count` passes `max`.
 * With `warnFrom` (a fraction of `max`), warning-toned from that point up to the limit.
 */
export function MailCounter({
  id,
  count,
  max,
  warnFrom,
}: {
  id?: string;
  count: number;
  max: number;
  warnFrom?: number;
}) {
  const { t } = useTranslation();
  const near = warnFrom !== undefined && count >= max * warnFrom;
  return (
    <span
      id={id}
      className={cx(
        'text-[0.6875rem] tabular-nums',
        count > max ? 'text-danger' : near ? 'text-warning' : 'text-text-dim'
      )}
    >
      {t('mail.counter', { count, max })}
    </span>
  );
}
