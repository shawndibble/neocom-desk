import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { plainTextActionClassName } from '@/components/ui/plainTextActionClassName';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { PayeeBalance, UnassignedSummary } from './balances';
import type { ConflictSummary } from './corpBook/conflictSummary';
import { isCorpPayeeId } from './corpBook/corpRows';
import { DAY_MS } from '@/lib/age';
import { UnlinkedSentNote, type UnlinkedSent } from './UnlinkedSentNote';

/** Whole EVE days between the oldest unpaid day and today (UTC) — how long this Payee has been waiting. */
function owedForDays(balance: PayeeBalance, today: Date = new Date()): number {
  const oldest =
    balance.book?.oldest ??
    balance.account?.owes?.oldest ??
    balance.members.map((m) => m.assignment.date).sort()[0];
  if (!oldest) return 0;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((todayUtc - Date.parse(`${oldest}T00:00:00Z`)) / DAY_MS));
}

interface OwedBalancesProps {
  /** Every Payee balance; the owed ones and those in credit are drawn, as cards. */
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
  /** Opens the Payee's ledger (`PayeeLedgerPanel`): its owed or credit figure is the way in. */
  onOpenLedger?: (balance: PayeeBalance) => void;
  /**
   * A Corp Tax Book's balance credits itself from the corp's wallet journal, so there is no
   * payment of the member's own to link to it (#4065).
   */
  hideLinkPayment?: (balance: PayeeBalance) => boolean;
  /**
   * ISK the pilot donated to this Payee's Corp Tax Book that the book hasn't credited (#6204's
   * uncredited donations), with the Accounts the book reads. Above 0 the card says so on a line
   * of its own and Settle up drops to a plain button: paying the full amount again may pay twice.
   */
  uncreditedOf?: (
    balance: PayeeBalance
  ) => { amount: number; accounts: string; everyDivision?: boolean } | undefined;
  /**
   * ISK this Payee was already sent that nothing here accounts for yet (#540's suggestions,
   * attributed per Payee). Above 0 the card says so and Settle up drops to a plain button for
   * the same reason an uncredited donation does: the owed figure is overstated until the
   * payment is linked, so paying it in full pays twice.
   */
  unlinkedOf?: (balance: PayeeBalance) => UnlinkedSent | undefined;
  onAssignNext: () => void;
  onReviewPayments: () => void;
  /**
   * Corp Tax Book Conflicts still to fix. Not owed, so never in the total, but each turns into
   * a bill on its day: shown at every width so the next Late notice holds no surprise. The day is
   * not counted on a personal Payee's card either (it waits until the pilot resolves it), and a
   * book's own card, which reads the book's account, still bills it.
   */
  conflicts?: ConflictSummary | null;
  /** Opens the first Conflict to resolve. */
  onReviewConflicts?: () => void;
  /** One Conflict whose ore can come off the member's entry: "Let {corp} bill it", one click, with an Undo. */
  onFixConflicts?: () => void;
}

