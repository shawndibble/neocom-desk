/**
 * The Appraisal's sell list as EVE's Import Prices text for the in-game Sell
 * Items window: one `name<TAB>price` line per item, at the same
 * one-tick-under-the-hub price `appraisalUndercut` already computes for List
 * Net (`appraisal.ts`).
 *
 * No quantity column — Import Prices matches by name only and sets the price
 * on whatever quantity the Sell Items window already has selected from the
 * hangar (a stack count, not the pasted total); a quantity column here broke
 * that match (issue report, 2026-09-24).
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
      return undercut === null ? null : `${item.name}\t${priceClipboardText(undercut.price)}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** The copy control gates on this rather than `items.length` — a pile priced entirely via LP or refine, with nobody selling, has rows to show but nothing to list. */
export function hasAppraisalSellList(items: readonly AppraisalItem[]): boolean {
  return items.some((item) => appraisalUndercut(item) !== null);
}
