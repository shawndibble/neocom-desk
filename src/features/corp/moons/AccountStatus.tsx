import { useTranslation } from 'react-i18next';
import type { RunningAccountStatus } from '@/engine/corpTaxBook/bookView';
import { isk, shortDate } from './moonsFormat';

/**
 * A Miner's running account in words (#6294): "Owes X (N days, oldest D)" or "Paid through D";
 * a dash when they have neither paid nor owed a day yet.
 */
export function AccountStatus({ account }: { account: RunningAccountStatus }) {
  const { t } = useTranslation();
  if (account.owes)
    return (
      <span className="text-danger">
        {t('corpTaxBook.moons.account.owes', {
          amount: isk(account.owes.amount),
          count: account.owes.days,
          date: shortDate(account.owes.oldest),
        })}
      </span>
    );
  if (account.paidThrough)
    return (
      <span className="text-success">
        {t('corpTaxBook.moons.account.paidThrough', { date: shortDate(account.paidThrough) })}
      </span>
    );
  return <>—</>;
}
