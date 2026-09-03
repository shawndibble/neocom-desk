/**
 * Which Characters have already been offered the corp grant, so the prompt is
 * offered once and then never re-asks on its own (issue #295 AC 5).
 *
 * Device-local, and per Character within the device: an alt who later makes
 * Director deserves its own offer, and a dismissal on the main says nothing
 * about it. Not synced — this is a "you have seen this" flag about one browser,
 * not Editable Data (CONTEXT.md).
 *
 * One `createLocalSetting` key holding a list, rather than a key per Character:
 * the factory is explicit that two stores on one key drift apart, and a key
 * per Character would mean building a store at render time.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface GrantPromptDismissals {
  /** Characters that have already been offered the grant, in dismissal order. */
  characterIds: number[];
}

export const CORP_GRANT_PROMPT_SETTING_KEY = 'corp.grantPromptDismissed';

export const NO_DISMISSALS: GrantPromptDismissals = { characterIds: [] };

export function parseGrantPromptDismissals(raw: unknown): GrantPromptDismissals | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Partial<GrantPromptDismissals>;
  if (!Array.isArray(candidate.characterIds)) return null;
  if (!candidate.characterIds.every((id) => typeof id === 'number')) return null;
  return { characterIds: candidate.characterIds };
}

export function isGrantPromptDismissed(value: GrantPromptDismissals, characterId: number): boolean {
  return value.characterIds.includes(characterId);
}

/** A new value with `characterId` recorded — never a mutation, and never a duplicate. */
export function withGrantPromptDismissed(
  value: GrantPromptDismissals,
  characterId: number
): GrantPromptDismissals {
  if (isGrantPromptDismissed(value, characterId)) return value;
  return { characterIds: [...value.characterIds, characterId] };
}

export const useGrantPromptDismissals = createLocalSetting<GrantPromptDismissals>({
  key: CORP_GRANT_PROMPT_SETTING_KEY,
  defaultValue: NO_DISMISSALS,
  parse: parseGrantPromptDismissals,
});
