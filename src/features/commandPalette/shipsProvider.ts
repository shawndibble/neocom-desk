/**
 * The Command Palette's Ships group (#5409): every hull in the Ship Tree
 * snapshot, matched by name with the Ship Tree's own `searchHulls` so both
 * rank hulls alike. Selecting one opens the Ship Tree with that hull's Ship
 * Info window open.
 */
import { searchHulls, factionNameOf } from '@/features/fittings/shipTree/shipTreeModel';
import type { ShipTreeData } from '@/sde/types';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface ShipsProviderOptions {
  /** `loadShipTree`: fetched lazily on the first search, never at palette open. */
  readonly loadShipTree: () => Promise<ShipTreeData>;
  /** Open the Ship Tree on this hull, its window open. */
  readonly onOpen: (typeID: number) => void;
}

export function createShipsProvider({
  loadShipTree,
  onOpen,
}: ShipsProviderOptions): PaletteProvider {
  let pending: Promise<ShipTreeData> | null = null;
  // Once in memory, later keystrokes answer synchronously: no "Searching…" flash.
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
    // After Contacts, above Market Items: a typed hull name most likely wants the Ship Tree.
    order: 7,
    minQueryLength: 2,
    search: (query) => {
      if (loaded) return match(loaded, query);
      pending ??= loadShipTree().catch((error: unknown) => {
        pending = null; // a failed snapshot load retries on the next keystroke
        throw error;
      });
      return pending.then((tree) => {
        loaded = tree;
        return match(tree, query);
      });
    },
  };
}
