/**
 * The wallet journal's Description cell: ESI's own description, plus three
 * optional extras — a dim `reason` line (issue #1721, e.g. a corp member's
 * "moon tax Aug" memo; on a bounty line, its kills summed per pirate
 * faction instead of ESI's raw `typeID: count` list), a link to the contract behind a contract-reward row,
 * a daily goal payout's goal by name in place of ESI's `-` and bare message id,
 * and — when the line is a market fill we have loaded — the item it bought
 * or sold, with its icon, linked to that item's Market listing.
 *
 * The item line's tooltip carries the fill itself (side, quantity × unit
 * price), which is what the journal amount alone can't say. Not `openOnTap`:
 * a tap on the link navigates, so touch-and-hold stays the way to read it
 * (see `Tooltip`).
 */
import { formatCount } from '@/lib/formatCount';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { Button, Tooltip, TypeIcon } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { ItemInfoLink } from '@/features/entities';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { formatIsk } from '@/lib/isk';
import { useInsuranceLossModalStore } from '@/stores/insuranceLossModal';
import { BountyFactionSummary } from './BountyFactionSummary';
import { bountyKillsOf } from './bountyKills';
import { dailyGoalMessageIdOf, dailyGoalName } from './dailyGoal';
import { transactionTotal } from './walletTransactionsCsv';

/** One Moon Mining Tax entry a linked payment settled, as the journal lists it. */
export interface MiningTaxEntryLink {
  href: string;
  date: string;
  taxOwed: number;
}

interface JournalDescriptionCellProps {
  entry: WalletJournalEntry;
  transaction: WalletTransactionCommon | undefined;
  itemName: string;
  /** The Moon Mining Tax entries this line paid, when a pilot linked it there: one link each. Built by the route, so this feature never imports `miningTax`. */
  miningTaxEntries?: readonly MiningTaxEntryLink[];
  /** The Character whose losses an insurance payout line can be matched against; absent where the line can't be (the corp journal). Opens the loss in a modal. */
  lossCharacterId?: number;
}

export function JournalDescriptionCell({
  entry,
  transaction,
  itemName,
  miningTaxEntries,
  lossCharacterId,
}: JournalDescriptionCellProps) {
  const { t } = useTranslation();
  const openLoss = useInsuranceLossModalStore((state) => state.open);
  const canViewLoss =
    lossCharacterId !== undefined && entry.ref_type === 'insurance' && (entry.amount ?? 0) > 0;
  const contractId = entry.context_id_type === 'contract_id' ? entry.context_id : undefined;
  // A bounty line's reason is its kill list as raw `typeID: count` pairs.
  const kills = useMemo(() => bountyKillsOf(entry), [entry]);
  const goalId = dailyGoalMessageIdOf(entry);
  if (goalId !== null) {
    const name = dailyGoalName(goalId, t);
    if (name) return <>{name}</>;
    // An unnamed goal keeps its id on hover, so it can be added to the map.
    return (
      <HintText content={t('wallet.dailyGoalIdTitle', { id: goalId })}>
        {t('wallet.dailyGoal')}
      </HintText>
    );
  }
  if (
    !transaction &&
    !entry.reason &&
    contractId === undefined &&
    !miningTaxEntries?.length &&
    !canViewLoss
  ) {
    return <>{entry.description}</>;
  }
  // One entry and a memo ("Moon tax 10-05 Ainsan"): the memo is the link. Otherwise each entry gets its own labelled link.
  const soleTaxEntry = miningTaxEntries?.length === 1 ? miningTaxEntries[0] : undefined;
  const reasonIsTaxLink = Boolean(soleTaxEntry && entry.reason && !kills);
  const fill = transaction
    ? t(transaction.is_buy ? 'wallet.journalItemBought' : 'wallet.journalItemSold', {
        quantity: formatCount(transaction.quantity),
        unitPrice: formatIsk(transaction.unit_price, 2),
        total: formatIsk(Math.abs(transactionTotal(transaction)), 2),
      })
    : null;
  return (
    <div className="flex flex-col gap-1">
      <span>{entry.description}</span>
      {kills ? (
        <BountyFactionSummary kills={kills} />
      ) : (
        entry.reason &&
        (reasonIsTaxLink && soleTaxEntry ? (
          <Link
            to={soleTaxEntry.href}
            className={`${inlineLinkClassName} w-fit`}
            aria-label={t('wallet.journalMiningTaxReasonLink', { reason: entry.reason })}
          >
            {entry.reason}
          </Link>
        ) : (
          <span className="text-text-dim">{entry.reason}</span>
        ))
      )}
      {contractId !== undefined && (
        <Link
          to={`/contracts/history?${HIGHLIGHT_PARAM}=${contractId}`}
          className={inlineLinkClassName}
        >
          {t('wallet.journalContractLink')}
        </Link>
      )}
      {!reasonIsTaxLink &&
        miningTaxEntries?.map((taxEntry) => (
          <Link key={taxEntry.href} to={taxEntry.href} className={`${inlineLinkClassName} w-fit`}>
            {t('wallet.journalMiningTaxEntryLink', {
              date: taxEntry.date,
              amount: formatIsk(taxEntry.taxOwed, 0),
            })}
          </Link>
        ))}
      {canViewLoss && (
        <Button
          size="sm"
          className="w-fit"
          onClick={() => openLoss({ payoutDate: entry.date, characterId: lossCharacterId })}
        >
          {t('wallet.journalInsuranceLossLink')}
        </Button>
      )}
      {transaction && fill && (
        <Tooltip content={fill}>
          <ItemInfoLink
            typeId={transaction.type_id}
            className="inline-flex w-fit items-center gap-1.5"
          >
            <TypeIcon typeId={transaction.type_id} size={32} className="h-4 w-4 shrink-0" />
            <span>
              {itemName}
              <span className="text-text-dim"> ×{formatCount(transaction.quantity)}</span>
            </span>
          </ItemInfoLink>
        </Tooltip>
      )}
    </div>
  );
}
