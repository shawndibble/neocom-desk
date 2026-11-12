/**
 * The Customize permissions dialog's last selection (issue #1522) — a
 * **device-local**, never-synced preference (`createLocalSetting`, which
 * rejects the `sync.` prefix outright): it is a view preference, not a grant,
 * and adding several alts in a row should keep the same checkboxes without
 * asking each one to sync to a server. A re-login for a known Character reads
 * it too, so filling that Character's gaps never re-requests a Permission the
 * player unticked here (#6102).
 *
 * Stored as `{ groups }`. A bare list is a choice saved before #6102, when the
 * six `FORMERLY_OPT_IN_GROUPS` were unticked by default: their absence from
 * it says nothing about the player, so they read as ticked. What the player
 * unticked among the rest stays unticked.
 *
 * An empty `groups` ("Select none") is a valid stored choice and must stay one
 * — it is not "no selection yet", which is what an absent row already means.
 */
import { db } from '@/db';
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CUSTOMIZE_SELECTION_KEY = 'customizePermissions.selection';

export interface CustomizeSelection {
  readonly groups: readonly ScopeGroup[];
}

/** The read Permissions that were opt-in, and so unticked by default, before #6102. */
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

/**
 * Accepts known Scope Groups only, deduplicated — a hand-edited row, a group a
 * later version renamed or dropped, or any other shape falls back to the
 * default selection rather than crash the dialog.
 */
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

/**
 * The stored selection's Permissions, read straight from Dexie for a caller
 * outside React (`app/loginFlow.ts`). Every default-on Permission when nothing
 * is stored; throws when Dexie does, so the caller picks its own fallback.
 */
export async function readCustomizeSelection(): Promise<readonly ScopeGroup[]> {
  const row = await db.settings.get(CUSTOMIZE_SELECTION_KEY);
  return (parseCustomizeSelection(row?.value) ?? DEFAULT_SELECTION).groups;
}
