import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/ui/Pill';
import { disputeKindOf } from '@/engine/corpTaxBook/disputes';
import { formatIsk } from '@/lib/isk';
import { wherePaymentGoes, type PayDay } from './paymentLanding';

/** Open days listed before the rest fold into "and N more days". */
export const MAX_LANDING_DAYS = 8;

interface Props {
  corpName: string;
  /** The member's open days in this book, any order. */
  days: readonly PayDay[];
  /** The amount being paid. */
  amount: number;
}

/**
 * Where a payment to a Corp Tax Book lands: the book pays oldest first and cannot be told a day or
 * a moon, so the pilot sees what their amount does. A read-out, no controls (DESIGN §6c).
 */
export function WherePaymentGoes({ corpName, days, amount }: Props) {
  const { t } = useTranslation();
  if (days.length === 0) return null;
  const { days: landing, credit } = wherePaymentGoes(days, amount);
  const shown = landing.slice(0, MAX_LANDING_DAYS);
  const more = landing.length - shown.length;
  return (
    <section aria-label={t('miningTax.corpBook.pay.where.label')} className="space-y-1.5">
      <p className="text-xs text-text-dim">
        {t('miningTax.corpBook.pay.where.intro', { corp: corpName })}
      </p>
      <ul className="divide-y divide-line text-sm">
        {shown.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
            <span className="w-24 tabular-nums">{d.date}</span>
            <span className="w-32 text-right tabular-nums">{formatIsk(d.taxOwed)} ISK</span>
            {d.result === 'paid' && (
              <Pill tone="success">{t('miningTax.corpBook.pay.where.paid')}</Pill>
            )}
            {d.result === 'part' && (
              <>
                <Pill tone="accent">{t('miningTax.corpBook.pay.where.part')}</Pill>
                <span className="text-xs text-text-dim">
                  {t('miningTax.corpBook.pay.where.partOf', {
                    amount: formatIsk(d.partAmount ?? 0, 0),
                  })}
                </span>
              </>
            )}
            {d.result === 'next' && (
              <span className="text-xs text-text-dim">
                {t('miningTax.corpBook.pay.where.next')}
              </span>
            )}
            {d.result === 'held' && d.held && (
              <>
                <Pill tone="neutral">{t('miningTax.corpBook.pay.where.held')}</Pill>
                <span className="text-xs text-text-dim">
                  {t('miningTax.corpBook.pay.where.heldNote', {
                    kind: t(`miningTax.corpBook.pay.where.kind.${disputeKindOf(d.held)}`),
                    corp: corpName,
                  })}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-xs text-text-dim">
          {t('miningTax.corpBook.pay.where.more', { count: more })}
        </p>
      )}
      {credit > 0 && (
        <p className="text-xs text-text-dim">
          {t('miningTax.corpBook.pay.where.credit', { amount: formatIsk(credit, 0) })}
        </p>
      )}
    </section>
  );
}
