import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
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
 * The payment line on a paid entry (scope decision 20261004): what was paid,
 * when, and whether it found its wallet transfer by itself — a sentence
 * rather than a raw journal id with a red ✕ beside it, which read as "close
 * this". Link and Unlink live in the card's ⋯ menu.
 *
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
  const links = linkedTransactions ?? [];
  const autoLinked = links.length > 0 && links.every((tx) => tx.source === 'auto');
  const hasMenu = onLinkTransaction !== undefined || (onUnlinkTransaction && links.length > 0);
  return (
    <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.paymentCardTitle')}
          {autoLinked && (
            <span className="ml-1.5 font-normal tracking-normal normal-case">
              {t('miningTax.payment.autoLinked')}
            </span>
          )}
        </p>
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="plain"
                size="sm"
                icon={<Icon.More />}
                label={t('miningTax.payment.menuLabel')}
                disabled={busy}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onLinkTransaction && (
                <DropdownMenuItem onSelect={onLinkTransaction}>
                  {t('miningTax.linkTransactionAction')}
                </DropdownMenuItem>
              )}
              {onUnlinkTransaction &&
                links.map((tx) => (
                  <DropdownMenuItem
                    key={`${tx.kind}:${tx.refId}`}
                    onSelect={() => onUnlinkTransaction(tx)}
                  >
                    {links.length > 1
                      ? t('miningTax.payment.unlinkNamed', { id: tx.refId })
                      : t('miningTax.unlinkTransactionAction')}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {summary}
      {links.length > 0 ? (
        <ul className="space-y-0.5 text-xs">
          {links.map((tx) => (
            <li key={`${tx.kind}:${tx.refId}`} className="min-w-0 truncate">
              {tx.label === null ? (
                <span className="text-text-dim">
                  {t('miningTax.payment.notCached', { id: tx.refId })}
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-dim">{t('miningTax.noLinkedTransactions')}</p>
      )}
    </div>
  );
}
