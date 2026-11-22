/**
 * Donations into wallet divisions the book does not read (#6207). The sync never
 * credits them, so a Miner who paid into the wrong division goes Overdue with no
 * trace on the book. The sync notes the ones that look like tax (`noteUncountedDonations`, the rule
 * shared with the server) and the Overview's Needs you lists them until an officer counts that
 * division or marks one not tax.
 */
import { isPlainRecord } from '@/engine/guards';
import type { UncountedDonation } from '../../../functions/src/corpTaxBookDonationMatch';

export {
  UNCOUNTED_LIMIT,
  noteUncountedDonations,
  type UncountedDonation,
} from '../../../functions/src/corpTaxBookDonationMatch';

/** Wallet divisions a corporation has. */
export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The wallet divisions the book does not read. */
export function otherDivisions(divisions: readonly number[]): number[] {
  return WALLET_DIVISIONS.filter((d) => !divisions.includes(d));
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
