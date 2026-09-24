/**
 * The Appraisal's sell list as EVE's Import Prices text for the in-game Sell
 * Items window: one `name<TAB>quantity<TAB>price` line per item, at the same
 * one-tick-under-the-hub price `appraisalUndercut` already computes for List
 * Net (`appraisal.ts`) — the `shoppingListText.ts` multibuy shape, plus the
 * price column Import Prices needs and multibuy must not carry.
 *
 * An item nobody is selling, or already sitting on the 0.01 ISK floor, has no
 * legal undercut price (`appraisalUndercut` returns null) and is left out —
 * there is nothing to type into that row's price field.
 */
import { appraisalUndercut, type AppraisalItem } from '@/engine/market/appraisal';
import { priceClipboardText } from './priceClipboardText';

export function appraisalSellListText(items: readonly AppraisalItem[]): string {
  return items
    .map((item) => {
      const undercut = appraisalUndercut(item);
      return undercut === null
        ? null
        : `${item.name}\t${item.quantity}\t${priceClipboardText(undercut.price)}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** The copy control gates on this rather than `items.length` — a pile priced entirely via LP or refine, with nobody selling, has rows to show but nothing to list. */
export function hasAppraisalSellList(items: readonly AppraisalItem[]): boolean {
  return items.some((item) => appraisalUndercut(item) !== null);
}
