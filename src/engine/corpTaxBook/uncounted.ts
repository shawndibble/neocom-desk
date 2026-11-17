/**
 * Donations into wallet divisions the book does not read (#6207). The sync never
 * credits them, so a Miner who paid into the wrong division goes Overdue with no
 * trace on the book. The sync notes the ones that look like tax — from a sender
 * whose Miner owes, or carrying a Statement's pay code — and the Overview's Needs
 * you lists them until an officer counts that division or marks one not tax.
 * Mirrored in `functions/src/corpTaxBookSyncEngine.ts` (syncMirror.test.ts).
 */
import { isPlainRecord } from '@/engine/guards';
import { matchDonation } from './allocation';
import type { Miner } from './charges';
import type { Statement } from './statements';
import type { JournalDonation } from './sync';

/** Wallet divisions a corporation has. */
export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;
/** The most a sync notes; the newest win. Mirrors the server's parse bound. */
export const UNCOUNTED_LIMIT = 20;

export interface UncountedDonation {
  /** The payment id it would have as a counted donation: `j{division}_{refId}`. */
  id: string;
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
}

/** The wallet divisions the book does not read. */
export function otherDivisions(divisions: readonly number[]): number[] {
  return WALLET_DIVISIONS.filter((d) => !divisions.includes(d));
}

/**
 * The donations (from `otherDivisions`) worth an officer's look: ones `matchDonation` would
 * credit, against the balance left once this sync's `counted` donations (resolved) paid theirs.
 * Newest first.
 */
export function noteUncounted(
  donations: readonly JournalDonation[],
  book: {
    miners: readonly Miner[];
    statements: readonly Statement[];
    knownCharacterIds: ReadonlySet<number>;
    openBalance: ReadonlyMap<string, number>;
    unbilled: ReadonlySet<string>;
  },
  counted: readonly JournalDonation[] = []
): UncountedDonation[] {
  const openBalance = new Map(book.openBalance);
  for (const c of counted)
    if (c.minerId !== undefined)
      openBalance.set(c.minerId, (openBalance.get(c.minerId) ?? 0) - c.amount);
  return donations
    .filter((d) => {
      const match = matchDonation({ characterId: d.characterId, reason: d.reason }, book);
      if (match.kind === 'statement') return true;
      // A known sender's donation here is likely tax only while their Miner owes (#6207).
      return (
        match.kind === 'miner' &&
        ((openBalance.get(match.minerId) ?? 0) > 0 || book.unbilled.has(match.minerId))
      );
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.refId - a.refId)
    .slice(0, UNCOUNTED_LIMIT)
    .map((d) => ({
      id: `j${d.division}_${d.refId}`,
      refId: d.refId,
      division: d.division,
      characterId: d.characterId,
      amount: d.amount,
      at: d.at,
    }));
}

/** The noted donations still to show: none from a division the book now reads. */
export function uncountedToShow(
  stored: { donations: readonly UncountedDonation[] } | undefined,
  divisions: readonly number[]
): UncountedDonation[] {
  return (stored?.donations ?? []).filter((u) => !divisions.includes(u.division));
}

/** The stored `meta/uncounted` doc, tolerant of absence and garbage. */
export function readUncounted(raw: unknown): { donations: UncountedDonation[] } {
  const list = isPlainRecord(raw) && Array.isArray(raw.donations) ? raw.donations : [];
  const donations: UncountedDonation[] = [];
  for (const u of list) {
    if (!isPlainRecord(u)) continue;
    const { id, refId, division, characterId, amount, at } = u;
    if (
      typeof id === 'string' &&
      typeof refId === 'number' &&
      typeof division === 'number' &&
      (WALLET_DIVISIONS as readonly number[]).includes(division) &&
      typeof characterId === 'number' &&
      typeof amount === 'number' &&
      typeof at === 'string'
    )
      donations.push({ id, refId, division, characterId, amount, at });
  }
  return { donations };
}
