import { searchHulls, factionNameOf } from '@/features/fittings/shipTree/shipTreeModel';
import type { ShipTreeData } from '@/sde/types';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface ShipsProviderOptions {
  readonly loadShipTree: () => Promise<ShipTreeData>;
  readonly onOpen: (typeID: number) => void;
}

export function createShipsProvider({
  loadShipTree,
  onOpen,
}: ShipsProviderOptions): PaletteProvider {
  let pending: Promise<ShipTreeData> | null = null;
  let loaded: ShipTreeData | null = null;

  const match = (tree: ShipTreeData, query: string): PaletteResult[] => {
    return searchHulls(tree.ships, query)
      .slice(0, GROUP_LIMIT)
      .map((ship) => ({
        id: String(ship.typeID),
        label: ship.name,
        sublabel: [
          tree.groups[String(ship.treeGroupID)]?.name,
          factionNameOf(tree.factions, ship.factionID),
        ]
          .filter(Boolean)
          .join(' · '),
        run: () => onOpen(ship.typeID),
      }));
  };

  return {
    id: 'ships',
    labelKey: 'commandPalette.groups.ships',
    order: 7,
    minQueryLength: 2,
    search: (query) => {
      if (loaded) return match(loaded, query);
      pending ??= loadShipTree().catch((error: unknown) => {
        pending = null;
        throw error;
      });
      return pending.then((tree) => {
        loaded = tree;
        return match(tree, query);
      });
    },
  };
}
