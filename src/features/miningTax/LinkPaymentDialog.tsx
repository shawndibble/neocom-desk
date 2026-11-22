import { utcDayOf } from '../../../functions/src/timeConstants';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  IskInput,
  Modal,
  Radio,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from '@/components/ui';
import { DividedList } from '@/components/ui/DividedList';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import { GrantNote } from '@/app/GrantNote';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { linkPayment } from './ledgerActions';
import { rememberPayeeEntity } from './payees';
import { missingPaymentEndpoints, type MadePaymentSources } from './madePayments';
import { linkFor, type LinkablePayee, type LinkSuggestion, type MadePayment } from './paymentLinks';
import { amountsMatch } from './paymentMatches';
import { PaymentPreview } from './SettleUpDialog';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';

interface LinkPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * The Payee the dialog is for (a merged Payee's primary id), opened from its card, its row or
   * Settle up: its suggestions only, and a payment picked by hand goes to it. Absent, the dialog
   * covers every Payee (the "Payments to link" card): suggestions grouped by Payee, and a Payee
   * to pick for a payment chosen by hand.
   */
  scopeId?: string;
  /** The personal Payees a payment may be linked to. */
  payees: readonly LinkablePayee[];
  /** Unlinked payments with a Payee named, the surest first (`suggestLinks`). */
  suggestions: readonly LinkSuggestion[];
  /** Every Made Payment no link holds and no Corp Tax Book counts: the manual list. */
  candidates: readonly MadePayment[];
  /** Each personal Payee's account, by any of its record ids: what a payment would pay. */
  accountOf: (payeeId: string) => PayeeRunningAccount | undefined;
  /** The Characters whose payments are offered, for a missing Permission's Grant note. */
  characters: readonly { characterId: number; characterName: string }[];
  /** How each tracked Character's payment reads went; a skipped one gets a Grant note. */
  paymentSources?: readonly MadePaymentSources[];
  onLinked: () => void;
}

/** One payment's row, in either list: the amount and day, who it went to, and how sure we are. */
function PaymentRow({
  payment,
  confidence,
  on,
  onPick,
}: {
  payment: MadePayment;
  /** The suggestion's line ("Sent to Rook Belter"); absent on a payment picked by hand. */
  confidence?: string;
  on: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <label
        className={cx(
          'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
          tappableRowClassName,
          on && selectedRowClassName
        )}
      >
        <Radio name="link-payment" className="mt-0.5" checked={on} onChange={onPick} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="tabular-nums">
            {payment.amount === null
              ? t('miningTax.linkPaymentInKind')
              : `${formatIsk(payment.amount)} ISK`}
            {' · '}
            {utcDayOf(payment.date)}
          </span>
          <span className="truncate text-text-dim">
            {payment.label || t('miningTax.linkPaymentUntitledContract')}
            {payment.counterpartyName ? ` → ${payment.counterpartyName}` : ''}
          </span>
          {confidence && (
            <span className="truncate text-[0.6875rem] text-text-dim">{confidence}</span>
          )}
        </span>
      </label>
    </li>
  );
}

/**
 * "I already paid this" (issues #540, #6290): the one place a payment the pilot already sent is
 * linked to a Payee. Suggested matches come first (decision 20261120-235011, "linking money under
 * one payment model": the recipient is the learned entity, then the name, and an amount alone never
 * suggests a transfer a Corp Tax Book holds), then every other unlinked payment from the wallet,
 * searchable. Opened for a Payee, it offers that Payee's own and links a hand pick to it; opened
 * for all of them, the suggestions are grouped by Payee and a hand pick asks which Payee.
 *
 * Confirming links the payment, where it pays the Payee's oldest unpaid days (shown off its account)
 * and what is over is credit; nothing is ticked. A payment in kind asks what its cargo was worth.
 * Every link here is the pilot's own (`manual`). It also teaches the Payee who the recipient was,
 * unless unticked, so the next payment to them is known by its entity.
 */