/**
 * The top of the Tax tab (scope decision 20261004, "owed first"): who the
 * pilot owes and how much, before any ledger row. A pilot rarely owes more
 * than three Payees, so each gets a compact card — the name on a line of its
 * own, because Payee names run long ("Bureau of Unified Harvesting") and
 * must never share a line with the figure that matters. A Payee in credit
 * keeps its card, figure in credit; a settled one isn't listed: Manage Payees
 * opens its ledger, and the Payee filter below reaches its entries.
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
  onOpenLedger,
  hideLinkPayment,
  uncreditedOf,
  unlinkedOf,
  onAssignNext,
  onReviewPayments,
  conflicts,
  onReviewConflicts,
  onFixConflicts,
}: OwedBalancesProps) {
  const { t } = useTranslation();
  const owed = balances.filter((b) => b.owed > 0);
  const owedTotal = owed.reduce((sum, b) => sum + b.owed, 0);
  // A Payee paid ahead keeps its card too: its credit is money the pilot has there.
  const cards = balances.filter((b) => b.owed > 0 || b.credit > 0);

  // One Payee card and nothing else to show: a single full-width row (name,
  // figure, actions) rather than one card stranded in half the page.
  const cardCount =
    cards.length + (unassigned.entryCount > 0 ? 1 : 0) + (unlinkedPaymentCount > 0 ? 1 : 0);
  const wide = cardCount === 1 && cards.length === 1;

  // No Payee card: the prompts are the page's next action, so they read as slim
  // full-width rows rather than tiles stranded in one column of a grid. With
  // cards present they stay tiles that share those cards' height — a
  // deliberate split (issue #3120).
  const slimPrompts = cards.length === 0;

  const nameButton = (balance: PayeeBalance) => (
    <button
      type="button"
      onClick={() => onFilterPayee(balance.payee.id)}
      aria-label={t('miningTax.filterToPayee', { payee: balance.payee.name })}
      aria-pressed={isSoleFilter(balance.payee.id)}
      className={cx(
        // -my-2 cancels min-h-9's height so the card doesn't grow: the 36px
        // is invisible hit area on a phone (issue #1055); md: reverts both.
        '-my-2 flex min-h-9 min-w-0 flex-1 items-center rounded-xs text-left text-base font-semibold hover:text-accent active:text-accent/75 aria-pressed:text-accent md:my-0 md:min-h-0',
        interactiveClassName,
        focusRingClassName
      )}
    >
      {/* Two lines before an ellipsis: "Bureau of Unified Harvesting" is a
          name the pilot reads, not a label to clip. */}
      <span
        className={cx(
          'flex min-w-0 flex-col items-start gap-1',
          // The button's -my-2 assumes a one-line name; the tag makes it taller.
          isCorpPayeeId(balance.payee.id) && 'max-md:py-2'
        )}
      >
        <span className="line-clamp-2 min-w-0 break-words">{balance.payee.name}</span>
        {/* A stored Payee can carry the corporation's name too: this one is the book. */}
        {isCorpPayeeId(balance.payee.id) && <Pill outlined>{t('miningTax.owed.corpBookTag')}</Pill>}
      </span>
    </button>
  );

  const amount = (value: number, tone?: string) => (
    <span className={cx('shrink-0 text-xl font-semibold tabular-nums', tone)}>
      {formatIsk(value, 0)}
      <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
    </span>
  );

  // The figure is the readout of the Payee's ledger, so it opens it (DESIGN §6c: a solid
  // underline on a Payee's balance figure). What is owed, or else the credit. The name keeps
  // the filter.
  const figure = (balance: PayeeBalance) =>
    balance.owed > 0 ? (
      amount(balance.owed, 'text-isk-neg')
    ) : (
      <span className="shrink-0 text-xl font-semibold text-isk-pos tabular-nums">
        {formatIsk(balance.credit, 0)}
        <span className="ml-1 text-xs font-normal text-text-dim">
          ISK {t('miningTax.owed.creditLabel')}
        </span>
      </span>
    );
  const owedFigure = (balance: PayeeBalance) =>
    onOpenLedger ? (
      <button
        type="button"
        onClick={() => onOpenLedger(balance)}
        aria-label={t('miningTax.ledger.openFor', { payee: balance.payee.name })}
        className={plainTextActionClassName('shrink-0')}
      >
        {figure(balance)}
      </button>
    ) : (
      figure(balance)
    );

  const promptRow = (
    key: string,
    title: ReactNode,
    value: ReactNode,
    hint: string,
    action: ReactNode
  ) => (
    <Panel key={key} padded={false} className="border-dashed">
      {/* Stacked on a phone: the text gets the full width and the action sits under it, instead of a
          long label squeezing the text into a one-word column. */}
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {title}
            {value}
          </div>
          <p className="text-xs text-text-dim">{hint}</p>
        </div>
        {action}
      </div>
    </Panel>
  );

  return (
    <section
      aria-label={t(owed.length === 0 ? 'miningTax.balancesNothing' : 'miningTax.balancesLabel')}
      className="space-y-2"
    >
      {/* One owed Payee: the single card already carries the name and the
          same amount, so the summary would only repeat it (issue #3065). */}
      {owed.length > 1 && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.6875rem] font-semibold text-text-dim">
            {t('miningTax.balancesLabel')}
          </span>
          <span className="text-base font-semibold text-isk-neg tabular-nums">
            {formatIsk(owedTotal)} ISK
          </span>
          <span className="text-xs text-text-dim">
            {t('miningTax.owed.acrossPayees', { count: owed.length })}
          </span>
        </p>
      )}

      {slimPrompts &&
        unlinkedPaymentCount > 0 &&
        promptRow(
          'unlinked',
          <span className="text-base font-semibold">
            {t('miningTax.unlinkedPaymentsCardTitle')}
          </span>,
          <span className={eyebrowClassName}>
            {t('miningTax.unlinkedPaymentsCount', { count: unlinkedPaymentCount })}
          </span>,
          t('miningTax.unlinkedPaymentsHint'),
          <Button className="shrink-0" onClick={onReviewPayments}>
            {t('miningTax.linkPaymentAction')}
          </Button>
        )}

      {slimPrompts &&
        unassigned.entryCount > 0 &&
        promptRow(
          'unassigned',
          <span className="text-base font-semibold text-warning">
            {t('miningTax.unassignedCardTitle')}
          </span>,
          // An unpriced day reads as "0 ISK", which looks like nothing to do.
          unassigned.estimatedValue > 0 && (
            <span className="text-sm font-semibold tabular-nums">
              {formatIsk(unassigned.estimatedValue, 0)}
              <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
            </span>
          ),
          t('miningTax.owed.unassignedHint', { count: unassigned.entryCount }),
          <Button className="shrink-0" onClick={onAssignNext}>
            {t('miningTax.assignNextAction')}
          </Button>
        )}
      {cardCount > 0 && !slimPrompts && (
        <div className={cx('grid grid-cols-1 gap-2', !wide && 'sm:grid-cols-2 xl:grid-cols-3')}>
          {/* Before the owed cards, not after them: a payment that is already sent but unlinked
              means every owed figure beside it is overstated, so this is the one card that has
              to be dealt with before Settle up can be trusted. */}
          {unlinkedPaymentCount > 0 && (
            <Panel padded={false} fill className="flex flex-col border-dashed">
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-base font-semibold">
                    {t('miningTax.unlinkedPaymentsCardTitle')}
                  </span>
                  <span className={cx(eyebrowClassName, 'shrink-0')}>
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
          {cards.map((balance) => {
            const days = owedForDays(balance);
            const inCredit = balance.owed <= 0;
            const characterName = characterNameOf?.(balance);
            const uncredited = uncreditedOf?.(balance);
            const warnUncredited = uncredited !== undefined && uncredited.amount > 0;
            const unlinked = unlinkedOf?.(balance);
            const warnUnlinked = unlinked !== undefined && unlinked.count > 0;
            // Both mean the same thing for the button: the owed figure is overstated, so paying
            // it in full pays twice. Settle up stays reachable — it is sometimes right — but it
            // stops being the card's loudest control.
            const warnBeforePaying = warnUncredited || warnUnlinked;
            const meta = inCredit ? (
              <p className="text-xs text-text-dim">
                {t('miningTax.owed.creditHint')}
                {characterName && ` · ${characterName}`}
              </p>
            ) : (
              <>
                <p className="text-xs text-text-dim">
                  {t('miningTax.owed.entriesFor', {
                    count: balance.book?.days ?? balance.members.length,
                  })}
                  {' · '}
                  {t('miningTax.owed.waitingDays', { count: days })}
                  {characterName && ` · ${characterName}`}
                </p>
                {warnUncredited && (
                  <p className="text-xs text-warning">
                    {uncredited.everyDivision
                      ? t('miningTax.owed.uncreditedEveryNote', {
                          amount: formatIsk(uncredited.amount, 0),
                        })
                      : t('miningTax.owed.uncreditedNote', {
                          amount: formatIsk(uncredited.amount, 0),
                          accounts: uncredited.accounts,
                        })}
                  </p>
                )}
                {warnUnlinked && <UnlinkedSentNote unlinked={unlinked} />}
              </>
            );
            // Nothing owed: nothing to settle; its ledger is its figure.
            const actions = inCredit ? null : (
              <div className="flex gap-1.5">
                <Button
                  variant={warnBeforePaying ? 'ghost' : 'primary'}
                  className={wide ? 'flex-1 sm:flex-none' : 'flex-1'}
                  onClick={() => onSettleUp(balance)}
                >
                  {t('miningTax.settleUpAction')}
                </Button>
                {!hideLinkPayment?.(balance) && (
                  <Button onClick={() => onLinkPayment(balance)}>
                    {t('miningTax.owed.linkPayment')}
                  </Button>
                )}
              </div>
            );
            return (
              <Panel key={balance.payee.id} padded={false} fill className="flex flex-col">
                {wide ? (
                  <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {nameButton(balance)}
                        <span className="sm:hidden">{owedFigure(balance)}</span>
                      </div>
                      {meta}
                    </div>
                    <span className="max-sm:hidden">{owedFigure(balance)}</span>
                    {actions}
                  </div>
                ) : (
                  // Cards in a row share its height; the meta line and buttons
                  // sit at the bottom, so they line up across cards whether a
                  // Payee's name takes one line or two.
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start gap-2">
                      {nameButton(balance)}
                      {owedFigure(balance)}
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
        </div>
      )}
      {/* After the owed cards: owed comes first (decision 20261004), and a Conflict is not owed
          yet. Always a full-width row, since it is a warning about what the book bills next, not a
          Payee balance to sit among the cards. */}
      {conflicts &&
        promptRow(
          'conflicts',
          <span
            className={cx(
              'text-base font-semibold',
              // Every day already answered: the member cannot move any of them, so this states
              // a deadline rather than asking for work. It is never hidden — the 14-day clock
              // runs whether or not a dispute is open.
              conflicts.waiting === conflicts.days ? 'text-text' : 'text-warning'
            )}
          >
            {t(
              conflicts.waiting === conflicts.days
                ? 'miningTax.conflictsWaitingTitle'
                : 'miningTax.conflictsTitle'
            )}
          </span>,
          <span className="text-sm font-semibold tabular-nums">
            {formatIsk(conflicts.amount, 0)}
            <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
          </span>,
          conflicts.waiting === conflicts.days
            ? t('miningTax.conflictsWaitingHint', {
                count: conflicts.days,
                corp: conflicts.firstCorpName,
                date: conflicts.firstResolvesOn,
              })
            : t('miningTax.conflictsHint', {
                count: conflicts.days,
                corp: conflicts.firstCorpName,
              }),
          (onFixConflicts || onReviewConflicts) && (
            <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
              {onFixConflicts && (
                <Button variant="primary" wrap className="sm:shrink-0" onClick={onFixConflicts}>
                  {t('miningTax.conflictsFix', { corp: conflicts.firstCorpName })}
                </Button>
              )}
              {onReviewConflicts && (
                <Button wrap className="sm:shrink-0" onClick={onReviewConflicts}>
                  {t('miningTax.conflictsReview')}
                </Button>
              )}
            </div>
          )
        )}
    </section>
  );
}
