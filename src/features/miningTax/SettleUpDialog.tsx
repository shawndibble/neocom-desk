import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  Checkbox,
  Disclosure,
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
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import type { MiningTaxAssignmentRecord, MiningTaxPaymentMethod } from '@/db';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { unmaskNumber } from '@/lib/numberMask';
import { buildSettleUpReason, formatDateRange } from './groupRows';
import { settle, type PaymentInput } from './ledgerActions';
import { systemLabel } from './names';
import { SETTLE_FIELD_LABEL, useCopiedField } from './settleUpFields';
import { SettleCopyRow, SettleSentOnAndMethod } from './SettleUpParts';
import { allocateOldestFirst } from './settleAllocation';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { OreArrivalNotice } from './OreArrivalNotice';
import { PayeeOpenInEveButton } from './PayeeOpenInEveButton';
import { payerOptions } from './settlePayer';
import type { SettleUpRecheck } from './useSettleUpRecheck';
import { toggleInSet } from '@/lib/sets';

export interface SettleUpRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
  payeeId?: string;
  /** The Payee's EVE entity id, when it has one — Settle up opens it in EVE from here. */
  payeeEntityId?: number;
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
  onPickFromWallet?: (tickedIds: ReadonlySet<string>) => void;
  /** The fresh ledger pull behind the "Ore still arriving" line; absent, the line judges what is already loaded. */
  arrivalCheck?: SettleUpRecheck;
  /**
   * The Character paying (`settlePayer.defaultPayer`, or a row's own). Only
   * its entries start ticked; absent, the Character owing most.
   */
  payerId?: number;
  /**
   * Opened from one entry: only these start ticked, and the payer's other
   * entries wait unticked under "Also pay N other entries".
   */
  focusIds?: ReadonlySet<string>;
}

/** More Characters than this pick from a list instead of a segmented row (DESIGN §4). */
const MAX_SEGMENTED_PAYERS = 4;

