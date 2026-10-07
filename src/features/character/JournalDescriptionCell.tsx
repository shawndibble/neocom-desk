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
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { Tooltip, TypeIcon } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { ItemInfoLink } from '@/features/entities';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { formatIsk } from '@/lib/isk';
import { BountyFactionSummary } from './BountyFactionSummary';
import { bountyKillsOf } from './bountyKills';
import { dailyGoalMessageIdOf, dailyGoalName } from './dailyGoal';
import { transactionTotal } from './walletTransactionsCsv';

interface JournalDescriptionCellProps {
  entry: WalletJournalEntry;
  transaction: WalletTransactionCommon | undefined;
  itemName: string;
  /** Where the Moon Mining Tax row this line paid is, when a pilot linked it there. Built by the route, so this feature never imports `miningTax`. */
  miningTaxHref?: string;
}

export function JournalDescriptionCell({
  entry,
  transaction,
  itemName,
  miningTaxHref,
}: JournalDescriptionCellProps) {
  const { t } = useTranslation();
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
  if (!transaction && !entry.reason && contractId === undefined && !miningTaxHref) {
    return <>{entry.description}</>;
  }
  const fill = transaction
    ? t(transaction.is_buy ? 'wallet.journalItemBought' : 'wallet.journalItemSold', {
        quantity: transaction.quantity.toLocaleString(),
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
        entry.reason && <span className="text-text-dim">{entry.reason}</span>
      )}
      {contractId !== undefined && (
        <Link
          to={`/contracts/history?${HIGHLIGHT_PARAM}=${contractId}`}
          className={inlineLinkClassName}
        >
          {t('wallet.journalContractLink')}
        </Link>
      )}
      {miningTaxHref && (
        <Link to={miningTaxHref} className={inlineLinkClassName}>
          {t('wallet.journalMiningTaxLink')}
        </Link>
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
              <span className="text-text-dim"> ×{transaction.quantity.toLocaleString()}</span>
            </span>
          </ItemInfoLink>
        </Tooltip>
      )}
    </div>
  );
}
