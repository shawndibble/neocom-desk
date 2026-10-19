import { createContext, useContext } from 'react';
import type { AssetTreeNode, AssetTreeStation } from '@/engine/assetTree';
import { assetPathHref } from '@/engine/assetPath';
import type { CharacterAsset } from '@/esi/endpoints';
import type { AbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import type { BuildPlanRecord } from '@/db';

/**
 * A drill-down href that keeps the page's whole query string: its filters
 * describe the same view one level deeper, and the component instance (and
 * its state) already survives drill-down.
 */
export function assetHref(
  stationId: number | null,
  segments: readonly string[],
  query: string
): string {
  return assetPathHref(stationId, segments) + query;
}

export interface AssetMatch {
  asset: CharacterAsset;
  name: string;
}

/**
 * Cross-character search (issue #746, formerly #85's toggle): who owns which
 * row, relative to the active Character — the three pieces always travel
 * together, so they get one value instead of three.
 */
export interface CharacterBadgeContext {
  activeCharacterId: number | null;
  idByItemId: ReadonlyMap<number, number>;
  nameById: ReadonlyMap<number, string>;
}

/** The owning Character's name, only when it isn't the active Character — null means "no badge". */
export function characterBadgeFor(itemId: number, ctx: CharacterBadgeContext): string | null {
  const ownerId = ctx.idByItemId.get(itemId);
  if (ownerId === undefined || ownerId === ctx.activeCharacterId) return null;
  return ctx.nameById.get(ownerId) ?? null;
}

/**
 * Assets-only supporting data an item row needs but a prop-threaded context
 * cannot carry cheaply — pricing/volume and the "View in Industry as
 * material" wiring. Quickbar, blueprint lookup and Show info are the page's
 * shared Item Actions (`itemActions.ts`) now, read by `ItemContextMenu`
 * itself; this context stays for what's Assets-specific. Reaching these
 * through `useContext` rather than props matters beyond style: the React
 * Compiler's purity/refs checks can verify a value read via Context is
 * deferred to event time, but lose that guarantee for a closure passed
 * through ordinary props.
 */
export interface AssetItemActions {
  priceByTypeId: ReadonlyMap<number, number>;
  itemValueByItemId: ReadonlyMap<number, number>;
  /** Abyssal modules' MutaMarket estimates; a row on screen asks for its own. */
  abyssal: AbyssalAssetEstimates;
  volumeByTypeId: ReadonlyMap<number, number>;
  /** Material typeID -> the character's own Build Plan consuming it; null until the blueprint catalog has loaded. */
  materialPlanMap: ReadonlyMap<number, BuildPlanRecord> | null;
  onViewInIndustryAsMaterial: (typeId: number) => void;
  /** Blueprint typeIDs for the BPO badge; null until loaded, or when nothing listed can be a blueprint. */
  blueprintTypeIds: ReadonlySet<number> | null;
}

export const AssetItemActionsContext = createContext<AssetItemActions | null>(null);

export function useAssetItemActions(): AssetItemActions {
  const actions = useContext(AssetItemActionsContext);
  if (!actions) throw new Error('Asset row rendered outside its actions provider');
  return actions;
}

/**
 * One row of whatever list is currently on screen. Three list shapes share a
 * single virtualizer and a single row union rather than three parallel
 * implementations: the location list, one level of a location's contents, and
 * flat search results.
 */
export type BrowseRow =
  | { kind: 'heading'; key: string; label: string; tone: 'default' | 'warning' }
  | { kind: 'location'; key: string; station: AssetTreeStation }
  | { kind: 'node'; key: string; node: AssetTreeNode }
  | { kind: 'match'; key: string; match: AssetMatch };

export function baseRowHeight(row: BrowseRow): number {
  switch (row.kind) {
    case 'heading':
      return 33;
    case 'location':
    case 'match':
      return 64;
    case 'node':
      return 48;
  }
}

/**
 * An orphan group: `buildAssetTree` promotes an asset whose parent wasn't in
 * the fetched page to its own top-level group, which is why a bare "Container"
 * or a ship name can appear beside real stations. Most such parents really are
 * unresolvable (a cycle, or a page never fetched), but some are structure ids
 * ESI just never returns an asset row for (a personal-hangar division inside a
 * player-owned structure) — `loadAssetsSnapshot` best-effort resolves those via
 * the structures endpoint, and a hit there means this is a real, named
 * location after all, not an orphan.
 */
export function isUnresolvedParent(
  station: AssetTreeStation,
  locationNames: ReadonlyMap<number, string>
): boolean {
  return station.locationType === 'item' && !locationNames.has(station.locationId);
}
