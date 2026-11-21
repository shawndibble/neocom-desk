import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  Modal,
  IskInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  textActionClassName,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { MiningTaxAssignmentRecord, MiningTaxPaymentMethod } from '@/db';
import type { PaymentOutcome } from '@/engine/corpTaxBook/paymentPreview';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { unmaskNumber } from '@/lib/numberMask';
import type { LedgerActionResult } from './ledgerActions';
import { SETTLE_FIELD_LABEL, useCopiedField } from './settleUpFields';
import { SettleCopyRow, SettleSentOnAndMethod } from './SettleUpParts';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { OreArrivalNotice } from './OreArrivalNotice';
import { PayeeOpenInEveButton } from './PayeeOpenInEveButton';
import { payerOptions } from './settlePayer';
import type { SettleUpRecheck } from './useSettleUpRecheck';
import { DividedList } from '@/components/ui/DividedList';

/** One Outstanding entry of the Payee being paid, and who mined it. */
export interface SettleUpRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
  payeeId?: string;
  /** The Payee's EVE entity id, when it has one — Settle up opens it in EVE from here. */
  payeeEntityId?: number;
}

/** What Settle up records for a personal Payee: one payment, linked to it. */
export interface SettlePayment {
  /** Whole ISK, as the in-game transfer field takes it. */
  amount: number;
  /** The pilot's own calendar date. */
  paidOn: string;
  method: MiningTaxPaymentMethod;
  /** A payment in kind's contract, when the pilot gave its id. */
  contractId?: number;
}

interface SettleUpDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * The Payee's Outstanding entries in view: who can pay, and the entries the "Ore still
   * arriving" line watches. Never ticked: a payment pays the Payee's oldest unpaid days.
   */
  rows: readonly SettleUpRow[];
  onPaid: () => void;
  /**
   * What the Payee's account owes now, for the paying Character (a Corp Tax Book's: the payer's
   * Miner's account).
   */
  owedFor: (payerId: number | null) => number;
  /**
   * What sending `amount` would do, read off the account (`previewPayment`): the days it pays,
   * oldest first, and the credit it leaves. Undefined while there is nothing to preview.
   */
  preview: (amount: number, paidOn: string, payerId: number | null) => PaymentOutcome | undefined;
  /**
   * Records the payment as a link to the Payee. Absent for a Corp Tax Book, which credits the
   * donation from its own wallet: the dialog then only says how to send it.
   */
  record?: (payment: SettlePayment) => Promise<LedgerActionResult>;
  /**
   * "Already in my wallet? Pick it" — hands off to the wallet-payment picker for when the transfer
   * already shows in the journal. The button shows only when this is given.
   */
  onPickFromWallet?: () => void;
  /** The fresh ledger pull behind the "Ore still arriving" line. */
  arrivalCheck?: SettleUpRecheck;
  /** The Character paying; absent, the Character owing most. */
  payerId?: number;
  /** The Reason to copy (a Miner's code for a book); a function follows the paying Character. */
  reason: string | ((payerId: number | null) => string | undefined);
  /** Payee-specific lines under the To / Amount / Reason box (where a corp's book wants it sent). */
  notice?: ReactNode | ((payerId: number | null, amount: number) => ReactNode);
}

/** More Characters than this pick from a list instead of a segmented row (DESIGN §4). */
const MAX_SEGMENTED_PAYERS = 4;

/**
 * Settle up (issue #523), on one screen and on the Payee's Running account (decision
 * 20261120-235011): the whole-ISK figure the account owes, the Payee and a Reason, each copyable
 * since the app cannot move ISK, and what the amount pays, oldest day first, with any credit it
 * leaves. Nothing is ticked: money pays the oldest unpaid days, whichever entries the pilot has in
 * mind. A personal Payee's payment is recorded as a link (`record`), which the matcher later
 * swaps for its wallet transaction; a Corp Tax Book records nothing, since it credits the
 * donation from its own wallet.
 */
