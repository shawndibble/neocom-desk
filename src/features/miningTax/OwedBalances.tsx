import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Panel,
  RowActionsMenu,
  RowMoreActions,
  MenuItem,
  useOpenAfterMenu,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { PayeeBalance, UnassignedSummary } from './balances';
import type { ConflictSummary } from './corpBook/conflictSummary';
import { isCorpPayeeId } from './corpBook/corpRows';
import { DAY_MS } from '@/lib/age';
import { UnlinkedSentNote, type UnlinkedSent } from './UnlinkedSentNote';

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
  balances: readonly PayeeBalance[];
  unassigned: UnassignedSummary;
  unlinkedPaymentCount: number;
  characterNameOf?: (balance: PayeeBalance) => string | undefined;
  onSettleUp: (balance: PayeeBalance) => void;
  onLinkPayment: (balance: PayeeBalance) => void;
  onOpenLedger?: (balance: PayeeBalance) => void;
  hideLinkPayment?: (balance: PayeeBalance) => boolean;
  uncreditedOf?: (
    balance: PayeeBalance
  ) => { amount: number; accounts: string; everyDivision?: boolean } | undefined;
  unlinkedOf?: (balance: PayeeBalance) => UnlinkedSent | undefined;
  onAssignNext: () => void;
  onReviewPayments: () => void;
  conflicts?: ConflictSummary | null;
  onReviewConflicts?: () => void;
  onFixConflicts?: () => void;
}

