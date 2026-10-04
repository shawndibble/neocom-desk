import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Disclosure,
  FilterChip,
  Modal,
  IskInput,
  TextInput,
  textActionClassName,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { MiningTaxAssignmentRecord, MiningTaxPaymentMethod } from '@/db';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { unmaskNumber } from '@/lib/numberMask';
import { markAssignmentsPaid, type PaymentInput } from './assignments';
import { buildSettleUpReason, formatDateRange } from './groupRows';
import { allocateOldestFirst } from './settleAllocation';

export interface SettleUpRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
}

interface SettleUpDialogProps {
  open: boolean;
  onClose: () => void;
  /** Every Outstanding Assignment on offer — a balance card's whole balance, or the table's checkbox selection. */
  rows: readonly SettleUpRow[];
  systemNames: ReadonlyMap<number, string>;
  onPaid: () => void;
  /**
   * "Already in my wallet? Pick it" — hands off to the wallet-payment picker
   * for when the transfer already shows in the journal. The button shows only
   * when this is given.
   */
  onPickFromWallet?: () => void;
}

const METHODS: readonly MiningTaxPaymentMethod[] = ['donation', 'contract', 'other'];

/** The summary line's date span, in the same EVE `YYYY-MM-DD` form as every other date on the page. */
function shortEveRange(sortedDates: readonly string[]): string {
  if (sortedDates.length === 0) return '';
  return formatDateRange([sortedDates[0], sortedDates[sortedDates.length - 1]]);
}

