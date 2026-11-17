/**
 * A running account's figures as the pay page reads them (#6294): the server cannot price days,
 * so an officer's client records each Miner's account (`recordAccounts`) and the verify link
 * shows it, less what the Miner paid since (`liveAccount`, functions).
 */
import type { BookView } from './bookView';
import { netOf } from './paymentPreview';

/** One Miner's account as `recordAccounts` takes it. */
export interface AccountRecord {
  minerId: string;
  owed: number;
  /** The Miner's net payments counted (less "not tax"): later ones come off `owed` on the server. */
  paid: number;
  days: number;
  oldest?: string;
  paidThrough?: string;
}

/**
 * Each Miner's account in a running book's view, whole ISK; `only` keeps one Miner (a page
 * scoped to them reads only their rows, so no other Miner's figure is whole). Empty on a
 * calendar book.
 */
export function accountRecords(view: BookView, only?: string): AccountRecord[] {
  if (!view.input.runningAccountFrom) return [];
  const paidBy = new Map<string, number>();
  for (const p of view.input.payments)
    if (p.minerId) paidBy.set(p.minerId, (paidBy.get(p.minerId) ?? 0) + netOf(p));
  return view.miners.flatMap((m) => {
    if (!m.account || (only !== undefined && m.id !== only)) return [];
    const { owes, paidThrough } = m.account;
    return [
      {
        minerId: m.id,
        owed: Math.round(m.owed),
        paid: Math.round(paidBy.get(m.id) ?? 0),
        days: owes?.days ?? 0,
        ...(owes ? { oldest: owes.oldest } : {}),
        ...(paidThrough ? { paidThrough } : {}),
      },
    ];
  });
}
