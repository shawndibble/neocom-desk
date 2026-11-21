import { utcDayOf } from '../../../functions/src/timeConstants';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, IskInput, Radio } from '@/components/ui';
import { selectedRowClassName } from '@/components/ui/controlStyles';
import type { PayeeAccount } from '@/engine/miningTax/payeeAccount';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { linkPayment } from './ledgerActions';
import { rememberPayeeEntity } from './payees';
import { linkFor, type LinkSuggestion } from './paymentLinks';
import { PaymentPreview } from './SettleUpDialog';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { DividedList } from '@/components/ui/DividedList';

interface LinkPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Unlinked payments with a Payee named, the surest first. */
  suggestions: readonly LinkSuggestion[];
  /** Each personal Payee's account, by any of its record ids: what a payment would pay. */
  accountOf: (payeeId: string) => PayeeAccount | undefined;
  onLinked: () => void;
}

/**
 * "I already paid this" (issue #540): a payment the app found unaccounted for, with the Payee it
 * most likely went to. Confirming links it to that Payee, where it pays the oldest unpaid days
 * (shown off the account) and what is over is credit; nothing is ticked. It also teaches the Payee
 * who the recipient was, so the next payment to them is known by its entity.
 */
export function LinkPaymentDialog({
  open,
  onClose,
  suggestions,
  accountOf,
  onLinked,
}: LinkPaymentDialogProps) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(
    suggestions[0]?.payment.key ?? null
  );
  // Only meaningful for a payment in kind, whose cargo is never priced.
  const [amountInKind, setAmountInKind] = useState('');
  const [amountInKindParses, setAmountInKindParses] = useState(true);
  const { pending: saving, error: saveError, setError: setSaveError, run } = useLedgerAction();
  // Set once the link is saved, so a retry after a later failure can't save it twice.
  const [linked, setLinked] = useState(false);

  const selected = suggestions.find((s) => s.payment.key === selectedKey) ?? null;
  const account = selected ? accountOf(selected.payee.id) : undefined;
  // A payment in kind's figure is the pilot's to give: never assumed to be the whole balance.
  const amount =
    selected?.payment.amount ?? (amountInKind.trim() === '' ? Number.NaN : Number(amountInKind));
  const amountValid =
    Number.isFinite(amount) &&
    amount > 0 &&
    (selected?.payment.amount != null || amountInKindParses);
  const outcome =
    selected && amountValid && account
      ? account.preview(amount, utcDayOf(selected.payment.date))
      : null;

  function pick(key: string) {
    setSelectedKey(key);
    setAmountInKind('');
    setAmountInKindParses(true);
  }

  async function commit() {
    if (!selected || !amountValid) return;
    const { payment, payee } = selected;
    const record = payee.members[0];
    if (!record) return;
    const result = await run(() =>
      linkPayment(linkFor(payment, payee.id, 'manual', Math.round(amount)), payment.characterId)
    );
    if (!result.ok) return;
    setLinked(true);
    try {
      // Learned only on confirmation: the pilot agreeing who was paid is what makes it trustworthy.
      if (payment.counterpartyId !== undefined)
        await rememberPayeeEntity(record, payment.counterpartyId);
    } catch {
      // The link is saved; only learning who the Payee is failed. Say so and stay open: the
      // reload drops this payment from the suggestions, which would unmount the message unread.
      setSaveError(t('miningTax.linkWallet.rememberFailed', { payee: payee.name }));
      return;
    }
    onLinked();
    onClose();
  }

  function close() {
    if (linked) onLinked();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      dismissOnOutsidePress={false}
      title={t('miningTax.linkPaymentTitle')}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.linkPaymentHint')}</p>

        <DividedList as="ul">
          {suggestions.map((suggestion) => {
            const { payment } = suggestion;
            const on = payment.key === selectedKey;
            return (
              <li key={payment.key}>
                <label
                  className={cx(
                    'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
                    on && selectedRowClassName
                  )}
                >
                  <Radio
                    name="link-payment"
                    className="mt-0.5"
                    checked={on}
                    onChange={() => pick(payment.key)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="tabular-nums">
                      {payment.amount === null
                        ? t('miningTax.linkPaymentInKind')
                        : `${formatIsk(payment.amount)} ISK`}{' '}
                      · {utcDayOf(payment.date)}
                    </span>
                    <span className="truncate text-text-dim">
                      {payment.label || t('miningTax.linkPaymentUntitledContract')}
                      {payment.counterpartyName ? ` → ${payment.counterpartyName}` : ''}
                    </span>
                    <span className="truncate text-[0.6875rem] text-text-dim">
                      {t(`miningTax.linkConfidence.${suggestion.confidence}`, {
                        payee: suggestion.payee.name,
                      })}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </DividedList>

        {selected && selected.payment.amount === null && (
          <div className="space-y-1">
            <p className={eyebrowClassName}>{t('miningTax.linkPaymentAmountLabel')}</p>
            <IskInput
              value={amountInKind}
              onChange={setAmountInKind}
              onParseableChange={setAmountInKindParses}
              aria-label={t('miningTax.linkPaymentAmountLabel')}
              className="w-full"
            />
            <p className="text-[0.6875rem] text-text-dim">{t('miningTax.linkPaymentInKindHint')}</p>
          </div>
        )}

        {outcome && <PaymentPreview outcome={outcome} />}

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={!selected || !amountValid || saving || linked}
            onClick={() => void commit()}
          >
            {selected
              ? t('miningTax.linkPaymentConfirmAction', { payee: selected.payee.name })
              : t('miningTax.linkPaymentTitle')}
          </Button>
          <Button size="sm" onClick={close}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
