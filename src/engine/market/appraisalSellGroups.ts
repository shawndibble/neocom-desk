/**
 * Splits an Appraisal's items by how to get rid of each one, so every item
 * lands in at most one copy list and the same stack is never pasted into two
 * in-game windows. Reuses the table's own verdicts rather than a second
 * opinion: the row's refine verdict (`rowFigures`) for refine, `appraisalUndercut` for whether a
 * listing is worth making over selling into the buy order, `appraisalRowTurnIn` for turning in.
 *
 * - `turnIn`: an Active Campaign Objective's Turn-in Reward beats selling the
 *   item now (and beats refining it, where refining wins over selling).
 * - `refine`: refining beats selling the item as is.
 * - `list`: there is a legal undercut price and it beats the best buy order.
 * - `sellNow`: everything else a buyer will take — the undercut is no better
 *   than the buy order, or nobody is selling so there is nothing to undercut.
 *
 * An item with no buy order and no legal undercut has nowhere to go and is in
 * none of them. Each group keeps the pasted order.
 *
 * A Turn-in Reward is never a price (scope decision 20261123-164921): it only
 * decides the group here, and never enters the Appraisal's Buy/Sell totals.
 */
import { rowFigures } from './appraisalRowFigures';
import {
  appraisalUndercut,
  type Appraisal,
  type AppraisalItem,
  type AppraisalRow,
  type RefineBasis,
} from './appraisal';
import { turnInReward, type TurnInOffer, type TurnInReward } from './turnIn';

export interface AppraisalSellGroups {
  sellNow: AppraisalItem[];
  list: AppraisalItem[];
  refine: AppraisalItem[];
  turnIn: AppraisalItem[];
}

/** The Active turn-in offers, and what the Character has already put into each objective. */
export interface AppraisalTurnInLookup<O extends TurnInOffer = TurnInOffer> {
  offerFor: (typeId: number) => O | null;
  /** The Character's own contribution, for the per-Character cap; null or absent when unknown. */
  contributedTo?: (objectiveId: string) => number | null;
}

/** One row turned in, against selling the same units now. */
export interface AppraisalRowTurnIn<O extends TurnInOffer = TurnInOffer> {
  offer: O;
  /** What the units the objective (and the Character's cap) still take pay. */
  reward: TurnInReward;
  /** What those same units fetch sold into the buy orders now; 0 with no buy order. */
  sellNow: number;
  /** `reward.total` − `sellNow`. */
  over: number;
  /**
   * Turning in wins: strictly more than Sell now (a tie is not a win), and more
   * than refining where refining already beats selling the item as is.
   */
  beats: boolean;
}

/**
 * The row's turn-in against Sell now, or null when its type has no Active
 * offer or the objective takes none of it. Sell now is compared for the units
 * that count (a capped pile is weighed against selling that many), at the
 * row's buy price and never past what the buy orders take.
 */
export function appraisalRowTurnIn<O extends TurnInOffer>(
  row: AppraisalRow,
  refineBasis: RefineBasis,
  lookup: AppraisalTurnInLookup<O>
): AppraisalRowTurnIn<O> | null {
  const offer = lookup.offerFor(row.typeId);
  if (offer === null) return null;
  const reward = turnInReward(offer, row.quantity, lookup.contributedTo?.(offer.objectiveId) ?? 0);
  if (reward.quantity === 0 || reward.total <= 0) return null;
  const sold = Math.min(reward.quantity, row.buyWalk?.filled ?? reward.quantity);
  const sellNow = row.buyEach === null ? 0 : row.buyEach * sold;
  const { verdict, withLeftover } = rowFigures(row, refineBasis, null).refine;
  const beatsRefine = verdict !== 'refine' || reward.total > (withLeftover ?? 0);
  return {
    offer,
    reward,
    sellNow,
    over: reward.total - sellNow,
    beats: reward.total > sellNow && beatsRefine,
  };
}

export function appraisalSellGroups(
  appraisal: Pick<Appraisal, 'rows' | 'items'>,
  refineBasis: RefineBasis,
  turnIn?: AppraisalTurnInLookup | null
): AppraisalSellGroups {
  const groups: AppraisalSellGroups = { sellNow: [], list: [], refine: [], turnIn: [] };

  appraisal.items.forEach((item, index) => {
    const row = appraisal.rows[index];
    if (row !== undefined && turnIn && appraisalRowTurnIn(row, refineBasis, turnIn)?.beats) {
      groups.turnIn.push(item);
      return;
    }
    if (row !== undefined && rowFigures(row, refineBasis, null).refine.verdict === 'refine') {
      groups.refine.push(item);
      return;
    }
    const undercut = appraisalUndercut(item);
    if (undercut !== null && !undercut.atOrBelowBuy) {
      groups.list.push(item);
    } else if (item.buy !== null) {
      groups.sellNow.push(item);
    }
  });

  return groups;
}
