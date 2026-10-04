import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { PayeeBalance, UnassignedSummary } from './balances';

/** Whole EVE days between the oldest owed entry and today (UTC) — how long this Payee has been waiting. */
function owedForDays(balance: PayeeBalance, today: Date = new Date()): number {
  const oldest = balance.members.map((m) => m.assignment.date).sort()[0];
  if (!oldest) return 0;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((todayUtc - Date.parse(`${oldest}T00:00:00Z`)) / 86_400_000));
}

interface OwedBalancesProps {
  /** Every Payee balance; the owed ones are drawn as cards, the settled ones as one line of names. */
  balances: readonly PayeeBalance[];
  unassigned: UnassignedSummary;
  /** Wallet payments nothing here accounts for yet (paying backwards, #540). */
  unlinkedPaymentCount: number;
  /** Each card's owning character, shown only when more than one is tracked. */
  characterNameOf?: (balance: PayeeBalance) => string | undefined;
  isSoleFilter: (payeeId: string) => boolean;
  onFilterPayee: (payeeId: string) => void;
  onSettleUp: (balance: PayeeBalance) => void;
  onLinkPayment: (balance: PayeeBalance) => void;
  onAssignNext: () => void;
  onReviewPayments: () => void;
}

/**
 * The top of the Tax tab (scope decision 20261004, "owed first"): who the
 * pilot owes and how much, before any ledger row. A pilot rarely owes more
 * than three Payees, so each gets a compact card — the name on a line of its
 * own, because Payee names run long ("Bureau of Unified Harvesting") and
 * must never share a line with the figure that matters. Settled Payees
 * collapse to one line of names, each still a shortcut to that Payee's
 * entries.
 */
export function OwedBalances({
  balances,
  unassigned,
  unlinkedPaymentCount,
  characterNameOf,
  isSoleFilter,
  onFilterPayee,
  onSettleUp,
  onLinkPayment,
  onAssignNext,
  onReviewPayments,
}: OwedBalancesProps) {
  const { t } = useTranslation();
  const owed = balances.filter((b) => b.owed > 0);
  const settled = balances.filter((b) => b.owed <= 0);
  const owedTotal = owed.reduce((sum, b) => sum + b.owed, 0);

  const nameButton = (balance: PayeeBalance, className?: string) => (
    <button
      type="button"
      onClick={() => onFilterPayee(balance.payee.id)}
      aria-label={t('miningTax.filterToPayee', { payee: balance.payee.name })}
      aria-pressed={isSoleFilter(balance.payee.id)}
      className={cx(
        // -my-3 cancels min-h-11's height so the card doesn't grow: the 44px
        // is invisible hit area on a phone (issue #1055); md: reverts both.
        '-my-3 flex min-h-11 min-w-0 items-center text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-accent aria-pressed:text-accent md:my-0 md:min-h-0',
        className
      )}
    >
      <span className="min-w-0 truncate">{balance.payee.name}</span>
    </button>
  );

  return (
    <section aria-label={t('miningTax.balancesLabel')} className="space-y-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        <span>
          {t('miningTax.balancesLabel')} ·{' '}
          {owed.length > 0
            ? t('miningTax.balancesAcross', { amount: formatIsk(owedTotal), count: owed.length })
            : t('miningTax.balancesNothing')}
        </span>
      </p>

      {(owed.length > 0 || unassigned.entryCount > 0 || unlinkedPaymentCount > 0) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {owed.map((balance) => {
            const days = owedForDays(balance);
            const characterName = characterNameOf?.(balance);
            return (
              <Panel key={balance.payee.id} padded={false}>
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-center gap-2">
                    {nameButton(balance, 'flex-1 text-sm font-semibold')}
                    <span className="shrink-0 text-lg font-semibold text-isk-neg tabular-nums">
                      {formatIsk(balance.owed, 0)}
                      <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">ISK</span>
                    </span>
                  </div>
                  <p className="truncate text-[0.6875rem] text-text-dim">
                    {t('miningTax.owed.entriesFor', { count: balance.members.length })}
                    {' · '}
                    {t('miningTax.owed.waitingDays', { count: days })}
                    {characterName && ` · ${characterName}`}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      onClick={() => onSettleUp(balance)}
                    >
                      {t('miningTax.settleUpAction')}
                    </Button>
                    <Button size="sm" onClick={() => onLinkPayment(balance)}>
                      {t('miningTax.owed.linkPayment')}
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
          {unassigned.entryCount > 0 && (
            <Panel padded={false} className="border-dashed">
              <div className="space-y-1.5 p-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 text-sm font-semibold text-warning">
                    {t('miningTax.unassignedCardTitle')}
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatIsk(unassigned.estimatedValue, 0)}
                    <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">ISK</span>
                  </span>
                </div>
                <p className="text-[0.6875rem] text-text-dim">
                  {t('miningTax.owed.unassignedHint', { count: unassigned.entryCount })}
                </p>
                <Button size="sm" className="w-full" onClick={onAssignNext}>
                  {t('miningTax.assignNextAction')}
                </Button>
              </div>
            </Panel>
          )}
          {unlinkedPaymentCount > 0 && (
            <Panel padded={false} className="border-dashed">
              <div className="space-y-1.5 p-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 text-sm font-semibold">
                    {t('miningTax.unlinkedPaymentsCardTitle')}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.unlinkedPaymentsCount', { count: unlinkedPaymentCount })}
                  </span>
                </div>
                <p className="text-[0.6875rem] text-text-dim">
                  {t('miningTax.unlinkedPaymentsHint')}
                </p>
                <Button size="sm" className="w-full" onClick={onReviewPayments}>
                  {t('miningTax.linkPaymentAction')}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      )}

      {settled.length > 0 && (
        <p className="text-[0.6875rem] text-text-dim">
          <span className="font-semibold tracking-widest uppercase">
            {t('miningTax.owed.settledLabel')}
          </span>{' '}
          {settled.map((balance, i) => (
            <span key={balance.payee.id}>
              {i > 0 && ' · '}
              <button
                type="button"
                onClick={() => onFilterPayee(balance.payee.id)}
                aria-pressed={isSoleFilter(balance.payee.id)}
                aria-label={t('miningTax.filterToPayee', { payee: balance.payee.name })}
                className={cx(inlineLinkClassName, 'text-text-dim aria-pressed:text-accent')}
              >
                {balance.payee.name}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
