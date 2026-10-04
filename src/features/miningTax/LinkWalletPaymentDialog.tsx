import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IskInput, Modal, Radio, TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { PayeeRecord } from '@/db';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import type { GroupMember } from './groupRows';
import { settle } from './ledgerActions';
import { rememberPayeeEntity } from './payees';
import { exactAmountMatches, type MadePayment } from './paymentLinks';
import { allocateOldestFirst } from './settleAllocation';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';

interface LinkWalletPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  payee: PayeeRecord;
  /** That Payee's Outstanding Assignments, with their ledger rows. */
  owed: readonly GroupMember[];
  /** Made Payments no Assignment records yet. */
  candidates: readonly MadePayment[];
  systemNames: ReadonlyMap<number, string>;
  onLinked: () => void;
}

/**
 * The payment's own date as a local calendar date, falling back to today —
 * same rule as `LinkPaymentDialog`: an unparseable ESI date must not become an
 * Invalid Date in a synced record.
 */
function paidOnFor(isoDate: string): string {
  const parsed = new Date(isoDate);
  return formatLocalDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}

const FIELD_LABEL = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * "Link a wallet payment": the pilot picks, from their own wallet, the Made
 * Payment that settled this Payee's owed entries — for when `suggestLink`
 * didn't offer it (no learned identity, an amount that matches nothing) and
 * the row isn't Paid yet, which is all `LinkTransactionDialog` covers.
 *
 * Picking a payment pre-ticks the oldest entries its amount pays in full
 * (`allocateOldestFirst`, the same rule as Settle up's "Sent a different
 * amount?"); a payment in kind has no amount, so it pre-ticks everything and
 * asks what the cargo was worth. The ticks stay editable — never a blind
 * mark-all. Confirming records the payment against every ticked Assignment
 * with a manual link to the transaction, and (unless unticked) teaches the
 * Payee who the recipient was.
 */
export function LinkWalletPaymentDialog({
  open,
  onClose,
  payee,
  owed,
  candidates,
  systemNames,
  onLinked,
}: LinkWalletPaymentDialogProps) {
  const { t } = useTranslation();
  const owedTotal = owed.reduce((sum, m) => sum + m.assignment.taxOwed, 0);

  // A lone exact match for the whole balance is the obvious pick.
  // Only the first render's pick; later prop changes don't move the selection.
  const [initialPick] = useState(() => {
    const exact = exactAmountMatches(candidates, owedTotal);
    return exact.length === 1 ? exact[0] : null;
  });

  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPick?.key ?? null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => ticksFor(initialPick));
  const [valueText, setValueText] = useState('');
  const [valueParses, setValueParses] = useState(true);
  const [remember, setRemember] = useState(true);
  const { pending: saving, error: saveError, setError: setSaveError, run } = useLedgerAction();
  // Set once the entries are marked paid, so a retry after a later failure can't record it twice.
  const [recorded, setRecorded] = useState(false);

  function ticksFor(payment: MadePayment | null): ReadonlySet<string> {
    if (payment === null || payment.amount === null) {
      return new Set(owed.map((m) => m.assignment.id));
    }
    const pool = owed.map((m) => ({
      id: m.assignment.id,
      date: m.assignment.date,
      taxOwed: m.assignment.taxOwed,
    }));
    return new Set(allocateOldestFirst(pool, payment.amount).coveredIds);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return candidates;
    return candidates.filter((p) =>
      [p.label, p.counterpartyName, p.date, p.amount === null ? '' : String(Math.round(p.amount))]
        .filter((s): s is string => s !== undefined)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [candidates, search]);

  const selected = candidates.find((p) => p.key === selectedKey) ?? null;
  const included = owed.filter((m) => ticked.has(m.assignment.id));
  const includedTotal = included.reduce((sum, m) => sum + m.assignment.taxOwed, 0);

  /** The ISK that actually moved, or the pilot's figure for cargo handed over (blank = the ticked total). */
  const paymentAmount =
    selected === null
      ? null
      : (selected.amount ??
        (valueText.trim() === '' ? Math.round(includedTotal) : Number(valueText)));
  const amountValid =
    paymentAmount !== null &&
    Number.isFinite(paymentAmount) &&
    paymentAmount >= 0 &&
    (selected?.amount != null || valueParses);
  const difference = paymentAmount === null ? 0 : Math.round(paymentAmount - includedTotal);

  function pick(payment: MadePayment) {
    setSelectedKey(payment.key);
    setTicked(ticksFor(payment));
    setValueText('');
    setValueParses(true);
    setRemember(true);
  }

  function toggle(id: string) {
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const systemName = (solarSystemId: number) =>
    systemNames.get(solarSystemId) ?? `#${String(solarSystemId)}`;

  const counterpartyName =
    selected?.counterpartyId === undefined
      ? null
      : (selected.counterpartyName ?? `#${String(selected.counterpartyId)}`);

  async function commit() {
    if (!selected || included.length === 0 || !amountValid || paymentAmount === null) return;
    const link = [{ refId: selected.refId, source: 'manual' as const }];
    const result = await run(() =>
      settle(
        included.map((m) => m.assignment),
        {
          paidOn: paidOnFor(selected.date),
          method: selected.method,
          amount: Math.round(paymentAmount),
          ...(selected.kind === 'journal' ? { journalLinks: link } : { contractLinks: link }),
        }
      )
    );
    if (!result.ok) return;
    // `recorded` keeps the button disabled from here on, so the remember step
    // below can't be raced into recording the payment twice.
    setRecorded(true);
    onLinked();
    try {
      if (remember && selected.counterpartyId !== undefined) {
        await rememberPayeeEntity(payee, selected.counterpartyId);
      }
    } catch {
      // The payment is recorded; only learning who the Payee is paid failed.
      // Say so and keep the dialog open, rather than closing as if all went.
      setSaveError(t('miningTax.linkWallet.rememberFailed', { payee: payee.name }));
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.linkWallet.title')}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">
          {t('miningTax.linkWallet.subtitle', { payee: payee.name, count: owed.length })}
        </p>

        {candidates.length === 0 ? (
          <p className="rounded-xs border border-line bg-panel-2 px-3 py-4 text-xs text-text-dim">
            {t('miningTax.linkWallet.empty')}
          </p>
        ) : (
          <>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('miningTax.linkTransactionSearchPlaceholder')}
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
                {filtered.map((p) => {
                  const on = p.key === selectedKey;
                  return (
                    <li key={p.key}>
                      <label
                        className={cx(
                          'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
                          tappableRowClassName,
                          on && 'border-l border-accent'
                        )}
                      >
                        <Radio
                          name="link-wallet-payment"
                          className="mt-0.5"
                          checked={on}
                          onChange={() => pick(p)}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="tabular-nums">
                            {p.amount === null
                              ? t('miningTax.linkPaymentInKind')
                              : `${formatIsk(p.amount)} ISK`}
                            {' · '}
                            {p.date.slice(0, 10)}
                          </span>
                          <span className="truncate text-text-dim">
                            {p.label || t('miningTax.linkPaymentUntitledContract')}
                            {p.counterpartyName ? ` → ${p.counterpartyName}` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <div className="space-y-1">
          <p className={FIELD_LABEL}>{t('miningTax.linkWallet.coversLabel')}</p>
          <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
            {owed.map((m) => {
              const on = ticked.has(m.assignment.id);
              return (
                <li key={m.assignment.id}>
                  <label
                    className={cx(
                      'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs',
                      tappableRowClassName
                    )}
                  >
                    <Checkbox
                      checked={on}
                      onChange={() => toggle(m.assignment.id)}
                      aria-label={t('miningTax.linkPaymentIncludeLabel', {
                        date: m.assignment.date,
                      })}
                    />
                    <span className="w-20 shrink-0 tabular-nums">{m.assignment.date}</span>
                    <span className="min-w-0 flex-1 truncate text-text-dim">
                      {systemName(m.assignment.solarSystemId)}
                    </span>
                    <span className={cx('shrink-0 tabular-nums', !on && 'text-text-dim')}>
                      {formatIsk(m.assignment.taxOwed)} ISK
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {selected && selected.amount === null && (
          <div className="space-y-1">
            <p className={FIELD_LABEL}>{t('miningTax.linkPaymentAmountLabel')}</p>
            <IskInput
              value={valueText}
              onChange={setValueText}
              onParseableChange={setValueParses}
              defaultAmount={Math.round(includedTotal)}
              aria-label={t('miningTax.linkPaymentAmountLabel')}
              className="w-full"
            />
            <p className="text-[0.6875rem] text-text-dim">{t('miningTax.linkPaymentInKindHint')}</p>
          </div>
        )}

        {selected && (
          <div className="space-y-1 rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs">
            <dl className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-dim">{t('miningTax.linkWallet.tickedOwe')}</dt>
                <dd className="tabular-nums">{formatIsk(includedTotal)} ISK</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-dim">{t('miningTax.linkWallet.payment')}</dt>
                <dd className="tabular-nums">
                  {amountValid && paymentAmount !== null ? `${formatIsk(paymentAmount)} ISK` : '—'}
                </dd>
              </div>
            </dl>
            {amountValid && (
              <p
                role="status"
                className={cx(
                  'border-t border-line pt-1 font-semibold',
                  difference === 0
                    ? 'text-isk-pos'
                    : difference > 0
                      ? 'text-text-dim'
                      : 'text-isk-neg'
                )}
              >
                {difference === 0
                  ? t('miningTax.linkWallet.matches')
                  : difference > 0
                    ? t('miningTax.linkWallet.over', { amount: `${formatIsk(difference, 0)} ISK` })
                    : t('miningTax.linkWallet.short', {
                        amount: `${formatIsk(-difference, 0)} ISK`,
                      })}
              </p>
            )}
          </div>
        )}

        {selected && counterpartyName !== null && (
          <label
            className={cx('flex cursor-pointer items-center gap-2 text-xs', tappableRowClassName)}
          >
            <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="min-w-0">
              {t('miningTax.linkWallet.remember', { name: counterpartyName, payee: payee.name })}
            </span>
          </label>
        )}

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={!selected || included.length === 0 || !amountValid || saving || recorded}
            onClick={() => void commit()}
          >
            {t('miningTax.linkWallet.confirm', { count: included.length })}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
