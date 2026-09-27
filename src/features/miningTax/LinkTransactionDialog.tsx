import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Radio, TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { exactAmountMatches, type MadePayment } from './paymentLinks';

interface LinkTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Unlinked wallet-journal donations and payment-in-kind contracts for this Assignment's character. */
  candidates: readonly MadePayment[];
  /** The payment's own recorded amount — what an exact-match suggestion is measured against. */
  targetAmount: number;
  busy: boolean;
  onConfirm: (payment: MadePayment, source: 'auto' | 'manual') => void;
}

/**
 * The manual "Link transaction" picker (issue #540 follow-up: "paying
 * backwards" for a row already marked Paid before ESI had posted the real
 * transaction). Unlike `LinkPaymentDialog`, this never changes `status` or
 * `taxOwed` — it only attaches a reference, so there is no itemized coverage
 * list here, just the transaction itself.
 *
 * A candidate whose ISK figure matches the target *exactly* is pre-selected
 * and flagged "Suggested" — stricter than `suggestLink`'s fuzzy, tiered
 * confidence, since a row the pilot already marked paid needs no "maybe".
 * The pilot still confirms explicitly; nothing here is applied silently.
 */
export function LinkTransactionDialog({
  open,
  onClose,
  candidates,
  targetAmount,
  busy,
  onConfirm,
}: LinkTransactionDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const suggested = useMemo(
    () => exactAmountMatches(candidates, targetAmount),
    [candidates, targetAmount]
  );
  const suggestedKey = suggested.length === 1 ? suggested[0].key : null;

  const [selectedKey, setSelectedKey] = useState<string | null>(suggestedKey);

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

  function confirm() {
    if (!selected) return;
    onConfirm(selected, selected.key === suggestedKey ? 'auto' : 'manual');
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.linkTransactionTitle')}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.linkTransactionHint')}</p>

        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('miningTax.linkTransactionSearchPlaceholder')}
          aria-label={t('miningTax.linkTransactionSearchPlaceholder')}
          className="w-full"
        />

        {filtered.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.linkTransactionEmpty')}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2">
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
                      name="link-transaction"
                      className="mt-0.5"
                      checked={on}
                      onChange={() => setSelectedKey(p.key)}
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
                      {p.key === suggestedKey && (
                        <span className="text-[0.6875rem] text-accent">
                          {t('miningTax.linkTransactionSuggestedBadge')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" size="sm" disabled={!selected || busy} onClick={confirm}>
            {t('miningTax.linkTransactionConfirmAction')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
