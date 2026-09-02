/**
 * The Assets page browses one level at a time (issue #148 follow-up): a
 * location list, then a station's contents, then a container's, and so on.
 * "Where am I" lives in the URL (`/assets/:stationId/*`) rather than in
 * component state, so the phone's back button steps *up* a level instead of
 * leaving the page, and a refresh or a shared link lands in the same place.
 *
 * This module is the whole of that addressing scheme: how a node is named in a
 * URL, how a URL is read back, and how a URL is resolved against a tree that
 * may have changed underneath it. Resolution never throws and never falls back
 * to the root — a stale link reports what it could not account for, so the UI
 * can land the user as deep as the tree still allows and tell them the rest is
 * gone.
 */

import type { AssetTreeNode, AssetTreeStation } from './assetTree';

/**
 * Names one node among its siblings, stably across re-sorts and re-fetches.
 * Bays have no asset of their own so they are keyed by kind; everything else
 * is keyed by the item id ESI already guarantees is unique.
 */
export function assetNodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

export interface ResolvedAssetPath {
  /** The station the path points into — null at the root listing, and for a station id the tree no longer has. */
  station: AssetTreeStation | null;
  /** Nodes walked through, outermost first. Empty when the path stops at the station itself. */
  trail: readonly AssetTreeNode[];
  /** What to list at this level. Empty at the root (the caller lists locations) and at a leaf. */
  children: readonly AssetTreeNode[];
  /** Segments the tree could not account for — a stale bookmark, or a container emptied since. */
  unresolved: readonly string[];
}

const ROOT: ResolvedAssetPath = { station: null, trail: [], children: [], unresolved: [] };

/** A bay is the one node kind with children but no asset; items are always leaves. */
function childrenOf(node: AssetTreeNode): readonly AssetTreeNode[] {
  return node.kind === 'item' ? [] : node.children;
}

/**
 * Walks `segments` down from `stationId`, stopping at the first segment the
 * tree cannot match and reporting that segment and everything after it as
 * unresolved.
 */
export function resolveAssetPath(
  stations: readonly AssetTreeStation[],
  stationId: number | null,
  segments: readonly string[]
): ResolvedAssetPath {
  if (stationId === null) return ROOT;

  const station = stations.find((candidate) => candidate.locationId === stationId);
  // An unknown station id is reported whole rather than silently redirected:
  // the caller shows "this location is no longer in your assets", which is a
  // truer answer to a stale link than a root listing that looks like success.
  if (!station) return { ...ROOT, unresolved: [String(stationId), ...segments] };

  const trail: AssetTreeNode[] = [];
  let children: readonly AssetTreeNode[] = station.children;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const match = children.find((node) => assetNodeSegment(node) === segment);
    if (!match) {
      return { station, trail, children, unresolved: segments.slice(index) };
    }
    trail.push(match);
    children = childrenOf(match);
  }

  return { station, trail, children, unresolved: [] };
}

export interface ParsedAssetPath {
  stationId: number | null;
  segments: string[];
}

const ROOT_PARSE: ParsedAssetPath = { stationId: null, segments: [] };

/**
 * Reads the `/assets/*` wildcard back into a station id plus node segments.
 * A path whose first segment isn't a station id resolves to the root rather
 * than to `NaN` — hand-edited and truncated URLs are expected input here.
 */
export function parseAssetPath(wildcard: string): ParsedAssetPath {
  const parts = wildcard
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        // A lone '%' is not valid percent-encoding; treat it as literal text
        // rather than letting a malformed URL throw during render.
        return part;
      }
    });
  if (parts.length === 0) return ROOT_PARSE;

  const [head, ...segments] = parts;
  if (!/^\d+$/.test(head)) return ROOT_PARSE;
  return { stationId: Number(head), segments };
}

/** Builds the href for a location and a depth beneath it. */
export function assetPathHref(stationId: number | null, segments: readonly string[]): string {
  if (stationId === null) return '/assets';
  return ['/assets', String(stationId), ...segments].join('/');
}
