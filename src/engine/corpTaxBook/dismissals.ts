import { dismissalWaives } from '../../../functions/src/corpTaxBookCheckpoint';

export type DismissalScope = 'record' | 'miner' | 'moon' | 'extraction';

export interface Dismissal {
  id: string;
  scope: DismissalScope;
  targetId: string;
  by: number;
  at: string;
  reason: string;
  from?: string;
  reversed?: { by: number; at: string; from?: string };
}

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

export function activeDismissalFor(
  charge: DismissableCharge,
  dismissals: readonly Dismissal[]
): Dismissal | undefined {
  return dismissals.find((d) => dismissalWaives(d, charge.date) && covers(d, charge));
}

export function reverseDismissal(d: Dismissal, reversal: { by: number; at: string }): Dismissal {
  if (d.reversed) throw new Error(`Dismissal ${d.id} was already reversed`);
  return { ...d, reversed: { ...reversal } };
}
