/**
 * Dismissals (D6): an officer waives tax per record (one Observed Mining
 * Entry), per Miner, per moon or per Extraction, with who, when and why.
 * Reversible, shown separately, and never deleted — a reversal is recorded on
 * the dismissal, so the audit trail keeps both.
 */
import { dismissalWaives } from '../../../functions/src/corpTaxBookCheckpoint';

export type DismissalScope = 'record' | 'miner' | 'moon' | 'extraction';

export interface Dismissal {
  id: string;
  scope: DismissalScope;
  /** Record key, Miner id, moon id or Extraction id, as a string. */
  targetId: string;
  /** Character id of the officer. */
  by: number;
  at: string;
  reason: string;
  /**
   * A Miner, moon or Extraction dismissal's lock date when it was made: it waives only days on or
   * after it. Absent on one made before the lock date existed, which waives every day.
   */
  from?: string;
  /** `from`: the lock date at the reversal, which ends the dismissal from that day on only. */
  reversed?: { by: number; at: string; from?: string };
}

/** What a dismissal can match on one day's charge. */
export interface DismissableCharge {
  key: string;
  minerId: string;
  moonId?: number;
  extractionId?: string;
  date: string;
}

function covers(d: Dismissal, charge: DismissableCharge): boolean {
  switch (d.scope) {
    case 'record':
      return d.targetId === charge.key;
    case 'extraction':
      return charge.extractionId !== undefined && d.targetId === charge.extractionId;
    // A Miner or moon dismissal waives what was mined up to the day it was
    // made; it is not a standing exemption that silently frees later days.
    case 'miner':
      return d.targetId === charge.minerId && charge.date <= d.at.slice(0, 10);
    case 'moon':
      return (
        charge.moonId !== undefined &&
        d.targetId === String(charge.moonId) &&
        charge.date <= d.at.slice(0, 10)
      );
  }
}

/** The first dismissal that waives `charge`'s day and covers it, if any. */
export function activeDismissalFor(
  charge: DismissableCharge,
  dismissals: readonly Dismissal[]
): Dismissal | undefined {
  return dismissals.find((d) => dismissalWaives(d, charge.date) && covers(d, charge));
}

/** The dismissal with its reversal recorded. Throws when it was already reversed. */
export function reverseDismissal(d: Dismissal, reversal: { by: number; at: string }): Dismissal {
  if (d.reversed) throw new Error(`Dismissal ${d.id} was already reversed`);
  return { ...d, reversed: { ...reversal } };
}
