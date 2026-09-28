import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { MiningTaxPaymentLinkSource } from '@/db';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

/** One linked transaction, resolved for display — this card itself does no lookups. */
export interface LinkedTransaction {
  kind: 'journal' | 'contract';
  refId: number;
  source: MiningTaxPaymentLinkSource;
  /** A short line identifying the transaction (amount/date/label) — `null` when it's fallen out of the cached wallet journal/contracts (the retention gap `paymentLinks.ts` accepts). */
  label: string | null;
}

interface PaymentLinksCardProps {
  /**
   * Every linked transaction, resolved for display. Absent (rather than an
   * empty list) is not itself a reason to hide the card — that decision is
   * the caller's (`RowDetailModal` gates on its own Assignment's status,
   * `GroupSummaryModal` on every member being Paid), since a payment can
   * exist with nothing linked to it yet.
   */
  linkedTransactions?: readonly LinkedTransaction[];
  /** Opens the manual "Link transaction" picker (issue #540 follow-up). */
  onLinkTransaction?: () => void;
  onUnlinkTransaction?: (transaction: LinkedTransaction) => void;
  busy: boolean;
  /** A single Assignment's own amount/paidOn line — `RowDetailModal` passes one, `GroupSummaryModal` doesn't (no one payment record to summarize for the whole group). */
  summary?: ReactNode;
}

/**
 * The linked-transactions list plus its Link/Unlink actions — shared between
 * `RowDetailModal` (a single Assignment's payment) and `GroupSummaryModal` (a
 * joined group's combined payment), which otherwise differed only in whether
 * a single-record `summary` line applies. Neither modal decides *whether* to
 * render this card; that stays theirs, since each has its own gating rule
 * for when a payment exists to talk about.
 */
export function PaymentLinksCard({
  linkedTransactions,
  onLinkTransaction,
  onUnlinkTransaction,
  busy,
  summary,
}: PaymentLinksCardProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 rounded-xs border border-line bg-panel-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.paymentCardTitle')}
        </p>
        {summary}
      </div>
      {linkedTransactions && linkedTransactions.length > 0 ? (
        <ul className="divide-y divide-line text-xs">
          {linkedTransactions.map((tx) => (
            <li
              key={`${tx.kind}:${tx.refId}`}
              className="flex items-center justify-between gap-2 py-1 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 truncate">
                {tx.label === null ? (
                  <span className="text-text-dim">
                    {t('miningTax.transactionNoLongerCached', { id: tx.refId })}
                  </span>
                ) : (
                  <Link
                    to={
                      tx.kind === 'journal'
                        ? `/wallet/journal?${HIGHLIGHT_PARAM}=${tx.refId}`
                        : `/contracts?${HIGHLIGHT_PARAM}=${tx.refId}`
                    }
                    className={inlineLinkClassName}
                  >
                    {tx.label}
                  </Link>
                )}
                {tx.source === 'auto' && (
                  <span className="ml-1.5 text-[0.6875rem] text-text-dim">
                    {t('miningTax.transactionAutoMatchedBadge')}
                  </span>
                )}
              </span>
              {onUnlinkTransaction && (
                <IconButton
                  icon={<Icon.Close />}
                  label={t('miningTax.unlinkTransactionAction')}
                  size="sm"
                  tone="danger"
                  disabled={busy}
                  onClick={() => onUnlinkTransaction(tx)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-dim">{t('miningTax.noLinkedTransactions')}</p>
      )}
      {onLinkTransaction && (
        <Button size="sm" disabled={busy} onClick={onLinkTransaction}>
          {t('miningTax.linkTransactionAction')}
        </Button>
      )}
    </div>
  );
}
