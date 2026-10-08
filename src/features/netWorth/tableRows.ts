/**
 * Rows of the Wallet "Balance by character" table (issue #2935): each
 * Character's latest layers, with the live wallet balance standing in for the
 * snapshot's ISK when it is fresher. A Character short of a needed permission
 * has no layers and is left out of every total.
 */
import type { LayerValues } from '@/engine/netWorth/series';

export interface NetWorthTableRow {
  characterId: number;
  characterName: string;
  /** `null` = not covered by the needed permissions. */
  layers: LayerValues | null;
  /** Holds the wallet, assets and orders permissions. */
  covered: boolean;
  /** Has the permissions but the live wallet read asked for a new login. */
  needsReauth: boolean;
}

const EMPTY_LAYERS: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0 };

export function buildTableRows(input: {
  characters: readonly { characterId: number; name: string }[];
  latest: ReadonlyMap<number, LayerValues>;
  covered: ReadonlySet<number>;
  /** Live wallet balance per Character; absent = not loaded. */
  liveWallet: ReadonlyMap<number, { balance: number | null; needsReauth: boolean }>;
}): NetWorthTableRow[] {
  return input.characters.map(({ characterId, name }) => {
    const covered = input.covered.has(characterId);
    const live = input.liveWallet.get(characterId);
    let layers: LayerValues | null = null;
    if (covered) {
      layers = { ...(input.latest.get(characterId) ?? EMPTY_LAYERS) };
      if (live && !live.needsReauth && live.balance !== null) layers.isk = live.balance;
    }
    return {
      characterId,
      characterName: name,
      layers,
      covered,
      needsReauth: live?.needsReauth ?? false,
    };
  });
}
