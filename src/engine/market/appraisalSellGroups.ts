/**
 * Splits an Appraisal's items by how to get rid of each one, so every item
 * lands in at most one copy list and the same stack is never pasted into two
 * in-game windows. Reuses the table's own verdicts rather than a second
 * opinion: `refineBeatsSellAsIs` for refine, `appraisalUndercut` for whether a
 * listing is worth making over selling into the buy order.
 *
 * - `refine`: refining beats selling the item as is.
 * - `list`: there is a legal undercut price and it beats the best buy order.
 * - `sellNow`: everything else a buyer will take — the undercut is no better
 *   than the buy order, or nobody is selling so there is nothing to undercut.
 *
 * An item with no buy order and no legal undercut has nowhere to go and is in
 * none of them. Each group keeps the pasted order.
 */
import {
  appraisalUndercut,
  refineBeatsSellAsIs,
  type Appraisal,
  type AppraisalItem,
} from './appraisal';

export interface AppraisalSellGroups {
  sellNow: AppraisalItem[];
  list: AppraisalItem[];
  refine: AppraisalItem[];
}

export function appraisalSellGroups(
  appraisal: Pick<Appraisal, 'rows' | 'items'>
): AppraisalSellGroups {
  const groups: AppraisalSellGroups = { sellNow: [], list: [], refine: [] };

  appraisal.items.forEach((item, index) => {
    const row = appraisal.rows[index];
    if (row !== undefined && refineBeatsSellAsIs(row)) {
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
