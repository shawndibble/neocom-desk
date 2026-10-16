/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub (#3878); the slice that implements this file removes it */
/**
 * One Hauling row's detail, shown in the trip rail (desktop) or a full-height
 * sheet (phone) when the row is selected (issue #3878). Replaces the inline
 * `HaulingRowDetail`. Leads with what a hauler checks — the most to pay, the
 * destination's sell orders with the user's own listing among them, Days to
 * Sell — and folds the price derivation and fee math behind "Show the math".
 * Its header carries the item's `ItemMoreActions` ⋮, the home of every
 * action the row's ⋮ and right-click menu used to hold.
 *
 * CONTRACT STUB — implemented in slice S2.
 */
import type { TripLine } from '@/engine/market/haulingPlan';
import type { HaulingViewRow } from './haulingView';

export interface HaulingItemDetailProps {
  row: HaulingViewRow;
  /** The row's Trip Plan line, when it has one: what the plan brings of it. */
  line?: TripLine;
  /** What capped the line ("22 m³ · your share of a week's sales"), from the panel. */
  loadNote?: string;
}

export function HaulingItemDetail(_props: HaulingItemDetailProps) {
  return null;
}