const FIELD_LABEL = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * Settle up (issue #523's lump-sum payment flow), on one screen: the itemized
 * entries with tick/untick — the decision doc's "never a blind mark-all-paid"
 * rule — beside the exact whole-ISK figure to send in the EVE client, the
 * Payee name and a reason string, each copyable since the app cannot move ISK,
 * and the paid-on date and method to record once it's sent.
 *
 * No wallet-journal link at pay time: ESI's journal lags too far behind for the
 * transfer to exist yet, so `paymentLinks.ts`'s "paying backwards" matcher
 * attaches it once ESI shows it. "Sent a different amount?" covers the pilot
 * who sent less (or more) than the total: the entered figure is allocated
 * oldest first (`allocateOldestFirst`) over the entries ticked when it opened,
 * and the entries it can't pay in full stay owed.
 */
export function SettleUpDialog({
  open,
  onClose,
  rows,
  systemNames,
  onPaid,
  onPickFromWallet,
}: SettleUpDialogProps) {
  const { t } = useTranslation();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [entriesOpen, setEntriesOpen] = useState(rows.length >= 2);
  // The date the pilot paid, in their own calendar — a local date, not an EVE one.
  const [paidOn, setPaidOn] = useState(() => formatLocalDate(new Date()));
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [contractId, setContractId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Sent a different amount?": the ids ticked when it opened, which each new
  // figure re-allocates over (and closing it restores). `null` while closed.
  const [differentBase, setDifferentBase] = useState<ReadonlySet<string> | null>(null);
  const [sentText, setSentText] = useState('');

  const included = useMemo(
    () => rows.filter((r) => !excluded.has(r.assignment.id)),
    [rows, excluded]
  );
  const total = included.reduce((sum, r) => sum + r.assignment.taxOwed, 0);
  const sentAmount = differentBase === null ? undefined : unmaskNumber(sentText);
  // Whole ISK: the in-game transfer field takes no fractions.
  const amountToSend = Math.round(sentAmount ?? total);

  const allPayeeNames = [...new Set(rows.map((r) => r.payeeName))];
  const title =
    allPayeeNames.length === 1
      ? allPayeeNames[0]
      : t('miningTax.settleUpSeveralPayees', { count: allPayeeNames.length });
  // One Amount + To pair per Payee: each is a separate in-game transfer.
  const perPayee = [...new Set(included.map((r) => r.payeeName))].map((name) => ({
    name,
    subtotal: Math.round(
      included.filter((r) => r.payeeName === name).reduce((s, r) => s + r.assignment.taxOwed, 0)
    ),
  }));

  const sortedDates = included.map((r) => r.assignment.date).sort();
  const systemName = (solarSystemId: number) =>
    systemNames.get(solarSystemId) ?? `#${String(solarSystemId)}`;
  const systems = [...new Set(included.map((r) => systemName(r.assignment.solarSystemId)))];
  const reason = buildSettleUpReason(t('miningTax.settleUpReasonPrefix'), systems, sortedDates);

  function toggle(id: string) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Ticks exactly `keep`, out of the entries in `base`. */
  function tickOnly(base: ReadonlySet<string>, keep: Iterable<string>) {
    const kept = new Set(keep);
    setExcluded(
      new Set(rows.map((r) => r.assignment.id).filter((id) => !base.has(id) || !kept.has(id)))
    );
  }

  function toggleDifferent() {
    if (differentBase === null) {
      setDifferentBase(new Set(included.map((r) => r.assignment.id)));
    } else {
      tickOnly(differentBase, differentBase);
      setDifferentBase(null);
    }
    setSentText('');
  }

  function changeSent(text: string) {
    setSentText(text);
    if (differentBase === null) return;
    const amount = unmaskNumber(text);
    if (amount === undefined) {
      tickOnly(differentBase, differentBase);
      return;
    }
    const pool = rows
      .filter((r) => differentBase.has(r.assignment.id))
      .map((r) => ({
        id: r.assignment.id,
        date: r.assignment.date,
        taxOwed: r.assignment.taxOwed,
      }));
    tickOnly(differentBase, allocateOldestFirst(pool, amount).coveredIds);
  }

  async function copy(kind: string, text: string) {
    try {
      await writeToClipboard(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  function paymentInput(): PaymentInput {
    const trimmed = contractId.trim();
    const parsedContract = Number(trimmed);
    const hasContract =
      method === 'contract' &&
      trimmed !== '' &&
      Number.isSafeInteger(parsedContract) &&
      parsedContract > 0;
    return {
      paidOn,
      method,
      amount: amountToSend,
      ...(hasContract
        ? { contractLinks: [{ refId: parsedContract, source: 'manual' as const }] }
        : {}),
    };
  }

  async function commit(withPayment: boolean) {
    if (included.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await markAssignmentsPaid(
        included.map((r) => r.assignment),
        withPayment ? paymentInput() : undefined
      );
      onPaid();
      onClose();
    } catch {
      setSaveError(t('miningTax.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const copyRow = (key: string, label: string, value: string, copyText: string, dim = false) => (
    <div key={key} className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <span className={cx(FIELD_LABEL, 'w-14 shrink-0')}>{label}</span>
      <span
        className={cx(
          'min-w-0 flex-1 truncate text-xs tabular-nums',
          dim ? 'text-text-dim' : 'font-semibold'
        )}
        title={value}
      >
        {value}
      </span>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => void copy(key, copyText)}
        aria-label={t('miningTax.settleUp.copyNamed', { what: label })}
      >
        {copied === key ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )}
        {copied === key ? t('miningTax.settleUpCopied') : t('miningTax.settleUpCopy')}
      </Button>
    </div>
  );

  // What the "Sent a different amount?" figure does to the ticked entries.
  let allocationSummary: { text: string; warn: boolean } | null = null;
  if (differentBase !== null && sentAmount !== undefined && sentAmount > 0) {
    if (included.length === 0) {
      allocationSummary = { text: t('miningTax.settleUp.notEnough'), warn: true };
    } else {
      const pays = t('miningTax.settleUp.paysSome', {
        paid: included.length,
        count: differentBase.size,
      });
      const gap = Math.round(sentAmount - total);
      const tail =
        gap > 0
          ? t('miningTax.settleUp.leftOver', { amount: formatIsk(gap, 0) })
          : gap < 0
            ? t('miningTax.settleUp.shortBy', { amount: formatIsk(-gap, 0) })
            : null;
      allocationSummary = { text: tail === null ? pays : `${pays} · ${tail}`, warn: gap < 0 };
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.settleUpTitle', { payee: title })}>
      <div className="space-y-3 text-sm">
        <Disclosure
          className="overflow-hidden rounded-xs border border-line"
          label={t('miningTax.settleUp.entriesSummary', {
            count: included.length,
            range: shortEveRange(sortedDates),
          })}
          trailing={`${formatIsk(total)} ISK`}
          expanded={entriesOpen}
          onToggle={() => setEntriesOpen((v) => !v)}
        >
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const on = !excluded.has(r.assignment.id);
              return (
                <li key={r.assignment.id}>
                  <label
                    className={cx(
                      'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs',
                      tappableRowClassName
                    )}
                  >
                    <Checkbox
                      checked={on}
                      onChange={() => toggle(r.assignment.id)}
                      aria-label={t('miningTax.settleUpIncludeLabel', {
                        date: r.assignment.date,
                      })}
                    />
                    <span className="w-20 shrink-0 tabular-nums">{r.assignment.date}</span>
                    <span className="min-w-0 flex-1 truncate text-text-dim">
                      {systemName(r.assignment.solarSystemId)} · {r.characterName}
                      {allPayeeNames.length > 1 && ` · ${r.payeeName}`}
                    </span>
                    <span className={cx('shrink-0 tabular-nums', !on && 'text-text-dim')}>
                      {formatIsk(r.assignment.taxOwed)} ISK
                    </span>
                  </label>
                </li>
              );
            })}
            <li className="px-2 py-1.5 text-[0.6875rem] text-text-dim">
              {t('miningTax.settleUpUntickHint')}
            </li>
          </ul>
        </Disclosure>

        <div className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {perPayee.length <= 1 ? (
            <>
              {copyRow(
                'amount',
                t('miningTax.settleUp.amountLabel'),
                `${formatIsk(amountToSend, 0)} ISK`,
                String(amountToSend)
              )}
              {perPayee.length === 1 &&
                copyRow('to', t('miningTax.settleUp.toLabel'), perPayee[0].name, perPayee[0].name)}
            </>
          ) : (
            perPayee.map((p) => (
              <div key={p.name} className="divide-y divide-line">
                {copyRow(
                  `amount:${p.name}`,
                  t('miningTax.settleUp.amountLabel'),
                  `${formatIsk(p.subtotal, 0)} ISK`,
                  String(p.subtotal)
                )}
                {copyRow(`to:${p.name}`, t('miningTax.settleUp.toLabel'), p.name, p.name)}
              </div>
            ))
          )}
          {copyRow('reason', t('miningTax.settleUp.reasonLabel'), reason, reason, true)}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            className={textActionClassName()}
            aria-expanded={differentBase !== null}
            onClick={toggleDifferent}
          >
            {differentBase === null
              ? t('miningTax.settleUp.differentAmountAction')
              : t('miningTax.settleUp.differentAmountHide')}
          </button>
          {differentBase !== null && (
            <div className="space-y-1">
              <IskInput
                value={sentText}
                onChange={changeSent}
                placeholder={t('miningTax.settleUp.sentAmountPlaceholder')}
                aria-label={t('miningTax.settleUp.sentAmountLabel')}
              />
              {allocationSummary && (
                <p
                  role="status"
                  className={cx(
                    'text-[0.6875rem]',
                    allocationSummary.warn ? 'text-warning' : 'text-text-dim'
                  )}
                >
                  {allocationSummary.text}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="space-y-1 sm:w-36 sm:shrink-0">
            <p className={FIELD_LABEL}>{t('miningTax.settleUpPaidOnLabel')}</p>
            <TextInput
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              aria-label={t('miningTax.settleUpPaidOnLabel')}
              className="w-full"
            />
          </div>
          <div className="min-w-0 space-y-1 sm:flex-1">
            <p className={FIELD_LABEL}>{t('miningTax.settleUpMethodLabel')}</p>
            <div className="flex gap-1.5">
              {METHODS.map((m) => (
                <FilterChip
                  key={m}
                  label={t(`miningTax.settleUpMethod.${m}`)}
                  selected={method === m}
                  onToggle={() => setMethod(m)}
                  className="flex-1 justify-center"
                />
              ))}
            </div>
          </div>
          {method === 'contract' && (
            <div className="space-y-1 sm:w-32 sm:shrink-0">
              <p className={FIELD_LABEL}>{t('miningTax.settleUpContractIdLabel')}</p>
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
          )}
        </div>

        <p className="text-xs text-text-dim">
          {t('miningTax.settleUp.hint')}
          {onPickFromWallet && (
            <>
              {' '}
              <button type="button" className={textActionClassName()} onClick={onPickFromWallet}>
                {t('miningTax.settleUp.pickFromWallet')}
              </button>
            </>
          )}
        </p>

        {saveError && (
          <p role="alert" className="text-xs text-danger">
            {saveError}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={saving || included.length === 0 || paidOn === ''}
            onClick={() => void commit(true)}
          >
            {t('miningTax.settleUp.recordAction')}
          </Button>
          <Button disabled={saving || included.length === 0} onClick={() => void commit(false)}>
            {t('miningTax.settleUpJustMarkPaid')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
