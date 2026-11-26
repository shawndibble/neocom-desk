import { useTimeZone } from '@/lib/timeFormat';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, SearchInput } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { PaymentOutcome } from '@/engine/corpTaxBook/paymentPreview';
import { netPayment } from '@/engine/corpTaxBook/payments';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import { cx } from '@/lib/cx';
import { atDate, clockAt, isk, shortDate } from './moonsFormat';

const DONATION_SEARCH_FROM = 4;

export function PaymentOutcomePanel({
  outcome,
  minerName,
}: {
  outcome: PaymentOutcome | undefined;
  minerName: string;
}) {
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.record';
  return (
    <section
      aria-label={t(`${k}.outcomeTitle`)}
      className="space-y-1.5 rounded-xs border border-line bg-panel-2 p-2 text-xs tabular-nums"
    >
      <h3 className={eyebrowClassName}>{t(`${k}.outcomeTitle`)}</h3>
      {!outcome ? (
        <p className="text-text-dim">{t(`${k}.enterAmount`)}</p>
      ) : (
        <>
          {outcome.lines.length > 0 && (
            <ul className="space-y-1">
              {outcome.lines.map((l) => (
                <li key={l.date} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block">{t(`${k}.dayLine`, { date: shortDate(l.date) })}</span>
                    <span className="block text-text-dim">
                      {l.settled
                        ? t(`${k}.clears`)
                        : t(`${k}.partPays`, { left: isk(l.remainingAfter) })}
                    </span>
                  </span>
                  <span className="shrink-0">{isk(l.applied)}</span>
                </li>
              ))}
            </ul>
          )}
          <p
            aria-live="polite"
            className={cx('font-medium', outcome.lines.length > 0 && 'border-t border-line pt-1.5')}
          >
            {outcome.owedAfter > 0
              ? t(`${k}.stillOwes`, { name: minerName, amount: isk(outcome.owedAfter) })
              : t(`${k}.owesNothing`, { name: minerName })}
          </p>
          {outcome.creditAdded > 0 && (
            <p>{t(`${k}.creditHeld`, { amount: isk(outcome.creditAfter) })}</p>
          )}
        </>
      )}
    </section>
  );
}

export function DonationPicker({
  donations,
  nameOf,
  value,
  onChange,
}: {
  donations: readonly SettlePayment[];
  nameOf: (characterId: number) => string;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.record';
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/[^0-9]/g, '');
  const shown = needle
    ? donations.filter(
        (d) =>
          nameOf(d.characterId).toLowerCase().includes(needle) ||
          (digits !== '' && String(Math.round(netPayment(d))).includes(digits)) ||
          d.id === value
      )
    : donations;
  return (
    <div className="space-y-1.5">
      {donations.length >= DONATION_SEARCH_FROM && (
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(`${k}.findDonation`)}
          aria-label={t(`${k}.findDonation`)}
        />
      )}
      <ul
        role="radiogroup"
        aria-label={t(`${k}.donations`)}
        className="max-h-56 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2"
      >
        {shown.map((d) => {
          const on = d.id === value;
          return (
            <li key={d.id}>
              <label
                className={cx(
                  'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
                  tappableRowClassName,
                  on && selectedRowClassName
                )}
              >
                <Radio
                  name="record-donation"
                  className="mt-0.5"
                  checked={on}
                  onChange={() => onChange(d.id)}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="tabular-nums">
                    {t(`${k}.donationRow`, {
                      amount: isk(netPayment(d)),
                      name: nameOf(d.characterId),
                    })}
                  </span>
                  <span className="text-text-dim">
                    {t(`${k}.donationAt`, { date: atDate(d.at, zone), time: clockAt(d.at, zone) })}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="text-xs text-text-dim">{t(`${k}.noDonationMatch`)}</p>}
    </div>
  );
}
