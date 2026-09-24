/**
 * The Customize permissions dialog's last selection (issue #1522) — a
 * **device-local**, never-synced preference (`createLocalSetting`, which
 * rejects the `sync.` prefix outright): it is a view preference, not a grant,
 * and adding several alts in a row should keep the same checkboxes without
 * asking each one to sync to a server.
 *
 * `[]` ("Select none") is a valid stored choice and must stay one — it is not
 * "no selection yet", which is what an absent row already means. Collapsing it
 * back to the defaults on read would make Select none impossible to persist.
 */
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CUSTOMIZE_SELECTION_KEY = 'customizePermissions.selection';

function isScopeGroup(value: unknown): value is ScopeGroup {
  return (SCOPE_GROUPS as readonly string[]).includes(value as string);
}

/**
 * Accepts an array of known Scope Groups only, deduplicated — a hand-edited
 * row, a group a later version renamed or dropped, or a non-array value all
 * fall back to the default selection rather than crash the dialog.
 */
export function parseCustomizeSelection(raw: unknown): ScopeGroup[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isScopeGroup)) return null;
  return [...new Set(raw)];
}

export const useCustomizePermissionsSelection = createLocalSetting<readonly ScopeGroup[]>({
  key: CUSTOMIZE_SELECTION_KEY,
  defaultValue: DEFAULT_ON_GROUPS,
  parse: parseCustomizeSelection,
});
