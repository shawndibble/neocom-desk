/**
 * The member's own wallet journal and the corporation's journal stamp the same ISK transfer with
 * different entry ids, so the two are matched by sender, amount and time. One rule, used both to
 * tell a donation the book already holds from one still in flight (`inFlightDonations`) and to
 * find the member's own journal entry for a Tax Payment (`pairWithMadePayments`).
 */
import { MINUTE_MS } from '@/lib/age';
import type { TaxPayment } from './payments';

/** The corp's journal stamps the same ISK transfer within the same minute or two. */
export const SAME_TRANSFER_MS = 10 * MINUTE_MS;

/** Whether `held` (the corporation's side) and `made` (the member's) are one transfer. */
export function isSameTransfer(
  held: { characterId: number; amount: number; at: string },
  made: { characterId: number; amount: number; date: string }
): boolean {
  return (
    held.characterId === made.characterId &&
    Math.abs(held.amount - made.amount) < 1 &&
    Math.abs(Date.parse(held.at) - Date.parse(made.date)) <= SAME_TRANSFER_MS
  );
}

/** An outgoing entry of the member's own wallet journal. */
export interface MadeEntry {
  /** The wallet journal id; an entry without one cannot be linked to. */
  refId?: number;
  characterId: number;
  counterpartyId?: number;
  amount: number | null;
  date: string;
  method: string;
}

/**
 * Each donation of the book mapped to the member's own journal entry for it (`paymentId` →
 * journal `refId`). Best effort: a donation the member's journal no longer holds, an officer
 * recorded one, or one that more than one entry could be, is simply left out. Never a guess:
 * an entry that is the nearest of two donations is left out for both.
 */
export function pairWithMadePayments(
  payments: readonly TaxPayment[],
  made: readonly MadeEntry[],
  corporationId: number
): Map<string, number> {
  const entries = made.filter(
    (m): m is MadeEntry & { refId: number; amount: number } =>
      m.refId !== undefined &&
      m.method === 'donation' &&
      m.counterpartyId === corporationId &&
      m.amount !== null &&
      m.amount > 0
  );
  const chosen = new Map<string, number>();
  for (const p of payments) {
    if (p.source !== 'donation') continue;
    const near = entries
      .filter((m) => isSameTransfer(p, m))
      .map((m) => ({ refId: m.refId, gap: Math.abs(Date.parse(p.at) - Date.parse(m.date)) }))
      .sort((a, b) => a.gap - b.gap);
    // Two equally near entries: nothing says which is the member's.
    if (near.length === 0 || (near.length > 1 && near[0]!.gap === near[1]!.gap)) continue;
    chosen.set(p.id, near[0]!.refId);
  }
  const claims = new Map<number, number>();
  for (const refId of chosen.values()) claims.set(refId, (claims.get(refId) ?? 0) + 1);
  return new Map([...chosen].filter(([, refId]) => claims.get(refId) === 1));
}
