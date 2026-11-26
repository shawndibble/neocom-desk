import { useTranslation } from 'react-i18next';
import type { RunningAccountStatus } from '@/engine/corpTaxBook/bookView';
import { utcDay, utcDaysBetween } from '@/engine/localDay';
import { isk, shortDate } from './moonsFormat';
import { useBook } from './useBook';

export function AccountStatus({ account }: { account: RunningAccountStatus | undefined }) {
  const { t } = useTranslation();
  if (account?.owes)
    return (
      <span className="text-danger">
        {t('corpTaxBook.moons.account.owes', {
          amount: isk(account.owes.amount),
          count: account.owes.days,
          date: shortDate(account.owes.oldest),
        })}
      </span>
    );
  if (account?.paidThrough)
    return (
      <span className="text-success">
        {t('corpTaxBook.moons.account.paidThrough', { date: shortDate(account.paidThrough) })}
      </span>
    );
  return <>—</>;
}

export function OldestUnpaid({ account }: { account: RunningAccountStatus }) {
  const { t } = useTranslation();
  const { view } = useBook();
  if (account.owes)
    return (
      <span className="text-danger">
        {t('corpTaxBook.moons.account.oldestUnpaid', {
          date: shortDate(account.owes.oldest),
          count: Math.max(
            0,
            utcDaysBetween(account.owes.oldest, utcDay(Date.parse(view.input.now)))
          ),
        })}
      </span>
    );
  return <AccountStatus account={account} />;
}
