import type { LayerValues } from '@/engine/netWorth/series';

export interface NetWorthTableRow {
  characterId: number;
  characterName: string;
  layers: LayerValues | null;
  covered: boolean;
  needsReauth: boolean;
}

const EMPTY_LAYERS: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0, contracts: 0 };

export function buildTableRows(input: {
  characters: readonly { characterId: number; name: string }[];
  latest: ReadonlyMap<number, LayerValues>;
  covered: ReadonlySet<number>;
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
