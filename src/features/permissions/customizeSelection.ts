import { db } from '@/db';
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CUSTOMIZE_SELECTION_KEY = 'customizePermissions.selection';

export interface CustomizeSelection {
  readonly groups: readonly ScopeGroup[];
}

export const FORMERLY_OPT_IN_GROUPS: readonly ScopeGroup[] = [
  'corp',
  'structureMarkets',
  'jumpFatigue',
  'corpProjects',
  'killmails',
  'mercenaryDens',
];

function isScopeGroup(value: unknown): value is ScopeGroup {
  return (SCOPE_GROUPS as readonly string[]).includes(value as string);
}

function parseGroups(raw: unknown): ScopeGroup[] | null {
  if (!Array.isArray(raw) || !raw.every(isScopeGroup)) return null;
  return [...new Set(raw)];
}

export function parseCustomizeSelection(raw: unknown): CustomizeSelection | null {
  if (Array.isArray(raw)) {
    const legacy = parseGroups(raw);
    return legacy && { groups: [...new Set([...legacy, ...FORMERLY_OPT_IN_GROUPS])] };
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const groups = parseGroups((raw as { groups?: unknown }).groups);
  return groups && { groups };
}

const DEFAULT_SELECTION: CustomizeSelection = { groups: DEFAULT_ON_GROUPS };

export const useCustomizePermissionsSelection = createLocalSetting<CustomizeSelection>({
  key: CUSTOMIZE_SELECTION_KEY,
  defaultValue: DEFAULT_SELECTION,
  parse: parseCustomizeSelection,
});

export async function readCustomizeSelection(): Promise<readonly ScopeGroup[]> {
  const row = await db.settings.get(CUSTOMIZE_SELECTION_KEY);
  return (parseCustomizeSelection(row?.value) ?? DEFAULT_SELECTION).groups;
}
