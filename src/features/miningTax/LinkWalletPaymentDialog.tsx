import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IskInput, Modal, Radio, SearchInput } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import type { PayeeRecord } from '@/db';
import type { PayeeAccount } from '@/engine/miningTax/payeeAccount';
import { GrantNote } from '@/app/GrantNote';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { linkPayment } from './ledgerActions';
import { rememberPayeeEntity } from './payees';
import { missingPaymentEndpoints, type MadePaymentSources } from './madePayments';
import { linkFor, type MadePayment } from './paymentLinks';
import { amountsMatch } from './paymentMatches';
import { PaymentPreview } from './SettleUpDialog';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';

interface LinkWalletPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** The Payee the payment is linked to: a merged Payee's primary record. */
  payee: PayeeRecord;
  /** Its Running account, to say what the payment pays; absent while nothing bills it. */
  account?: PayeeAccount;
  /** Made Payments no link holds and no Corp Tax Book counts. */
  candidates: readonly MadePayment[];
  /** The Characters whose payments are offered, for a missing Permission's Grant note. */
  characters: readonly { characterId: number; characterName: string }[];
  /** How each tracked Character's payment reads went; a skipped one gets a Grant note. */
  paymentSources?: readonly MadePaymentSources[];
  onLinked: () => void;
}

const FIELD_LABEL = eyebrowClassName;

/**
 * "Link a wallet payment": the pilot picks, from their own wallet, the Made Payment they sent
 * this Payee. It is linked to the Payee and pays its oldest unpaid days, whatever entries the
 * pilot had in mind, so nothing is ticked: the dialog says what it pays, off the Payee's account,
 * and what is over is credit. A payment in kind asks what its cargo was worth. A payment the
 * pilot picks is always their own link (`manual`), whether or not it was offered first.
 * Confirming also teaches the Payee who the recipient was, unless unticked.
 */
export function LinkWalletPaymentDialog({
  open,
  onClose,
  payee,
  account,
  candidates,
  characters,
  paymentSources = [],
  onLinked,
}: LinkWalletPaymentDialogProps) {
  const { t } = useTranslation();
  const owed = account?.owes?.amount ?? 0;

  const grantGaps = characters
    .map((c) => {
      const sources = paymentSources.find((s) => s.characterId === c.characterId);
      return { ...c, endpoints: sources ? missingPaymentEndpoints(sources) : [] };
    })
    .filter((gap) => gap.endpoints.length > 0);

  // A lone payment of exactly what is owed is the obvious pick; only on the first render.
  const [initialPick] = useState(() => {
    const exact = candidates.filter(
      (p) => p.amount !== null && owed > 0 && amountsMatch(owed, p.amount)
    );
    return exact.length === 1 ? exact[0]!.key : null;
  });
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPick);
  const [valueText, setValueText] = useState('');
  const [valueParses, setValueParses] = useState(true);
  const [remember, setRemember] = useState(true);
  const { pending: saving, error: saveError, setError: setSaveError, run } = useLedgerAction();
  // Set once the link is saved, so a retry after a later failure can't save it twice.
  const [linked, setLinked] = useState(false);

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
    selected && amountValid && account ? account.preview(amount, selected.date.slice(0, 10)) : null;

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
    if (!selected || !amountValid || amount === null) return;
    const result = await run(() =>
      linkPayment(linkFor(selected, payee.id, 'manual', Math.round(amount)), selected.characterId)
    );
    if (!result.ok) return;
    setLinked(true);
    try {
      if (remember && selected.counterpartyId !== undefined)
        await rememberPayeeEntity(payee, selected.counterpartyId);
    } catch {
      // The payment is linked; only learning who the Payee is failed. Say so and stay open.
      onLinked();
      setSaveError(t('miningTax.linkWallet.rememberFailed', { payee: payee.name }));
      return;
    }
    onLinked();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.linkWallet.title')}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">
          {t('miningTax.linkWallet.subtitle', {
            payee: payee.name,
            amount: formatIsk(owed, 0),
          })}
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

        {candidates.length === 0 ? (
          <p className="rounded-xs border border-line bg-panel-2 px-3 py-4 text-xs text-text-dim">
            {t('miningTax.linkWallet.empty')}
          </p>
        ) : (
          <>
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
                {filtered.map((p) => {
                  const on = p.key === selectedKey;
                  return (
                    <li key={p.key}>
                      <label
                        className={cx(
                          'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs',
                          tappableRowClassName,
                          on && selectedRowClassName
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

        {selected && selected.amount === null && (
          <div className="space-y-1">
            <p className={FIELD_LABEL}>{t('miningTax.linkPaymentAmountLabel')}</p>
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
            disabled={!selected || !amountValid || saving || linked}
            onClick={() => void commit()}
          >
            {t('miningTax.linkWallet.confirm')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
