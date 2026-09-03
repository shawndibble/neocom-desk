/**
 * Which Characters have already been offered the corp grant, so the prompt is
 * offered once and then never re-asks on its own for the same offer (issue
 * #295 AC 5).
 *
 * "The same offer" is load-bearing (issue #331). The corp scope group can
 * grow — it did, in round 41 — and a Character who dismissed the prompt when
 * the group was seven scopes wide has not been offered the eighth. Recording
 * only a Character id answers "has this Character ever seen the prompt,"
 * which is the wrong question; recording the scopes offered at dismissal time
 * answers "has this Character seen *this* offer," and a growing group is
 * structurally a new offer without any version bump or migration step.
 *
 * Device-local, and per Character within the device: an alt who later makes
 * Director deserves its own offer, and a dismissal on the main says nothing
 * about it. Not synced — this is a "you have seen this" flag about one browser,
 * not Editable Data (CONTEXT.md).
 *
 * One `createLocalSetting` key holding a record, rather than a key per
 * Character: the factory is explicit that two stores on one key drift apart,
 * and a key per Character would mean building a store at render time.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { Scope } from '@/esi/registry';

export interface GrantPromptDismissals {
  /** Character id -> the scope set offered when they last dismissed the prompt. */
  offeredScopes: Record<number, readonly Scope[]>;
}

export const CORP_GRANT_PROMPT_SETTING_KEY = 'corp.grantPromptDismissed';

export const NO_DISMISSALS: GrantPromptDismissals = { offeredScopes: {} };

export function parseGrantPromptDismissals(raw: unknown): GrantPromptDismissals | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Partial<GrantPromptDismissals>;
  const offered = candidate.offeredScopes;
  // Also the fallback for the pre-#331 shape (`{ characterIds: number[] }`):
  // that object has no `offeredScopes` field at all, so it lands here and
  // parses as "nothing recorded" — the correct behaviour, since it re-offers
  // exactly the Characters this bug affects (AC 6).
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

/**
 * Dismissed only if what was offered then covers what is on offer now — a
 * superset check, not an equality check. A Character offered A+B who now
 * faces A+B+C is not dismissed for C; a Character offered A+B+C asked about
 * A+B alone is still dismissed, since nothing new is being asked of them.
 */
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

/**
 * A new value recording that `characterId` was offered `offeredScopes` —
 * never a mutation. Replaces any earlier record for the same Character: the
 * latest offer is the only one that matters for future comparisons.
 */
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
