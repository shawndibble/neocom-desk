import { Link } from 'react-router-dom';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { highlightHref } from '@/lib/highlightParam';
import { Well } from '@/components/ui/Well';
import { Eyebrow } from '@/components/ui/Eyebrow';
import type { TaxPayment } from '@/engine/corpTaxBook/payments';
import type { PaidBy } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';

interface Props {
  paidBy: PaidBy;
  /** The book's Tax Payments, to say when and how each was made. */
  payments: readonly TaxPayment[];
  corpName: string;
  /** Payment id → the member's own wallet journal entry for it, where one was found on this device. */
  walletRefs?: ReadonlyMap<string, number>;
}

/**
 * What paid a day, read-only: each Tax Payment with what it put on this day, a donation the
 * corporation has not credited yet, and credit from corrections, which is no payment. The book
 * decides how money is applied (oldest day first), so there is nothing to undo here: the only link
 * is to the member's own wallet entry for a donation, where one was found.
 */
export function PaidByList({ paidBy, payments, corpName, walletRefs }: Props) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const k = (key: string) => `miningTax.corpBook.detail.paidBy.${key}`;
  const row = (key: string, label: string, amount: number, walletRef?: number) => (
    <li key={key} className="flex items-baseline justify-between gap-3 py-1">
      <span>
        {label}
        {walletRef !== undefined && (
          <>
            {' · '}
            <Link to={highlightHref('/wallet/journal', walletRef)} className={inlineLinkClassName}>
              {t(k('openInWallet'))}
            </Link>
          </>
        )}
      </span>
      <span className="tabular-nums">{formatIsk(amount, 0)} ISK</span>
    </li>
  );
  return (
    <Well className="space-y-1">
      <Eyebrow>{t(k('title'))}</Eyebrow>
      <ul className="divide-y divide-line text-xs">
        {paidBy.payments.map((p) => {
          const made = payments.find((x) => x.id === p.paymentId);
          const label = made
            ? t(k(made.source === 'manual' ? 'manual' : 'donation'), {
                time: dateTimeAt(made.at, zone),
              })
            : t(k('payment'));
          return row(p.paymentId, label, p.amount, walletRefs?.get(p.paymentId));
        })}
        {paidBy.inFlight.map((d, i) =>
          row(
            `in-flight-${d.refId ?? i}`,
            t(k('inFlight'), { corp: corpName, time: dateTimeAt(d.at, zone) }),
            d.amount
          )
        )}
        {paidBy.corrections !== undefined &&
          row('corrections', t(k('corrections')), paidBy.corrections)}
        {paidBy.writtenOff !== undefined &&
          row('writtenOff', t(k('writtenOff')), paidBy.writtenOff)}
      </ul>
    </Well>
  );
}
