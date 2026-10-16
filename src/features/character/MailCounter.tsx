import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

/** "1234 / 10000" beside a compose field; danger-toned once `count` passes `max`. */
export function MailCounter({ id, count, max }: { id?: string; count: number; max: number }) {
  const { t } = useTranslation();
  return (
    <span
      id={id}
      className={cx('text-[0.6875rem] tabular-nums', count > max ? 'text-danger' : 'text-text-dim')}
    >
      {t('mail.counter', { count, max })}
    </span>
  );
}
