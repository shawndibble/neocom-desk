/**
 * Which `/corp/assets` divisions are expanded, per corporation (issue #420):
 * device-local view state, not Editable Data (CONTEXT.md round 7), so it
 * survives navigation without resetting to fully collapsed every time, but
 * never syncs.
 *
 * Keyed by corporation rather than one flat set: a director of two
 * corporations across two Characters should not have one corp's open
 * divisions apply to the other. Same "one `createLocalSetting` key holding a
 * record" shape as `grantPromptDismissal.ts`.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { ALL_CORP_ASSET_GROUP_IDS, type CorpAssetGroupId } from '@/engine/corp/assetDivisions';

export const CORP_ASSETS_EXPANDED_SETTING_KEY = 'corp.assetsExpanded';

export interface CorpAssetsExpandedState {
  /** Corporation id -> the group ids currently expanded for it. */
  byCorporation: Readonly<Record<number, readonly CorpAssetGroupId[]>>;
}

export const NO_EXPANDED_DIVISIONS: CorpAssetsExpandedState = { byCorporation: {} };

const KNOWN_GROUP_IDS: ReadonlySet<CorpAssetGroupId> = new Set(ALL_CORP_ASSET_GROUP_IDS);

function isCorpAssetGroupId(value: unknown): value is CorpAssetGroupId {
  return KNOWN_GROUP_IDS.has(value as CorpAssetGroupId);
}

export function parseCorpAssetsExpanded(raw: unknown): CorpAssetsExpandedState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const byCorporation = (raw as Partial<CorpAssetsExpandedState>).byCorporation;
  if (typeof byCorporation !== 'object' || byCorporation === null || Array.isArray(byCorporation)) {
    return null;
  }
  const parsed: Record<number, readonly CorpAssetGroupId[]> = {};
  for (const [key, ids] of Object.entries(byCorporation)) {
    const corporationId = Number(key);
    if (!Number.isFinite(corporationId) || !Array.isArray(ids)) return null;
    if (!ids.every(isCorpAssetGroupId)) return null;
    parsed[corporationId] = ids;
  }
  return { byCorporation: parsed };
}

/** Which groups are expanded for `corporationId` — empty with no active corporation yet. */
export function expandedCorpAssetGroups(
  value: CorpAssetsExpandedState,
  corporationId: number | null
): ReadonlySet<CorpAssetGroupId> {
  if (corporationId === null) return new Set();
  return new Set(value.byCorporation[corporationId] ?? []);
}

/** Toggles `groupId` for `corporationId`, without mutating `value`. */
export function withToggledCorpAssetGroup(
  value: CorpAssetsExpandedState,
  corporationId: number,
  groupId: CorpAssetGroupId
): CorpAssetsExpandedState {
  const current = new Set(value.byCorporation[corporationId] ?? []);
  if (current.has(groupId)) current.delete(groupId);
  else current.add(groupId);
  return {
    byCorporation: { ...value.byCorporation, [corporationId]: [...current] },
  };
}

export const useCorpAssetsExpanded = createLocalSetting<CorpAssetsExpandedState>({
  key: CORP_ASSETS_EXPANDED_SETTING_KEY,
  defaultValue: NO_EXPANDED_DIVISIONS,
  parse: parseCorpAssetsExpanded,
});
