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
  Tooltip,
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
import { UnlinkedSentNote, type UnlinkedSent } from './UnlinkedSentNote';

export interface SettleUpRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
  payeeId?: string;
  payeeEntityId?: number;
}

export interface SettlePayment {
  amount: number;
  paidOn: string;
  method: MiningTaxPaymentMethod;
  contractId?: number;
  payerId: number | null;
}

interface SettleUpDialogProps {
  open: boolean;
  onClose: () => void;
  rows: readonly SettleUpRow[];
  onPaid: () => void;
  owedFor: (payerId: number | null) => number;
  preview: (amount: number, paidOn: string, payerId: number | null) => PaymentOutcome | undefined;
  record?: (payment: SettlePayment) => Promise<LedgerActionResult>;
  onPickFromWallet?: () => void;
  unlinked?: UnlinkedSent;
  onDismissBalance?: () => Promise<LedgerActionResult>;
  arrivalCheck?: SettleUpRecheck;
  payerId?: number;
  reason:
    string | ((payerId: number | null, outcome: PaymentOutcome | undefined) => string | undefined);
  reasonHint?: string;
  methods?: readonly MiningTaxPaymentMethod[];
  notice?: ReactNode | ((payerId: number | null, amount: number) => ReactNode);
}

const MAX_SEGMENTED_PAYERS = 4;

export function SettleUpDialog({
  open,
  onClose,
  rows,
  onPaid,
  owedFor,
  preview,
  record,
  onPickFromWallet,
  onDismissBalance,
  unlinked,
  arrivalCheck,
  payerId,
  reason: reasonOf,
  reasonHint,
  methods,
  notice,
}: SettleUpDialogProps) {
  const { t } = useTranslation();
  const payers = useMemo(() => payerOptions(rows), [rows]);
  const [payer, setPayer] = useState<number | null>(
    () => (payers.some((p) => p.characterId === payerId) ? payerId : payers[0]?.characterId) ?? null
  );
  const fromId = useId();
  const payerName = payers.find((p) => p.characterId === payer)?.characterName;
  const [paidOn, setPaidOn] = useState(() => formatLocalDate(new Date()));
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [contractId, setContractId] = useState('');
  const { copied, copy } = useCopiedField();
  const { pending: saving, error: saveError, run } = useLedgerAction();
  const [different, setDifferent] = useState(false);
  const [sentText, setSentText] = useState('');
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  const owed = owedFor(payer);
  const sentAmount = different ? unmaskNumber(sentText) : undefined;
  const amountToSend = Math.round(sentAmount ?? owed);
  const outcome = amountToSend > 0 ? preview(amountToSend, paidOn, payer) : undefined;

  const first = rows[0];
  const payeeName = first?.payeeName ?? '';
  const reason = (typeof reasonOf === 'function' ? reasonOf(payer, outcome) : reasonOf) ?? '';

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
    return {
      amount: amountToSend,
      paidOn,
      method,
      payerId: payer,
      ...(hasContract ? { contractId: parsed } : {}),
    };
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

  async function dismissBalance() {
    if (!onDismissBalance) return;
    await run(onDismissBalance, () => {
      onPaid();
      onClose();
    });
  }

  const copyRow = (
    key: string,
    label: string,
    value: string,
    copyText: string,
    dim = false,
    hint?: string
  ) => (
    <SettleCopyRow
      key={key}
      label={label}
      value={value}
      copied={copied === key}
      onCopy={() => void copy(key, copyText)}
      dim={dim}
      {...(hint ? { hint } : {})}
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
            copyRow(
              'reason',
              t('miningTax.settleUp.reasonLabel'),
              reason,
              reason,
              true,
              reasonHint
            )}
        </DividedList>
        {unlinked && unlinked.count > 0 && (
          <div className="space-y-1">
            <UnlinkedSentNote unlinked={unlinked} />
            {onPickFromWallet && (
              <button type="button" className={inlineLinkClassName} onClick={onPickFromWallet}>
                {t('miningTax.owed.linkPayment')}
              </button>
            )}
          </div>
        )}
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
            {...(methods ? { methods } : {})}
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
        {confirmingDismiss && onDismissBalance && (
          <div
            role="group"
            aria-label={t('miningTax.settleUp.dismiss.title')}
            className="space-y-2 rounded-xs border border-line bg-panel-2 p-2 text-xs"
          >
            <p>
              {t('miningTax.settleUp.dismiss.intro', {
                amount: formatIsk(owed, 0),
                payee: payeeName,
              })}
            </p>
            <p className="text-text-dim">{t('miningTax.settleUp.dismiss.effect')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="danger"
                loading={saving}
                onClick={() => void dismissBalance()}
              >
                {t('miningTax.settleUp.dismiss.confirm', { count: rows.length })}
              </Button>
              <Button
                size="sm"
                aria-disabled={saving || undefined}
                onClick={() => setConfirmingDismiss(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {record ? (
            <Tooltip content={amountToSend <= 0 || paidOn === '' ? t('common.needsInput') : null}>
              <Button
                variant="primary"
                loading={saving}
                aria-disabled={amountToSend <= 0 || paidOn === '' || undefined}
                onClick={() => void commit()}
              >
                {t('miningTax.settleUp.recordAction')}
              </Button>
            </Tooltip>
          ) : (
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          )}
          {onDismissBalance && !confirmingDismiss && (
            <Button
              variant="danger"
              aria-disabled={saving || undefined}
              onClick={() => setConfirmingDismiss(true)}
            >
              {t('miningTax.settleUp.dismiss.action')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

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
