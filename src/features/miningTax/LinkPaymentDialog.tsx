import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import type { PayeeRecord } from '@/db';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { markAssignmentsPaid } from './assignments';
import { formatDateRange } from './groupRows';
import { rememberPayeeEntity } from './payees';
import type { LinkSuggestion } from './paymentLinks';

interface LinkPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Unlinked payments with a plausible target, most confident first. */
  suggestions: readonly LinkSuggestion[];
  systemNames: ReadonlyMap<number, string>;
  showCharacter: boolean;
  onLinked: () => void;
}

/**
 * The payment's own date as a local calendar date, falling back to today.
 * A contract carries `date_completed ?? date_issued` straight from ESI, so an
 * unparseable value would otherwise reach `formatLocalDate` as an Invalid Date
 * and write nonsense into a synced record.
 */
function paidOnFor(isoDate: string): string {
  const parsed = new Date(isoDate);
  return formatLocalDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}

/**
 * "I already paid this — what did it cover?" (issue #540), the mirror of
 * Settle up.
 *
 * Pick a payment the app found unaccounted for; it arrives with a Payee already
 * identified and that Payee's matching entries pre-ticked. The list is itemized
 * and untickable for the same reason settle-up's is: a suggestion is a starting
 * point, never a blind mark-all. Confirming records the payment against every
 * ticked Assignment under one shared `paymentId`, and teaches the Payee who the
 * recipient was, so the next payment to them matches on identity.
 */
export function LinkPaymentDialog({
  open,
  onClose,
  suggestions,
  systemNames,
  showCharacter,
  onLinked,
}: LinkPaymentDialogProps) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(
    suggestions[0]?.payment.key ?? null
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  // Only meaningful for a payment in kind, whose cargo is never priced.
  const [amountInKind, setAmountInKind] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = suggestions.find((s) => s.payment.key === selectedKey) ?? null;

  const included = useMemo(
    () => selected?.members.filter((m) => !excluded.has(m.assignment.id)) ?? [],
    [selected, excluded]
  );
  const includedTotal = included.reduce((sum, m) => sum + m.assignment.taxOwed, 0);

  function pick(key: string) {
    setSelectedKey(key);
    setExcluded(new Set());
    setAmountInKind('');
  }

  function toggle(id: string) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const systemName = (solarSystemId: number) =>
    systemNames.get(solarSystemId) ?? `#${String(solarSystemId)}`;

  /** What goes on the record: the ISK that actually moved, or the pilot's figure for ore handed over. */
  const recordedAmount =
    selected?.payment.amount ??
    (amountInKind.trim() === '' ? Math.round(includedTotal) : Number(amountInKind));
  const amountValid = Number.isFinite(recordedAmount) && recordedAmount >= 0;

  // Only shown for a real ISK payment, where a gap between what was sent and
  // what the ticked entries owe is worth noticing before committing.
  const difference =
    selected?.payment.amount === null || selected === null
      ? null
      : selected.payment.amount - includedTotal;

  async function commit() {
    if (!selected || included.length === 0 || !amountValid) return;
    setSaving(true);
    try {
      const { payment, balance } = selected;
      await markAssignmentsPaid(
        included.map((m) => m.assignment),
        {
          paidOn: paidOnFor(payment.date),
          method: payment.method,
          amount: Math.round(recordedAmount),
          ...(payment.kind === 'journal'
            ? { journalRefId: payment.refId }
            : { contractId: payment.refId }),
        }
      );
      // Learned only on confirmation — the pilot agreeing this payment settled
      // this Payee is what makes the recipient identification trustworthy.
      if (payment.counterpartyId !== undefined) {
        await rememberPayeeEntity(balance.payee, payment.counterpartyId);
      }
      onLinked();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const confidenceLabel = (suggestion: LinkSuggestion, payee: PayeeRecord) =>
    t(`miningTax.linkConfidence.${suggestion.confidence}`, { payee: payee.name });

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.linkPaymentTitle')}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.linkPaymentHint')}</p>

        <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {suggestions.map((suggestion) => {
            const { payment } = suggestion;
            const on = payment.key === selectedKey;
            return (
              <li key={payment.key}>
                <label
                  className={cx(
                    'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
                    on && 'border-l border-accent'
                  )}
                >
                  <input
                    type="radio"
                    name="link-payment"
                    className="mt-0.5"
                    checked={on}
                    onChange={() => pick(payment.key)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="tabular-nums">
                      {payment.amount === null
                        ? t('miningTax.linkPaymentInKind')
                        : `${formatIsk(payment.amount, 2)} ISK`}{' '}
                      · {payment.date.slice(0, 10)}
                    </span>
                    <span className="truncate text-text-dim">
                      {payment.label || t('miningTax.linkPaymentUntitledContract')}
                      {payment.counterpartyName ? ` → ${payment.counterpartyName}` : ''}
                    </span>
                    <span className="truncate text-[0.6875rem] text-text-dim">
                      {confidenceLabel(suggestion, suggestion.balance.payee)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {selected && (
          <>
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.linkPaymentCoversLabel', { payee: selected.balance.payee.name })}
              </p>
              <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
                {selected.members.map((m) => {
                  const on = !excluded.has(m.assignment.id);
                  return (
                    <li key={m.assignment.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(m.assignment.id)}
                          aria-label={t('miningTax.linkPaymentIncludeLabel', {
                            date: m.assignment.date,
                          })}
                        />
                        <span className="w-20 shrink-0 tabular-nums">{m.assignment.date}</span>
                        <span className="min-w-0 flex-1 truncate text-text-dim">
                          {systemName(m.assignment.solarSystemId)}
                          {showCharacter && ` · ${m.row.characterName}`}
                        </span>
                        <span className={cx('shrink-0 tabular-nums', !on && 'text-text-faint')}>
                          {formatIsk(m.assignment.taxOwed, 2)} ISK
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            {selected.payment.amount === null && (
              <div className="space-y-1">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.linkPaymentAmountLabel')}
                </p>
                <TextInput
                  type="number"
                  min={0}
                  value={amountInKind}
                  onChange={(e) => setAmountInKind(e.target.value)}
                  placeholder={String(Math.round(includedTotal))}
                  aria-label={t('miningTax.linkPaymentAmountLabel')}
                  className="w-full"
                />
                <p className="text-[0.6875rem] text-text-dim">
                  {t('miningTax.linkPaymentInKindHint')}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.6875rem] text-text-dim">
                {t('miningTax.linkPaymentIncluded', {
                  count: included.length,
                  range: formatDateRange(included.map((m) => m.assignment.date).sort()),
                })}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatIsk(includedTotal, 2)} ISK
              </span>
            </div>

            {difference !== null && Math.round(difference) !== 0 && (
              <p
                className={cx(
                  'text-[0.6875rem]',
                  difference > 0 ? 'text-text-dim' : 'text-warning'
                )}
              >
                {difference > 0
                  ? t('miningTax.linkPaymentOverpaid', {
                      amount: `${formatIsk(difference, 2)} ISK`,
                    })
                  : t('miningTax.linkPaymentShort', {
                      amount: `${formatIsk(-difference, 2)} ISK`,
                    })}
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={!selected || included.length === 0 || !amountValid || saving}
            onClick={() => void commit()}
          >
            {t('miningTax.linkPaymentConfirmAction', { count: included.length })}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