export function SettleUpDialog({
  open,
  onClose,
  rows,
  onPaid,
  owedFor,
  preview,
  record,
  onPickFromWallet,
  arrivalCheck,
  payerId,
  reason: reasonOf,
  notice,
}: SettleUpDialogProps) {
  const { t } = useTranslation();
  const payers = useMemo(() => payerOptions(rows), [rows]);
  const [payer, setPayer] = useState<number | null>(
    () => (payers.some((p) => p.characterId === payerId) ? payerId : payers[0]?.characterId) ?? null
  );
  const fromId = useId();
  const payerName = payers.find((p) => p.characterId === payer)?.characterName;
  // The date the pilot paid, in their own calendar — a local date, not an EVE one.
  const [paidOn, setPaidOn] = useState(() => formatLocalDate(new Date()));
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [contractId, setContractId] = useState('');
  const { copied, copy } = useCopiedField();
  const { pending: saving, error: saveError, run } = useLedgerAction();
  const [different, setDifferent] = useState(false);
  const [sentText, setSentText] = useState('');

  const owed = owedFor(payer);
  const sentAmount = different ? unmaskNumber(sentText) : undefined;
  // Whole ISK: the in-game transfer field takes no fractions.
  const amountToSend = Math.round(sentAmount ?? owed);
  const outcome = amountToSend > 0 ? preview(amountToSend, paidOn, payer) : undefined;

  const first = rows[0];
  const payeeName = first?.payeeName ?? '';
  const reason = (typeof reasonOf === 'function' ? reasonOf(payer) : reasonOf) ?? '';

  function changePayer(next: number) {
    setPayer(next);
    setDifferent(false);
    setSentText('');
  }

  function payment(): SettlePayment {
    const trimmed = contractId.trim();
    const parsed = Number(trimmed);
    const hasContract =
      method === 'contract' && trimmed !== '' && Number.isSafeInteger(parsed) && parsed > 0;
    return { amount: amountToSend, paidOn, method, ...(hasContract ? { contractId: parsed } : {}) };
  }

  async function commit() {
    if (!record || amountToSend <= 0) return;
    await run(
      () => record(payment()),
      () => {
        onPaid();
        onClose();
      }
    );
  }

  const copyRow = (key: string, label: string, value: string, copyText: string, dim = false) => (
    <SettleCopyRow
      key={key}
      label={label}
      value={value}
      copied={copied === key}
      onCopy={() => void copy(key, copyText)}
      dim={dim}
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.settleUpTitle', { payee: payeeName })}
    >
      <div className="space-y-3 text-sm">
        <OreArrivalNotice
          entries={rows.map((r) => ({
            characterId: r.assignment.characterId,
            date: r.assignment.date,
            solarSystemId: r.assignment.solarSystemId,
            typeIds: r.assignment.oreLines.map((line) => line.typeId),
          }))}
          checking={arrivalCheck?.checking ?? false}
          pullStartedAt={arrivalCheck?.pullStartedAt ?? null}
        />
        {payers.length > 1 && payer !== null && (
          <div className="space-y-1">
            <p id={fromId} className={SETTLE_FIELD_LABEL}>
              {t('miningTax.settleUp.fromLabel')}
            </p>
            {payers.length <= MAX_SEGMENTED_PAYERS ? (
              <SegmentedControl
                label={t('miningTax.settleUp.fromLabel')}
                uppercase={false}
                fill
                options={payers.map((p) => ({
                  value: String(p.characterId),
                  label: p.characterName,
                }))}
                value={String(payer)}
                onChange={(value) => changePayer(Number(value))}
              />
            ) : (
              <Select value={String(payer)} onValueChange={(value) => changePayer(Number(value))}>
                <SelectTrigger aria-labelledby={fromId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {payers.map((p) => (
                    <SelectItem key={p.characterId} value={String(p.characterId)}>
                      {p.characterName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Right-aligned: the label names the paying Character, too long to share the To row. */}
        <div className="flex justify-end empty:hidden">
          <PayeeOpenInEveButton
            name={payeeName}
            entityId={first?.payeeEntityId}
            payeeId={first?.payeeId}
            fromCharacter={
              payer === null || payerName === undefined ? undefined : { id: payer, name: payerName }
            }
          />
        </div>
        <DividedList>
          {copyRow('to', t('miningTax.settleUp.toLabel'), payeeName, payeeName)}
          {copyRow(
            'amount',
            t('miningTax.settleUp.amountLabel'),
            `${formatIsk(amountToSend, 0)} ISK`,
            String(amountToSend)
          )}
          {reason !== '' &&
            copyRow('reason', t('miningTax.settleUp.reasonLabel'), reason, reason, true)}
        </DividedList>
        {outcome && <PaymentPreview outcome={outcome} />}
        {typeof notice === 'function' ? notice(payer, amountToSend) : notice}

        <div className="space-y-1.5">
          <button
            type="button"
            className={textActionClassName('gap-1.5')}
            aria-expanded={different}
            onClick={() => {
              setDifferent((v) => !v);
              setSentText('');
            }}
          >
            <Caret expanded={different} />
            {different
              ? t('miningTax.settleUp.differentAmountHide')
              : t('miningTax.settleUp.differentAmountAction')}
          </button>
          {different && (
            <IskInput
              value={sentText}
              onChange={setSentText}
              placeholder={t('miningTax.settleUp.sentAmountPlaceholder')}
              aria-label={t('miningTax.settleUp.sentAmountLabel')}
            />
          )}
        </div>

        {record && (
          <SettleSentOnAndMethod
            paidOn={paidOn}
            onPaidOn={setPaidOn}
            method={method}
            onMethod={setMethod}
            extra={
              method === 'contract' ? (
                <div className="space-y-1 sm:w-32 sm:shrink-0">
                  <p className={SETTLE_FIELD_LABEL}>{t('miningTax.settleUpContractIdLabel')}</p>
                  <TextInput
                    type="text"
                    inputMode="numeric"
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    placeholder={t('miningTax.settleUpContractIdPlaceholder')}
                    aria-label={t('miningTax.settleUpContractIdLabel')}
                    className="w-full"
                  />
                </div>
              ) : null
            }
          />
        )}

        {record && (
          <p className="text-xs text-text-dim">
            {t('miningTax.settleUp.hint')}
            {onPickFromWallet && (
              <>
                {' '}
                <button type="button" className={inlineLinkClassName} onClick={onPickFromWallet}>
                  {t('miningTax.settleUp.pickFromWallet')}
                </button>
              </>
            )}
          </p>
        )}

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          {record ? (
            <Button
              variant="primary"
              disabled={saving || amountToSend <= 0 || paidOn === ''}
              onClick={() => void commit()}
            >
              {t('miningTax.settleUp.recordAction')}
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** What the amount pays off the account, oldest day first, and the credit it leaves. */
export function PaymentPreview({ outcome }: { outcome: PaymentOutcome }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) =>
    t(`miningTax.settleUp.preview.${key}`, opts);
  return (
    <div role="status" className="space-y-1 text-xs">
      {outcome.lines.length > 0 && (
        <>
          <p className="text-text-dim">{k('pays')}</p>
          <ul className="space-y-0.5">
            {outcome.lines.map((line) => (
              <li key={line.date} className="flex justify-between gap-2 tabular-nums">
                <span>{line.date}</span>
                <span className={cx(!line.settled && 'text-warning')}>
                  {line.settled
                    ? k('paidDay', { amount: formatIsk(line.applied, 0) })
                    : k('partDay', {
                        amount: formatIsk(line.applied, 0),
                        left: formatIsk(line.remainingAfter, 0),
                      })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {outcome.creditAdded >= 1 && (
        <p className="text-success">{k('credit', { amount: formatIsk(outcome.creditAdded, 0) })}</p>
      )}
      {outcome.owedAfter >= 1 && (
        <p className="text-text-dim">
          {k('owedAfter', { amount: formatIsk(outcome.owedAfter, 0) })}
        </p>
      )}
    </div>
  );
}