export function OwedBalances({
  balances,
  unassigned,
  unlinkedPaymentCount,
  characterNameOf,
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
  const credits = balances.filter((b) => b.owed <= 0 && b.credit > 0);

  const cardCount =
    owed.length + (unassigned.entryCount > 0 ? 1 : 0) + (unlinkedPaymentCount > 0 ? 1 : 0);
  const wide = cardCount === 1 && owed.length === 1;

  const slimPrompts = owed.length === 0;

  const nameOf = (balance: PayeeBalance) => (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-base font-semibold">
      <span className="line-clamp-2 min-w-0 break-words">{balance.payee.name}</span>
      {isCorpPayeeId(balance.payee.id) && <Pill outlined>{t('miningTax.owed.corpBookTag')}</Pill>}
    </span>
  );

  const amount = (value: number, tone?: string) => (
    <span className={cx('shrink-0 text-xl font-semibold tabular-nums', tone)}>
      {value < 0 ? `−${formatIsk(-value, 0)}` : formatIsk(value, 0)}
      <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
    </span>
  );

  const owedFigure = (balance: PayeeBalance) => amount(-balance.owed, 'text-isk-neg');

  const promptRow = (
    key: string,
    title: ReactNode,
    value: ReactNode,
    hint: string,
    action: ReactNode
  ) => (
    <Panel key={key} padded={false} className="border-dashed">
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
      {owed.length > 1 && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.6875rem] font-semibold text-text-dim">
            {t('miningTax.balancesLabel')}
          </span>
          <span className="text-base font-semibold text-isk-neg tabular-nums">
            −{formatIsk(owedTotal)} ISK
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
          {owed.map((balance) => {
            const days = owedForDays(balance);
            const characterName = characterNameOf?.(balance);
            const uncredited = uncreditedOf?.(balance);
            const warnUncredited = uncredited !== undefined && uncredited.amount > 0;
            const unlinked = unlinkedOf?.(balance);
            const warnUnlinked = unlinked !== undefined && unlinked.count > 0;
            const warnBeforePaying = warnUncredited || warnUnlinked;
            const meta = (
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
            const actions = (
              <PayeeActions
                balance={balance}
                wide={wide}
                warnBeforePaying={warnBeforePaying}
                onSettleUp={onSettleUp}
                onLinkPayment={hideLinkPayment?.(balance) ? undefined : onLinkPayment}
                onOpenLedger={onOpenLedger}
              />
            );
            return (
              <Panel key={balance.payee.id} padded={false} fill className="flex flex-col">
                {wide ? (
                  <div
                    role="group"
                    aria-label={balance.payee.name}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start gap-2">
                        {nameOf(balance)}
                        <span className="sm:hidden">{owedFigure(balance)}</span>
                      </div>
                      {meta}
                    </div>
                    <span className="max-sm:hidden">{owedFigure(balance)}</span>
                    {actions}
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label={balance.payee.name}
                    className="flex flex-1 flex-col gap-2 p-3"
                  >
                    <div className="flex items-start gap-2">
                      {nameOf(balance)}
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
      {credits.map((balance) => (
        <p
          key={balance.payee.id}
          className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-dim"
        >
          <span className="font-semibold text-text">{balance.payee.name}</span>
          <span className="text-isk-pos tabular-nums">{formatIsk(balance.credit, 0)} ISK</span>
          <span>
            {t('miningTax.owed.creditHint')}
            {characterNameOf?.(balance) && ` · ${characterNameOf(balance)}`}
          </span>
          {onOpenLedger && (
            <button
              type="button"
              className={textActionClassName('inline-flex')}
              onClick={() => onOpenLedger(balance)}
              aria-label={t('miningTax.ledger.openFor', { payee: balance.payee.name })}
            >
              {t('miningTax.owed.ledgerAction')}
            </button>
          )}
        </p>
      ))}
      {conflicts &&
        promptRow(
          'conflicts',
          <span
            className={cx(
              'text-base font-semibold',
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

function PayeeActions({
  balance,
  wide,
  warnBeforePaying,
  onSettleUp,
  onLinkPayment,
  onOpenLedger,
}: {
  balance: PayeeBalance;
  wide: boolean;
  warnBeforePaying: boolean;
  onSettleUp: (balance: PayeeBalance) => void;
  onLinkPayment?: ((balance: PayeeBalance) => void) | undefined;
  onOpenLedger?: ((balance: PayeeBalance) => void) | undefined;
}) {
  const { t } = useTranslation();
  const openAfterMenu = useOpenAfterMenu();
  const textAction = (label: string, run: () => void, ariaLabel?: string) => (
    <button
      type="button"
      aria-label={ariaLabel}
      className={textActionClassName('px-3 first:pl-0 last:pr-0')}
      onClick={run}
    >
      {label}
    </button>
  );
  const both = onOpenLedger !== undefined && onLinkPayment !== undefined;
  const row = (
    <div className="flex items-center gap-3">
      <Button
        variant={warnBeforePaying ? 'ghost' : 'primary'}
        className={wide ? 'flex-1 sm:flex-none' : 'flex-1'}
        onClick={() => onSettleUp(balance)}
      >
        {t('miningTax.settleUpAction')}
      </Button>
      <div
        className={cx(
          'shrink-0 items-center divide-x divide-line',
          both ? 'hidden sm:flex' : 'flex'
        )}
      >
        {onOpenLedger &&
          textAction(
            t('miningTax.owed.ledgerAction'),
            () => onOpenLedger(balance),
            t('miningTax.ledger.openFor', { payee: balance.payee.name })
          )}
        {onLinkPayment && textAction(t('miningTax.owed.linkPayment'), () => onLinkPayment(balance))}
      </div>
      {both && (
        <RowMoreActions
          className="sm:hidden"
          variant="ghost"
          label={t('miningTax.owed.moreActions', { payee: balance.payee.name })}
          hints={false}
        />
      )}
    </div>
  );
  if (!both) return row;
  return (
    <RowActionsMenu
      name={balance.payee.name}
      onCloseAutoFocus={openAfterMenu.onCloseAutoFocus}
      items={
        <>
          <MenuItem onSelect={() => openAfterMenu.run(() => onOpenLedger(balance))}>
            {t('miningTax.owed.ledgerAction')}
          </MenuItem>
          <MenuItem onSelect={() => openAfterMenu.run(() => onLinkPayment(balance))}>
            {t('miningTax.owed.linkPayment')}
          </MenuItem>
        </>
      }
    >
      {row}
    </RowActionsMenu>
  );
}
