/**
 * The Record payment dialog's two richer parts: the outcome panel (which
 * Statements the ISK clears or part-pays, and what is owed or held after,
 * read from `previewMinerPayment`) and the picker for an Unmatched donation.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, SearchInput } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { netOf, type PaymentOutcome } from '@/engine/corpTaxBook/paymentPreview';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import { cx } from '@/lib/cx';
import { isk, periodLabel, shortDate } from './moonsFormat';

/** A picker over this many donations gets a search box; fewer read at a glance. */
const DONATION_SEARCH_FROM = 4;

/** "After this payment": the Statements it reaches, oldest (or the pinned one) first, then the balance. */
export function PaymentOutcomePanel({
  outcome,
  statements,
  minerName,
}: {
  outcome: PaymentOutcome | undefined;
  statements: readonly Statement[];
  minerName: string;
}) {
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.record';
  const period = (id: string) => {
    const st = statements.find((s) => s.id === id);
    return st ? periodLabel(st.periodStart, st.periodEnd) : id;
  };
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
                <li key={l.statementId} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block">
                      {t(`${k}.statementLine`, { period: period(l.statementId) })}
                    </span>
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

/** Pick one Unmatched donation, searchable by sender or amount once there are a few. */
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
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.record';
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/[^0-9]/g, '');
  const shown = needle
    ? donations.filter(
        (d) =>
          nameOf(d.characterId).toLowerCase().includes(needle) ||
          (digits !== '' && String(Math.round(netOf(d))).includes(digits)) ||
          // The chosen donation stays listed, so a search never hides what Assign will send.
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
                      amount: isk(netOf(d)),
                      name: nameOf(d.characterId),
                    })}
                  </span>
                  <span className="text-text-dim">
                    {t(`${k}.donationAt`, { date: shortDate(d.at), time: d.at.slice(11, 16) })}
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
