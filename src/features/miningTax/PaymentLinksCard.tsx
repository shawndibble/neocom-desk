import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { formatIsk } from '@/lib/isk';
import { madePaymentHref } from './madePaymentHref';
import { Well } from '@/components/ui/Well';

/** One linked payment whose money reached the entry's day, resolved for display. */
export interface PaidByLink {
  /** `paymentLinkKey`: what Unlink names. */
  key: string;
  link: PayeePaymentLink;
  /** What it put on this day, off the Payee's account. */
  amount: number;
  /**
   * A short line naming the transaction (amount, date, label); `null` when the wallet journal or
   * contracts no longer hold it, or for a payment the pilot recorded in Settle up.
   */
  label: string | null;
}

interface PaymentLinksCardProps {
  /** The linked payments that paid the day, oldest first (`PayeeRunningAccount.paidBy`). */
  paidBy: readonly PaidByLink[];
  /** Unlinks one: it pays nothing, and is offered again. */
  onUnlink?: (key: string) => void;
  busy: boolean;
}

/**
 * Which payments paid an entry's day (decision 20261120-235011): a payment links to its Payee and
 * pays the Payee's oldest unpaid days, so this is read off the account's applications, never a
 * mark on the entry. Each line says what that payment put on the day and opens its wallet entry;
 * Unlink takes the payment off the Payee (its days are owed again, oldest first).
 */
export function PaymentLinksCard({ paidBy, onUnlink, busy }: PaymentLinksCardProps) {
  const { t } = useTranslation();
  return (
    <Well className="space-y-1">
      <p className={cx(eyebrowClassName, 'min-w-0 truncate')}>{t('miningTax.paymentCardTitle')}</p>
      {paidBy.length > 0 ? (
        <ul className="space-y-0.5 text-xs">
          {paidBy.map(({ key, link, amount, label }) => {
            const unseen = link.kind === 'recorded' || link.kind === 'legacy';
            const named =
              link.kind === 'recorded'
                ? t('miningTax.payment.recorded', { date: link.paidOn })
                : link.kind === 'legacy'
                  ? t('miningTax.payment.legacy', { date: link.paidOn })
                  : (label ?? t('miningTax.payment.notCached', { id: link.refId }));
            return (
              <li key={key} className="flex items-center gap-2">
                <span className="shrink-0 tabular-nums">{formatIsk(amount, 0)} ISK</span>
                <span className="min-w-0 flex-1 truncate">
                  {unseen || label === null ? (
                    <span className="text-text-dim">{named}</span>
                  ) : (
                    <Link to={madePaymentHref(link)!} className={inlineLinkClassName}>
                      {named}
                    </Link>
                  )}
                  {link.source === 'auto' && (
                    <span className="text-text-dim"> · {t('miningTax.payment.autoLinked')}</span>
                  )}
                </span>
                {onUnlink && (
                  <Button
                    size="sm"
                    aria-label={t('miningTax.payment.unlinkNamed', { id: link.refId })}
                    onClick={() => onUnlink(key)}
                    disabled={busy}
                  >
                    {t('miningTax.unlinkTransactionAction')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-text-dim">{t('miningTax.noLinkedTransactions')}</p>
      )}
    </Well>
  );
}
