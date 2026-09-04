/**
 * The corporation's wallet divisions, as the selector beside the switch needs
 * them (issue #298).
 *
 * Two endpoints answer half the question each: `/wallets` gives the seven
 * divisions and their balances but no names, `/divisions` gives the names the
 * corp chose but no balances — and it omits `name` entirely for a division
 * still on its default. Joining them is what turns "Division 3" into "SRP",
 * which is most of what makes a corp wallet readable at all, and is why
 * `read_divisions` sits beside the wallet scope in `corpScopes.ts` rather than
 * being treated as a nicety.
 *
 * Pure: `name` is left null rather than defaulted here, so the fallback label
 * stays one translated string in the view instead of an English literal baked
 * into a data module.
 */
import type { CorporationDivisions, CorporationWalletDivision } from '@/esi/endpoints';

export interface WalletDivision {
  /** 1-7. */
  division: number;
  /** The corporation's own name for it, or null when it never set one. */
  name: string | null;
  balance: number;
}

/**
 * Every division the wallet read returned, in division order, each carrying
 * whatever name the divisions read had for it.
 *
 * Driven by the *wallet* list, not the divisions list: the balances are the
 * data, and `read_divisions` may be missing or fail on its own while the
 * wallets still load. A missing name degrades one label; a missing division
 * would silently hide a wallet.
 */
export function walletDivisions(
  wallets: readonly CorporationWalletDivision[],
  divisions: CorporationDivisions | null
): WalletDivision[] {
  const nameByDivision = new Map<number, string>();
  for (const entry of divisions?.wallet ?? []) {
    const name = entry.name?.trim();
    if (entry.division !== undefined && name) nameByDivision.set(entry.division, name);
  }
  return [...wallets]
    .sort((a, b) => a.division - b.division)
    .map((wallet) => ({
      division: wallet.division,
      name: nameByDivision.get(wallet.division) ?? null,
      balance: wallet.balance,
    }));
}

export interface HangarDivision {
  /** 1-7. */
  division: number;
  /** The corporation's own name for it, or null when it never set one. */
  name: string | null;
}

/**
 * All seven hangar divisions, each carrying whatever name the divisions read
 * had for it. Issue #330's grouping, unlike `walletDivisions`, has no wallet
 * list to drive which divisions exist — a corp asset row names its division
 * by number in `location_flag` regardless of whether `/divisions` answered at
 * all — so every one of the seven is always returned, named or not.
 */
export function hangarDivisions(divisions: CorporationDivisions | null): HangarDivision[] {
  const nameByDivision = new Map<number, string>();
  for (const entry of divisions?.hangar ?? []) {
    const name = entry.name?.trim();
    if (entry.division !== undefined && name) nameByDivision.set(entry.division, name);
  }
  return [1, 2, 3, 4, 5, 6, 7].map((division) => ({
    division,
    name: nameByDivision.get(division) ?? null,
  }));
}
