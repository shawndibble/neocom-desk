import { useEffect, useMemo, useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import type { ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import { resolveCategories } from '@/features/character/names';
import { cx } from '@/lib/cx';
import type { MadePayment } from '../../paymentLinks';
import { IskText } from '../../IskText';
import { transferChoices, type RecipientCategory } from './paidTransfers';

const k = (key: string) => `miningTax.resolve.pick.${key}`;

interface Props {
  payments: readonly MadePayment[];
  bookCorporationId: number;
  corpName: string;
  /** The billed period's first day: payments before it cannot be for it. */
  since: string;
  /** The chosen payments, by journal ref. */
  chosen: ReadonlySet<number>;
  onChange: (chosen: ReadonlySet<number>, transfers: ClaimedTransfer[]) => void;
}

/**
 * "Which payment was it?" (resolving in the app): the member's own outgoing payments around the
 * billed period, each labelled by who got it. What they tick is what the declaration carries;
 * the rest of their wallet stays on this device.
 */
export function TransferPicker({
  payments,
  bookCorporationId,
  corpName,
  since,
  chosen,
  onChange,
}: Props) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ReadonlyMap<number, RecipientCategory>>(new Map());
  const ids = useMemo(
    () => [...new Set(payments.flatMap((p) => (p.counterpartyId ? [p.counterpartyId] : [])))],
    [payments]
  );
  useEffect(() => {
    let cancelled = false;
    resolveCategories(ids)
      .then((found) => !cancelled && setCategories(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ids]);
  const choices = useMemo(
    () => transferChoices(payments, { bookCorporationId, since, categories }),
    [payments, bookCorporationId, since, categories]
  );
  const toggle = (ref: number) => {
    const next = new Set(chosen);
    if (next.has(ref)) next.delete(ref);
    else next.add(ref);
    onChange(
      next,
      choices.filter((c) => next.has(c.transfer.journalRef)).map((c) => c.transfer)
    );
  };

  if (choices.length === 0) return <p className="text-xs text-text-dim">{t(k('none'))}</p>;
  return (
    <fieldset className="space-y-1.5">
      <legend className="pb-1 text-sm font-semibold">{t(k('legend'))}</legend>
      {choices.map((c) => {
        const ref = c.transfer.journalRef;
        const picked = chosen.has(ref);
        const who = c.recipientName ?? t(k('toId'), { id: c.payment.counterpartyId ?? 0 });
        return (
          <label
            key={ref}
            className={cx(
              'flex cursor-pointer items-start gap-2 rounded-xs border border-line p-2.5',
              tappableRowClassName,
              picked ? selectedRowClassName : 'border-l-2 border-l-transparent'
            )}
          >
            <Checkbox checked={picked} onChange={() => toggle(ref)} className="mt-0.5" />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-semibold tabular-nums">
                  <IskText value={c.transfer.amount} />
                </span>
                <span>{t(k('to'), { name: c.recipient === 'corporation' ? corpName : who })}</span>
                <Pill
                  tone={
                    c.recipient === 'character'
                      ? 'accent'
                      : c.recipient === 'otherCorporation'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {t(k(`kind.${c.recipient}`), { corp: corpName })}
                </Pill>
              </span>
              <span className="block text-xs text-text-dim tabular-nums">
                {dateTimeAt(c.transfer.at, zone)} ·{' '}
                {t('miningTax.resolve.facts.journalRef', { ref })}
              </span>
              {c.recipient !== 'corporation' && (
                <span className="block text-xs">
                  {t(k(`note.${c.recipient}`), { name: who, corp: corpName })}
                </span>
              )}
            </span>
          </label>
        );
      })}
      <p className="text-xs text-text-dim">{t(k('privacy'))}</p>
    </fieldset>
  );
}
