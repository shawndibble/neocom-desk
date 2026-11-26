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

export interface AppraisalTurnInLookup<O extends TurnInOffer = TurnInOffer> {
  offerFor: (typeId: number) => O | null;
  contributedTo?: (objectiveId: string) => number | null;
}

export interface AppraisalRowTurnIn<O extends TurnInOffer = TurnInOffer> {
  offer: O;
  reward: TurnInReward;
  sellNow: number;
  over: number;
  beats: boolean;
}

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
