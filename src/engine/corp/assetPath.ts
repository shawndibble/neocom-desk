/**
 * `/corp/assets`' URL-addressing scheme (issue #779) — the division/flag-group
 * twin of `engine/assetPath.ts`. Shares `walkAssetTreeSegments` (the
 * container/bay/item drill-down contract) with the personal page rather than
 * reimplementing it; only the top level differs, keyed by `CorpAssetGroupId`
 * instead of a station's numeric `location_id`, since a corp doesn't have a
 * device-local "current owner" to key a first path segment on the way
 * `/assets` does.
 */
import type { AssetTreeGroup, AssetTreeNode } from '../assetTree';
import { walkAssetTreeSegments } from '../assetPath';
import { ALL_CORP_ASSET_GROUP_IDS, type CorpAssetGroupId } from './assetDivisions';

export interface ResolvedCorpAssetPath {
  /** The group the path points into — null at the root listing, and for a group id the tree no longer has. */
  group: AssetTreeGroup<CorpAssetGroupId> | null;
  trail: readonly AssetTreeNode[];
  children: readonly AssetTreeNode[];
  unresolved: readonly string[];
}

const ROOT: ResolvedCorpAssetPath = { group: null, trail: [], children: [], unresolved: [] };

function groupSegment(id: CorpAssetGroupId): string {
  return String(id);
}

/**
 * Walks `segments` down from `groupId`, stopping at the first segment the
 * tree cannot match and reporting that segment and everything after it as
 * unresolved — the same contract `resolveAssetPath` gives `/assets`.
 */
export function resolveCorpAssetPath(
  groups: readonly AssetTreeGroup<CorpAssetGroupId>[],
  groupId: CorpAssetGroupId | null,
  segments: readonly string[]
): ResolvedCorpAssetPath {
  if (groupId === null) return ROOT;

  const group = groups.find((candidate) => candidate.id === groupId);
  // An unknown group id is reported whole rather than silently redirected —
  // same reasoning as an unknown station id in resolveAssetPath.
  if (!group) return { ...ROOT, unresolved: [groupSegment(groupId), ...segments] };

  const { trail, children, unresolved } = walkAssetTreeSegments(group.children, segments);
  return { group, trail, children, unresolved };
}

export interface ParsedCorpAssetPath {
  groupId: CorpAssetGroupId | null;
  segments: string[];
}

const ROOT_PARSE: ParsedCorpAssetPath = { groupId: null, segments: [] };

/**
 * A syntactically-plausible division number, not range-checked against
 * `HANGAR_DIVISIONS` here — an out-of-range or made-up number (`/corp/assets/8`)
 * still parses as a candidate id and is then reported unresolved by
 * `resolveCorpAssetPath` (it matches no real group), the same way an unknown
 * numeric station id is for `/assets`, rather than silently rooting. Flag-kind
 * ids have no such open range, so those stay checked against the known set.
 */
const DIVISION_HEAD_PATTERN = /^\d+$/;

function parseGroupId(head: string): CorpAssetGroupId | null {
  if (DIVISION_HEAD_PATTERN.test(head)) return Number(head) as CorpAssetGroupId;
  const known = ALL_CORP_ASSET_GROUP_IDS.find((id) => id === head);
  return known ?? null;
}

/** Reads the `/corp/assets/*` wildcard back into a group id plus node segments. */
export function parseCorpAssetPath(wildcard: string): ParsedCorpAssetPath {
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
  const groupId = parseGroupId(head);
  if (groupId === null) return ROOT_PARSE;
  return { groupId, segments };
}

/** Builds the href for a group and a depth beneath it. */
export function corpAssetPathHref(
  groupId: CorpAssetGroupId | null,
  segments: readonly string[]
): string {
  if (groupId === null) return '/corp/assets';
  return ['/corp/assets', groupSegment(groupId), ...segments].join('/');
}
