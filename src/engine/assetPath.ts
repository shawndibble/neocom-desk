import type { AssetTreeNode, AssetTreeStation } from './assetTree';

export function assetNodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

export interface ResolvedAssetPath {
  station: AssetTreeStation | null;
  trail: readonly AssetTreeNode[];
  children: readonly AssetTreeNode[];
  unresolved: readonly string[];
}

const ROOT: ResolvedAssetPath = { station: null, trail: [], children: [], unresolved: [] };

function childrenOf(node: AssetTreeNode): readonly AssetTreeNode[] {
  return node.kind === 'item' ? [] : node.children;
}

export interface AssetTreeWalkResult {
  trail: readonly AssetTreeNode[];
  children: readonly AssetTreeNode[];
  unresolved: readonly string[];
}

export function walkAssetTreeSegments(
  startChildren: readonly AssetTreeNode[],
  segments: readonly string[]
): AssetTreeWalkResult {
  const trail: AssetTreeNode[] = [];
  let children: readonly AssetTreeNode[] = startChildren;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const match = children.find((node) => assetNodeSegment(node) === segment);
    if (!match) {
      return { trail, children, unresolved: segments.slice(index) };
    }
    trail.push(match);
    children = childrenOf(match);
  }

  return { trail, children, unresolved: [] };
}

export function resolveAssetPath(
  stations: readonly AssetTreeStation[],
  stationId: number | null,
  segments: readonly string[]
): ResolvedAssetPath {
  if (stationId === null) return ROOT;

  const station = stations.find((candidate) => candidate.locationId === stationId);
  if (!station) return { ...ROOT, unresolved: [String(stationId), ...segments] };

  const { trail, children, unresolved } = walkAssetTreeSegments(station.children, segments);
  return { station, trail, children, unresolved };
}

export interface FoundAssetNode {
  stationId: number;
  node: AssetTreeNode;
  segments: readonly string[];
  parentSegments: readonly string[];
}

export function indexAssetNodes(
  stations: readonly AssetTreeStation[]
): ReadonlyMap<number, FoundAssetNode> {
  const index = new Map<number, FoundAssetNode>();
  const walk = (
    stationId: number,
    nodes: readonly AssetTreeNode[],
    parentSegments: readonly string[]
  ): void => {
    for (const node of nodes) {
      const segment = assetNodeSegment(node);
      if (node.kind !== 'bay') {
        index.set(node.asset.item_id, {
          stationId,
          node,
          segments: [...parentSegments, segment],
          parentSegments,
        });
      }
      if (node.kind !== 'item') walk(stationId, node.children, [...parentSegments, segment]);
    }
  };
  for (const station of stations) walk(station.locationId, station.children, []);
  return index;
}

export interface ParsedAssetPath {
  stationId: number | null;
  segments: string[];
}

const ROOT_PARSE: ParsedAssetPath = { stationId: null, segments: [] };

const ITEMS_TAB = 'items';

export function parseAssetPath(wildcard: string): ParsedAssetPath {
  const parts = wildcard
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (parts.shift() !== ITEMS_TAB || parts.length === 0) return ROOT_PARSE;

  const [head, ...segments] = parts;
  if (!/^\d+$/.test(head)) return ROOT_PARSE;
  return { stationId: Number(head), segments };
}

export function assetPathHref(stationId: number | null, segments: readonly string[]): string {
  if (stationId === null) return `/assets/${ITEMS_TAB}`;
  return ['/assets', ITEMS_TAB, String(stationId), ...segments].join('/');
}

export function legacyAssetsLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  const rest = pathname.replace(/^\/assets\/?/, '').replace(/\/$/, '');
  if (/^\d+(\/|$)/.test(rest)) return { pathname: `/assets/${ITEMS_TAB}/${rest}`, search };
  if (rest === '') {
    const params = new URLSearchParams(search);
    if (params.get('view') !== 'ships') return null;
    params.delete('view');
    const kept = params.toString();
    return { pathname: '/assets/ships', search: kept ? `?${kept}` : '' };
  }
  return null;
}
