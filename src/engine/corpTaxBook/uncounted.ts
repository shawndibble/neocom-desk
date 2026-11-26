import { isPlainRecord } from '@/engine/guards';
import type { UncountedDonation } from '../../../functions/src/corpTaxBookDonationMatch';

export {
  UNCOUNTED_LIMIT,
  noteUncountedDonations,
  type UncountedDonation,
} from '../../../functions/src/corpTaxBookDonationMatch';

export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function primaryDivisionOf(
  divisions: readonly number[],
  primary: number | undefined
): number {
  if (primary !== undefined && divisions.includes(primary)) return primary;
  return divisions[0] ?? 1;
}

export function divisionsPrimaryFirst(
  divisions: readonly number[],
  primary: number | undefined
): number[] {
  const first = primaryDivisionOf(divisions, primary);
  return [first, ...divisions.filter((d) => d !== first)];
}

export function otherDivisions(divisions: readonly number[]): number[] {
  return WALLET_DIVISIONS.filter((d) => !divisions.includes(d));
}

export function uncountedToShow(
  stored: { donations: readonly UncountedDonation[] } | undefined,
  divisions: readonly number[]
): UncountedDonation[] {
  return (stored?.donations ?? []).filter((u) => !divisions.includes(u.division));
}

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
