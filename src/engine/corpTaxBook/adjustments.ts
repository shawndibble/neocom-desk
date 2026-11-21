/** An officer's Adjustment to what a Miner owes (D22): a correction of a mined day, or an opening balance. */

/** An officer's logged correction to a Miner's account; negative credits them. */
export interface Adjustment {
  id: string;
  minerId: string;
  /** The mined day it corrects; one on or before the Miner's checkpoint drops the checkpoint. */
  date: string;
  amount: number;
  reason: string;
  by: number;
  at: string;
  /** An officer undid it: the record stays, struck through, and no longer counts. */
  reversed?: { by: number; at: string; reason: string };
  /** `opening`: the balance rolled over from another system, not a correction of a mined day. */
  kind?: 'opening';
  /** The reversed Adjustment this one replaces (an edit is a reversal plus a new Adjustment). */
  replaces?: string;
}
