import type { CorporationDivisions, CorporationWalletDivision } from '@/esi/endpoints';

export interface WalletDivision {
  division: number;
  name: string | null;
  balance: number;
}

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
  division: number;
  name: string | null;
}

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