/** The summary line's date span, in the same EVE `YYYY-MM-DD` form as every other date on the page. */
function shortEveRange(sortedDates: readonly string[]): string {
  if (sortedDates.length === 0) return '';
  return formatDateRange([sortedDates[0], sortedDates[sortedDates.length - 1]]);
}

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
  arrivalCheck,
  payerId,
  focusIds,
}: SettleUpDialogProps) {
  const { t } = useTranslation();
  // Rows can refresh while open (`liveSettleUpRows`) but never change who's in them.
  const payers = useMemo(() => payerOptions(rows), [rows]);
  const [payer, setPayer] = useState<number | null>(
    () => (payers.some((p) => p.characterId === payerId) ? payerId : payers[0]?.characterId) ?? null
  );
  // A focus naming none of the payer's offered entries would open with nothing ticked: drop it.
  const [focus, setFocus] = useState<ReadonlySet<string> | null>(() =>
    focusIds !== undefined &&
    rows.some((r) => r.assignment.characterId === payer && focusIds.has(r.assignment.id))
      ? focusIds
      : null
  );
  const fromId = useId();
  const startsTicked = (r: SettleUpRow, who: number | null, only: ReadonlySet<string> | null) =>
    (who === null || r.assignment.characterId === who) &&
    (only === null || only.has(r.assignment.id));
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(
    () => new Set(rows.filter((r) => !startsTicked(r, payer, focus)).map((r) => r.assignment.id))
  );
  const primaryRows = rows.filter((r) => startsTicked(r, payer, focus));
  const sameCharacterRest =
    focus === null
      ? []
      : rows.filter((r) => r.assignment.characterId === payer && !focus.has(r.assignment.id));
  const otherCharacterRows =
    payer === null ? [] : rows.filter((r) => r.assignment.characterId !== payer);
  const payerName = payers.find((p) => p.characterId === payer)?.characterName;
  const [entriesOpen, setEntriesOpen] = useState(primaryRows.length >= 2);
  const [restOpen, setRestOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  // The date the pilot paid, in their own calendar — a local date, not an EVE one.
  const [paidOn, setPaidOn] = useState(() => formatLocalDate(new Date()));
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [contractId, setContractId] = useState('');
  const { copied, copy } = useCopiedField();
  const { pending: saving, error: saveError, run } = useLedgerAction();
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
    payeeId: included.find((r) => r.payeeName === name)?.payeeId,
    entityId: included.find((r) => r.payeeName === name)?.payeeEntityId,
    subtotal: Math.round(
      included.filter((r) => r.payeeName === name).reduce((s, r) => s + r.assignment.taxOwed, 0)
    ),
  }));

  const sortedDates = included.map((r) => r.assignment.date).sort();
  const systemName = (solarSystemId: number) => systemLabel(systemNames, solarSystemId);
  const systems = [...new Set(included.map((r) => systemName(r.assignment.solarSystemId)))];
  const reason = buildSettleUpReason(t('miningTax.settleUpReasonPrefix'), systems, sortedDates);

  function toggle(id: string) {
    setExcluded((previous) => toggleInSet(previous, id));
  }

  /** A new payer ticks exactly its own entries; a half-entered different amount starts over. */
  function changePayer(next: number) {
    setPayer(next);
    setFocus(null);
    setExcluded(
      new Set(rows.filter((r) => r.assignment.characterId !== next).map((r) => r.assignment.id))
    );
    setEntriesOpen(rows.filter((r) => r.assignment.characterId === next).length >= 2);
    setDifferentBase(null);
    setSentText('');
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
    await run(
      () =>
        settle(
          included.map((r) => r.assignment),
          withPayment ? paymentInput() : undefined
        ),
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

  // Right-aligned: the label names the paying Character, too long to share the To row. A single Payee's
  // sits above the To/Amount box; with several, each heads its own pair inside it.
  // Empty (and hidden) when no Character holds the Open in EVE permission.
  const openInEveRow = (
    p: { name: string; entityId?: number; payeeId?: string },
    className?: string
  ) => (
    <div key={`open:${p.name}`} className={cx('flex justify-end empty:hidden', className)}>
      <PayeeOpenInEveButton
        name={p.name}
        entityId={p.entityId}
        payeeId={p.payeeId}
        fromCharacter={
          payer === null || payerName === undefined ? undefined : { id: payer, name: payerName }
        }
      />
    </div>
  );

  const entryRow = (r: SettleUpRow, showCharacter: boolean) => {
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
            {systemName(r.assignment.solarSystemId)}
            {showCharacter && ` · ${r.characterName}`}
            {allPayeeNames.length > 1 && ` · ${r.payeeName}`}
          </span>
          <span className={cx('shrink-0 tabular-nums', !on && 'text-text-dim')}>
            {formatIsk(r.assignment.taxOwed)} ISK
          </span>
        </label>
      </li>
    );
  };

  const sumOwed = (list: readonly SettleUpRow[]) =>
    list.reduce((sum, r) => sum + r.assignment.taxOwed, 0);
  const primaryTicked = primaryRows.filter((r) => !excluded.has(r.assignment.id));

  /** One collapsible list of tickable entries: the payer's, or an "Also pay" group. */
  const entryGroup = (
    label: string,
    trailingIsk: number,
    list: readonly SettleUpRow[],
    [expanded, setExpanded]: [boolean, (update: (open: boolean) => boolean) => void],
    showCharacter: boolean,
    footer?: ReactNode
  ) => (
    <Disclosure
      key={label}
      className="overflow-hidden rounded-xs border border-line"
      label={label}
      trailing={`${formatIsk(trailingIsk)} ISK`}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      <ul className="divide-y divide-line">
        {list.map((r) => entryRow(r, showCharacter))}
        {footer}
      </ul>
    </Disclosure>
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
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.settleUpTitle', { payee: title })}
    >
      <div className="space-y-3 text-sm">
        <OreArrivalNotice
          entries={included.map((r) => r.assignment)}
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
                  label: t('miningTax.settleUp.fromOption', {
                    name: p.characterName,
                    amount: formatIsk(p.subtotal, 0),
                  }),
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
                      {t('miningTax.settleUp.fromOption', {
                        name: p.characterName,
                        amount: formatIsk(p.subtotal, 0),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {entryGroup(
          t('miningTax.settleUp.entriesSummary', {
            count: primaryTicked.length,
            range: shortEveRange(primaryTicked.map((r) => r.assignment.date).sort()),
          }),
          sumOwed(primaryTicked),
          primaryRows,
          [entriesOpen, setEntriesOpen],
          // With no picker, the row itself names who mined it; with one, the picker does.
          payers.length === 1,
          <li className="px-2 py-1.5 text-[0.6875rem] text-text-dim">
            {t('miningTax.settleUpUntickHint')}
          </li>
        )}
        {sameCharacterRest.length > 0 &&
          entryGroup(
            t('miningTax.settleUp.alsoPayRest', { count: sameCharacterRest.length }),
            sumOwed(sameCharacterRest),
            sameCharacterRest,
            [restOpen, setRestOpen],
            false
          )}
        {otherCharacterRows.length > 0 &&
          entryGroup(
            t('miningTax.settleUp.alsoPayOthers', { count: otherCharacterRows.length }),
            sumOwed(otherCharacterRows),
            otherCharacterRows,
            [othersOpen, setOthersOpen],
            true
          )}

        {perPayee.length === 1 && openInEveRow(perPayee[0])}
        <div className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {perPayee.length <= 1 ? (
            <>
              {perPayee.length === 1 &&
                copyRow('to', t('miningTax.settleUp.toLabel'), perPayee[0].name, perPayee[0].name)}
              {copyRow(
                'amount',
                t('miningTax.settleUp.amountLabel'),
                `${formatIsk(amountToSend, 0)} ISK`,
                String(amountToSend)
              )}
            </>
          ) : (
            perPayee.map((p) => (
              <div key={p.name} className="divide-y divide-line">
                {openInEveRow(p, 'px-2 py-1.5')}
                {copyRow(`to:${p.name}`, t('miningTax.settleUp.toLabel'), p.name, p.name)}
                {copyRow(
                  `amount:${p.name}`,
                  t('miningTax.settleUp.amountLabel'),
                  `${formatIsk(p.subtotal, 0)} ISK`,
                  String(p.subtotal)
                )}
              </div>
            ))
          )}
          {copyRow('reason', t('miningTax.settleUp.reasonLabel'), reason, reason, true)}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            className={textActionClassName('gap-1.5')}
            aria-expanded={differentBase !== null}
            onClick={toggleDifferent}
          >
            <Caret expanded={differentBase !== null} />
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

        <p className="text-xs text-text-dim">
          {t('miningTax.settleUp.hint')}
          {onPickFromWallet && (
            <>
              {' '}
              <button
                type="button"
                className={inlineLinkClassName}
                onClick={() => onPickFromWallet(new Set(included.map((r) => r.assignment.id)))}
              >
                {t('miningTax.settleUp.pickFromWallet')}
              </button>
            </>
          )}
        </p>

        <LedgerActionError error={saveError} />
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
