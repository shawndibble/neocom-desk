import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
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
  /** Every Payee balance; only the owed ones are drawn, as cards. */
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
 * aren't listed: the Payee filter below already reaches their entries.
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
  const owedTotal = owed.reduce((sum, b) => sum + b.owed, 0);

  // One owed Payee and nothing else to show: a single full-width row (name,
  // figure, actions) rather than one card stranded in half the page.
  const cardCount =
    owed.length + (unassigned.entryCount > 0 ? 1 : 0) + (unlinkedPaymentCount > 0 ? 1 : 0);
  const wide = cardCount === 1 && owed.length === 1;

  const nameButton = (balance: PayeeBalance) => (
    <button
      type="button"
      onClick={() => onFilterPayee(balance.payee.id)}
      aria-label={t('miningTax.filterToPayee', { payee: balance.payee.name })}
      aria-pressed={isSoleFilter(balance.payee.id)}
      className={cx(
        // -my-3 cancels min-h-11's height so the card doesn't grow: the 44px
        // is invisible hit area on a phone (issue #1055); md: reverts both.
        '-my-3 flex min-h-11 min-w-0 flex-1 items-center rounded-xs text-left text-base font-semibold hover:text-accent active:text-accent/75 aria-pressed:text-accent md:my-0 md:min-h-0',
        interactiveClassName,
        focusRingClassName
      )}
    >
      {/* Two lines before an ellipsis: "Bureau of Unified Harvesting" is a
          name the pilot reads, not a label to clip. */}
      <span className="line-clamp-2 min-w-0 break-words">{balance.payee.name}</span>
    </button>
  );

  const amount = (value: number, tone?: string) => (
    <span className={cx('shrink-0 text-xl font-semibold tabular-nums', tone)}>
      {formatIsk(value, 0)}
      <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
    </span>
  );

  return (
    <section aria-label={t('miningTax.balancesLabel')} className="space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.balancesLabel')}
        </span>
        {owed.length > 0 ? (
          <>
            <span className="text-base font-semibold text-isk-neg tabular-nums">
              {formatIsk(owedTotal)} ISK
            </span>
            <span className="text-xs text-text-dim">
              {t('miningTax.owed.acrossPayees', { count: owed.length })}
            </span>
          </>
        ) : (
          <span className="text-xs text-text-dim">{t('miningTax.balancesNothing')}</span>
        )}
      </p>

      {cardCount > 0 && (
        <div className={cx('grid grid-cols-1 gap-2', !wide && 'sm:grid-cols-2 xl:grid-cols-3')}>
          {owed.map((balance) => {
            const days = owedForDays(balance);
            const characterName = characterNameOf?.(balance);
            const meta = (
              <p className="text-xs text-text-dim">
                {t('miningTax.owed.entriesFor', { count: balance.members.length })}
                {' · '}
                {t('miningTax.owed.waitingDays', { count: days })}
                {characterName && ` · ${characterName}`}
              </p>
            );
            const actions = (
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  className={wide ? 'flex-1 sm:flex-none' : 'flex-1'}
                  onClick={() => onSettleUp(balance)}
                >
                  {t('miningTax.settleUpAction')}
                </Button>
                <Button onClick={() => onLinkPayment(balance)}>
                  {t('miningTax.owed.linkPayment')}
                </Button>
              </div>
            );
            return (
              <Panel key={balance.payee.id} padded={false} fill className="flex flex-col">
                {wide ? (
                  <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {nameButton(balance)}
                        <span className="sm:hidden">{amount(balance.owed, 'text-isk-neg')}</span>
                      </div>
                      {meta}
                    </div>
                    <span className="max-sm:hidden">{amount(balance.owed, 'text-isk-neg')}</span>
                    {actions}
                  </div>
                ) : (
                  // Cards in a row share its height; the meta line and buttons
                  // sit at the bottom, so they line up across cards whether a
                  // Payee's name takes one line or two.
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start gap-2">
                      {nameButton(balance)}
                      {amount(balance.owed, 'text-isk-neg')}
                    </div>
                    <div className="mt-auto space-y-2">
                      {meta}
                      {actions}
                    </div>
                  </div>
                )}
              </Panel>
            );
          })}
          {unassigned.entryCount > 0 && (
            <Panel padded={false} fill className="flex flex-col border-dashed">
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-base font-semibold text-warning">
                    {t('miningTax.unassignedCardTitle')}
                  </span>
                  {/* An unpriced day reads as "0 ISK", which looks like nothing to do. */}
                  {unassigned.estimatedValue > 0 && amount(unassigned.estimatedValue)}
                </div>
                <div className="mt-auto space-y-2">
                  <p className="text-xs text-text-dim">
                    {t('miningTax.owed.unassignedHint', { count: unassigned.entryCount })}
                  </p>
                  <Button className="w-full" onClick={onAssignNext}>
                    {t('miningTax.assignNextAction')}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
          {unlinkedPaymentCount > 0 && (
            <Panel padded={false} fill className="flex flex-col border-dashed">
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-base font-semibold">
                    {t('miningTax.unlinkedPaymentsCardTitle')}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.unlinkedPaymentsCount', { count: unlinkedPaymentCount })}
                  </span>
                </div>
                <div className="mt-auto space-y-2">
                  <p className="text-xs text-text-dim">{t('miningTax.unlinkedPaymentsHint')}</p>
                  <Button className="w-full" onClick={onReviewPayments}>
                    {t('miningTax.linkPaymentAction')}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
    </section>
  );
}
