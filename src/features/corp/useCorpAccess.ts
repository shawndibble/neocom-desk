/**
 * The single resolved answer every corp surface branches on.
 *
 * Corp data is gated on two axes at once — granted scopes (knowable offline
 * from the JWT) and in-game roles (only knowable by asking ESI). Composing them
 * at each call site would mean four states re-derived four ways, so the rule is
 * settled once here and consumers branch on `state`.
 */
import { useCallback, useMemo } from 'react';
import {
  corpCapabilities,
  hasAnyCorpCapability,
  NO_CORP_CAPABILITIES,
  type CorpCapabilities,
} from '@/engine/corpRoles';
import { ESI_REGISTRY, type Scope } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { corpWideRoles, loadCharacterRoles } from './roles';
import { corpGrantCoverage } from './corpScopes';

/** Read off the registry rather than hand-copied, like every other derived scope constant in this codebase. */
const ROLES_SCOPE: Scope = ESI_REGISTRY.getCharacterRoles.scope;

/**
 * - `unknown` — scopes not resolved yet (the first frames of a cold load)
 * - `not-granted` — resolved, and the scope that reads corp roles has not been
 *   granted, so whether this Character even holds a role is unknowable
 * - `none` — the role read succeeded, and this Character holds no corp role
 * - `roles-without-grant` — holds a role, some other corp scope not granted
 * - `ready` — holds a role and the scopes that role needs are granted. May
 *   still carry `missingScopes` for an additive capability (`corpScopes.ts`),
 *   which stays off until granted without hiding anything else
 *
 * Only `ready` puts corp UI on screen. Every other state renders nothing at
 * all — no nav item, no tab, no lock — and `unknown` renders the same as
 * `none`, because a nav item that flickers into existence on load is worse
 * than one that appears a beat late (GLOSSARY.md round 35).
 */
export type CorpAccessState = 'unknown' | 'not-granted' | 'none' | 'roles-without-grant' | 'ready';

export interface CorpAccess {
  state: CorpAccessState;
  /** What this Character can see. All false unless `state` is `roles-without-grant` or `ready`. */
  capabilities: CorpCapabilities;
  /**
   * Scopes to ask for, for the capabilities this Character actually holds.
   * Empty unless `roles-without-grant`, or `ready` short of an additive
   * capability's scope (issue #4058).
   */
  missingScopes: readonly Scope[];
  /**
   * The corporation-wide roles ESI reported, raw. Empty while `unknown`, and
   * empty for a Character that genuinely holds none — but *not* empty merely
   * because the state is `none`: a member with only office-scoped or cosmetic
   * roles resolves to `none` and still has roles to name.
   *
   * Exists for the Settings Corporation Permission row, which explains *why* a Character
   * can read what it can. Capabilities cannot say that on their own, and
   * nothing here should compare a role string — that is `engine/corpRoles.ts`.
   */
  roles: readonly string[];
  /**
   * The roles read could not complete (no live response, nothing cached), so
   * `state` is still `unknown` and will stay so until `retry` or the
   * connection returns. Only a `/corp*` route says so (`useCorpRouteGate`);
   * the nav and every other surface keep rendering `unknown` as nothing.
   */
  readFailed: boolean;
  /** Reads the roles again. */
  retry: () => void;
}

type ResolvedCorpAccess = Omit<CorpAccess, 'readFailed' | 'retry'>;

const UNKNOWN_CORP_ACCESS: ResolvedCorpAccess = {
  state: 'unknown',
  capabilities: NO_CORP_CAPABILITIES,
  missingScopes: [],
  roles: [],
};

const NO_CORP_ACCESS: ResolvedCorpAccess = { ...UNKNOWN_CORP_ACCESS, state: 'none' };
const NOT_GRANTED_CORP_ACCESS: ResolvedCorpAccess = {
  ...UNKNOWN_CORP_ACCESS,
  state: 'not-granted',
};

export function useCorpAccess(): CorpAccess {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const hasRolesScope = granted !== undefined && granted.includes(ROLES_SCOPE);
  // Without the roles scope the read is a guaranteed 403 — skip it rather
  // than firing a call this Character can never answer until they opt in.
  const key =
    hydrated && activeCharacterId !== null && hasRolesScope ? `${activeCharacterId}` : null;
  const loader = useCallback(async (): Promise<readonly string[] | null> => {
    if (activeCharacterId === null) return null;
    const { cached, needsReauth } = await loadCharacterRoles(activeCharacterId);
    if (cached) return corpWideRoles(cached.data);
    // A refused login is not "offline, try again": the app-wide re-login
    // notice (`AuthFailureNotice`) owns that case, so no retry is offered.
    if (needsReauth) return null;
    throw new Error('corp roles unavailable');
  }, [activeCharacterId]);
  // A read that could not complete at all (no live response, nothing cached)
  // leaves the state `unknown` rather than asserting `none`: "this Character
  // holds no corp role" is a claim, and a failed read is no evidence for it.
  // Both render nothing in the nav, so a line member sees no error either
  // way — but a Director who cold-starts offline must not be pinned to `none`
  // for the session by one failed request. `readFailed` lets a `/corp*`
  // route they open say so, with a Retry, instead of spinning for good.
  const load = useKeyedLoad(key, loader);
  const readFailed = load.status === 'failed';
  const retry = load.retry;
  // `useKeyedLoad` keeps results per Character, so a switch never leaks the
  // previous Character's roles: until the new read lands the answer is `unknown`.
  const roles = load.status === 'ready' ? load.data : null;

  const resolved = useMemo<ResolvedCorpAccess>(() => {
    // `useGrantedScopes` answers `undefined` while unknown and `[]` for "granted
    // nothing" — collapsing the two here would offer a re-auth prompt to a
    // Character who may already hold every scope. Keep this in step with
    // `useLockedRoutes`, which reads the same distinction the same way.
    if (granted === undefined) return UNKNOWN_CORP_ACCESS;
    // Known and final: no ESI call happens in this branch, so there is nothing
    // left to wait for.
    if (!hasRolesScope) return NOT_GRANTED_CORP_ACCESS;
    if (roles === null) return UNKNOWN_CORP_ACCESS;

    const capabilities = corpCapabilities(roles);
    if (!hasAnyCorpCapability(capabilities)) return { ...NO_CORP_ACCESS, roles };

    const coverage = corpGrantCoverage(capabilities, granted);
    return {
      state: coverage.blocking ? 'roles-without-grant' : 'ready',
      capabilities: coverage.capabilities,
      missingScopes: coverage.missingScopes,
      roles,
    };
  }, [roles, granted, hasRolesScope]);

  return useMemo(
    () => ({ ...resolved, readFailed: resolved.state === 'unknown' && readFailed, retry }),
    [resolved, readFailed, retry]
  );
}