export function LinkPaymentDialog({
  open,
  onClose,
  scopeId,
  payees,
  suggestions,
  candidates,
  accountOf,
  characters,
  paymentSources = [],
  onLinked,
}: LinkPaymentDialogProps) {
  const { t } = useTranslation();
  const pickPayeeId = useId();
  const scope = scopeId === undefined ? undefined : payees.find((p) => p.id === scopeId);

  const grantGaps = characters
    .map((c) => {
      const sources = paymentSources.find((s) => s.characterId === c.characterId);
      return { ...c, endpoints: sources ? missingPaymentEndpoints(sources) : [] };
    })
    .filter((gap) => gap.endpoints.length > 0);

  // The matches on top: a Payee's own when the dialog is for one.
  const matches = useMemo(
    () => (scope ? suggestions.filter((s) => s.payee.id === scope.id) : suggestions),
    [suggestions, scope]
  );
  const matchedKeys = useMemo(() => new Set(matches.map((s) => s.payment.key)), [matches]);
  // Everything else by hand: what a suggestion already offers is not listed twice.
  const manual = useMemo(
    () => candidates.filter((p) => !matchedKeys.has(p.key)),
    [candidates, matchedKeys]
  );
  const groups = useMemo(() => {
    const byPayee = new Map<string, { payee: LinkablePayee; items: LinkSuggestion[] }>();
    for (const s of matches) {
      const group = byPayee.get(s.payee.id) ?? { payee: s.payee, items: [] };
      group.items.push(s);
      byPayee.set(s.payee.id, group);
    }
    return [...byPayee.values()];
  }, [matches]);

  // The first match, or a lone payment of exactly what is owed: the obvious pick, on first render only.
  const [initialPick] = useState(() => {
    if (matches[0]) return matches[0].payment.key;
    const owed = scope?.owed ?? 0;
    const exact = manual.filter(
      (p) => p.amount !== null && owed > 0 && amountsMatch(owed, p.amount)
    );
    return exact.length === 1 ? exact[0]!.key : null;
  });
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPick);
  const [chosenPayeeId, setChosenPayeeId] = useState<string | null>(null);
  const [valueText, setValueText] = useState('');
  const [valueParses, setValueParses] = useState(true);
  const [remember, setRemember] = useState(true);
  const { pending: saving, error: saveError, setError: setSaveError, run } = useLedgerAction();
  // Set once the link is saved, so a retry after a later failure can't save it twice.
  const [linked, setLinked] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return manual;
    return manual.filter((p) =>
      [p.label, p.counterpartyName, p.date, p.amount === null ? '' : String(Math.round(p.amount))]
        .filter((s): s is string => s !== undefined)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [manual, search]);

  const match = matches.find((s) => s.payment.key === selectedKey) ?? null;
  const selected = match?.payment ?? candidates.find((p) => p.key === selectedKey) ?? null;
  // Who it goes to: the Payee a match names, the Payee the dialog is for, else the one picked.
  const target = match?.payee ?? scope ?? payees.find((p) => p.id === chosenPayeeId) ?? null;
  const account = target ? accountOf(target.id) : undefined;
  /**
   * The ISK that moved, or the pilot's figure for cargo handed over: required, never assumed to be
   * the whole balance (a cargo is rarely worth exactly that).
   */
  const amount =
    selected === null
      ? null
      : (selected.amount ?? (valueText.trim() === '' ? Number.NaN : Number(valueText)));
  const amountValid =
    amount !== null &&
    Number.isFinite(amount) &&
    amount > 0 &&
    (selected?.amount != null || valueParses);
  const outcome =
    selected && amountValid && account ? account.preview(amount, utcDayOf(selected.date)) : null;

  const counterpartyName =
    selected?.counterpartyId === undefined
      ? null
      : (selected.counterpartyName ?? `#${String(selected.counterpartyId)}`);

  function pick(payment: MadePayment) {
    setSelectedKey(payment.key);
    setValueText('');
    setValueParses(true);
    setRemember(true);
  }

  async function commit() {
    if (!selected || !target || !amountValid || amount === null) return;
    const record = target.members[0];
    if (!record) return;
    const result = await run(() =>
      linkPayment(linkFor(selected, target.id, 'manual', Math.round(amount)), selected.characterId)
    );
    if (!result.ok) return;
    setLinked(true);
    try {
      // Learned only on confirmation: the pilot agreeing who was paid is what makes it trustworthy.
      if (remember && selected.counterpartyId !== undefined)
        await rememberPayeeEntity(record, selected.counterpartyId);
    } catch {
      // The payment is linked; only learning who the Payee is failed. Say so and stay open: the
      // reload drops this payment from the lists, which would unmount the message unread.
      setSaveError(t('miningTax.linkWallet.rememberFailed', { payee: target.name }));
      return;
    }
    onLinked();
    onClose();
  }

  function close() {
    if (linked) onLinked();
    onClose();
  }

  const nothingToLink = matches.length === 0 && candidates.length === 0;
  const matchList = (items: readonly LinkSuggestion[]) => (
    <DividedList as="ul">
      {items.map((s) => (
        <PaymentRow
          key={s.payment.key}
          payment={s.payment}
          confidence={t(`miningTax.linkConfidence.${s.confidence}`, { payee: s.payee.name })}
          on={s.payment.key === selectedKey}
          onPick={() => pick(s.payment)}
        />
      ))}
    </DividedList>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      dismissOnOutsidePress={false}
      title={t('miningTax.linkPaymentTitle')}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">
          {scope
            ? t('miningTax.linkWallet.subtitle', {
                payee: scope.name,
                amount: formatIsk(scope.owed, 0),
              })
            : t('miningTax.linkPaymentHint')}
        </p>

        {grantGaps.map((gap) => (
          <GrantNote
            key={gap.characterId}
            characterId={gap.characterId}
            characterName={gap.characterName}
            endpoints={gap.endpoints}
            title={t('miningTax.linkWallet.grantTitle')}
          />
        ))}

        {nothingToLink && (
          <p className="rounded-xs border border-line bg-panel-2 px-3 py-4 text-xs text-text-dim">
            {t('miningTax.linkWallet.empty')}
          </p>
        )}

        {matches.length > 0 && (
          <section className="space-y-1.5" aria-label={t('miningTax.linkWallet.matchesLabel')}>
            <p className={eyebrowClassName}>{t('miningTax.linkWallet.matchesLabel')}</p>
            {scope
              ? matchList(matches)
              : groups.map((group) => (
                  <div key={group.payee.id} className="space-y-1">
                    <p className="text-xs font-semibold">{group.payee.name}</p>
                    {matchList(group.items)}
                  </div>
                ))}
          </section>
        )}

        {manual.length > 0 && (
          <section className="space-y-1.5" aria-label={t('miningTax.linkWallet.manualLabel')}>
            <p className={eyebrowClassName}>
              {matches.length > 0
                ? t('miningTax.linkWallet.otherLabel')
                : t('miningTax.linkWallet.manualLabel')}
            </p>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('miningTax.linkWallet.searchPlaceholder')}
              aria-label={t('miningTax.linkWallet.searchLabel')}
              className="w-full"
            />
            {filtered.length === 0 ? (
              <p className="text-xs text-text-dim">{t('miningTax.linkWallet.noMatch')}</p>
            ) : (
              <ul
                aria-label={t('miningTax.linkWallet.paymentsLabel')}
                className="max-h-56 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2"
              >
                {filtered.map((p) => (
                  <PaymentRow
                    key={p.key}
                    payment={p}
                    on={p.key === selectedKey}
                    onPick={() => pick(p)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* A payment picked by hand, with no Payee the dialog is for: which Payee it paid. */}
        {selected && !target && (
          <div className="space-y-1">
            <p id={pickPayeeId} className={eyebrowClassName}>
              {t('miningTax.linkWallet.payeeLabel')}
            </p>
            <Select value={chosenPayeeId ?? undefined} onValueChange={setChosenPayeeId}>
              <SelectTrigger aria-labelledby={pickPayeeId}>
                <SelectValue placeholder={t('miningTax.linkWallet.payeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {payees.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selected && selected.amount === null && (
          <div className="space-y-1">
            <p className={eyebrowClassName}>{t('miningTax.linkPaymentAmountLabel')}</p>
            <IskInput
              value={valueText}
              onChange={setValueText}
              onParseableChange={setValueParses}
              aria-label={t('miningTax.linkPaymentAmountLabel')}
              className="w-full"
            />
            <p className="text-[0.6875rem] text-text-dim">{t('miningTax.linkPaymentInKindHint')}</p>
          </div>
        )}

        {outcome && <PaymentPreview outcome={outcome} />}

        {selected && target && counterpartyName !== null && (
          <label
            className={cx('flex cursor-pointer items-center gap-2 text-xs', tappableRowClassName)}
          >
            <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="min-w-0">
              {counterpartyName === target.name
                ? t('miningTax.linkWallet.rememberSame', { payee: target.name })
                : t('miningTax.linkWallet.remember', {
                    name: counterpartyName,
                    payee: target.name,
                  })}
            </span>
          </label>
        )}

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Tooltip content={!selected || !target || !amountValid ? t('common.needsInput') : null}>
            <Button
              variant="primary"
              loading={saving}
              aria-disabled={!selected || !target || !amountValid || linked || undefined}
              onClick={() => void commit()}
            >
              {target
                ? t('miningTax.linkPaymentConfirmAction', { payee: target.name })
                : t('miningTax.linkWallet.confirm')}
            </Button>
          </Tooltip>
          <Button className="ml-auto" onClick={close}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
