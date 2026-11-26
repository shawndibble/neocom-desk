import { createLocalSetting } from '@/lib/useLocalSetting';
import type { Scope } from '@/esi/registry';

export interface GrantPromptDismissals {
  offeredScopes: Record<number, readonly Scope[]>;
}

export const CORP_GRANT_PROMPT_SETTING_KEY = 'corp.grantPromptDismissed';

export const NO_DISMISSALS: GrantPromptDismissals = { offeredScopes: {} };

export function parseGrantPromptDismissals(raw: unknown): GrantPromptDismissals | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Partial<GrantPromptDismissals>;
  const offered = candidate.offeredScopes;
  if (typeof offered !== 'object' || offered === null || Array.isArray(offered)) return null;
  const entries = Object.entries(offered);
  const parsed: Record<number, readonly Scope[]> = {};
  for (const [key, scopes] of entries) {
    const characterId = Number(key);
    if (!Number.isFinite(characterId)) return null;
    if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) return null;
    parsed[characterId] = scopes as Scope[];
  }
  return { offeredScopes: parsed };
}

export function isGrantPromptDismissed(
  value: GrantPromptDismissals,
  characterId: number,
  currentGroupScopes: readonly Scope[]
): boolean {
  const offered = value.offeredScopes[characterId];
  if (offered === undefined) return false;
  const offeredSet = new Set(offered);
  return currentGroupScopes.every((scope) => offeredSet.has(scope));
}

export function withGrantPromptDismissed(
  value: GrantPromptDismissals,
  characterId: number,
  offeredScopes: readonly Scope[]
): GrantPromptDismissals {
  return {
    offeredScopes: { ...value.offeredScopes, [characterId]: [...offeredScopes] },
  };
}

export const useGrantPromptDismissals = createLocalSetting<GrantPromptDismissals>({
  key: CORP_GRANT_PROMPT_SETTING_KEY,
  defaultValue: NO_DISMISSALS,
  parse: parseGrantPromptDismissals,
});
