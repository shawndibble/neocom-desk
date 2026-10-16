/**
 * The single resolved answer every corp surface branches on.
 *
 * Corp data is gated on two axes at once — granted scopes (knowable offline
 * from the JWT) and in-game roles (only knowable by asking ESI). Composing them
 * at each call site would mean four states re-derived four ways, so the rule is
 * settled once here and consumers branch on `state`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  corpCapabilities,
  hasAnyCorpCapability,
  NO_CORP_CAPABILITIES,
  type CorpCapabilities,
} from '@/engine/corpRoles';
import { ESI_REGISTRY, type Scope } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { onReconnect } from '@/stores/network';
import { corpWideRoles, loadCharacterRoles } from './roles';
import { missingCorpScopes } from './corpScopes';

/** Read off the registry rather than hand-copied, like every other derived scope constant in this codebase. */
const ROLES_SCOPE: Scope = ESI_REGISTRY.getCharacterRoles.scope;

/**
 * - `unknown` — scopes not resolved yet (the first frames of a cold load)
 * - `not-granted` — resolved, and the scope that reads corp roles has not been
 *   granted, so whether this Character even holds a role is unknowable
 * - `none` — the role read succeeded, and this Character holds no corp role
 * - `roles-without-grant` — holds a role, some other corp scope not granted
 * - `ready` — holds a role and the scopes that role needs are granted
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
  /** Scopes to ask for, for the capabilities this Character actually holds. Empty unless `roles-without-grant`. */
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

/** Roles, tagged with the Character they belong to — see the guard in the memo below. */
interface RolesSnapshot {
  characterId: number;
  roles: readonly string[];
}

export function useCorpAccess(): CorpAccess {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const hasRolesScope = granted !== undefined && granted.includes(ROLES_SCOPE);
  const [snapshot, setSnapshot] = useState<RolesSnapshot | null>(null);
  // The Character whose roles read last failed, so a switch never carries it over.
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setFailedFor(null);
    setAttempt((n) => n + 1);
  }, []);
  const readFailed = failedFor !== null && failedFor === activeCharacterId;
  // A role read that failed offline is tried again when the connection returns.
  useEffect(() => (readFailed ? onReconnect(retry) : undefined), [readFailed, retry]);

  useEffect(() => {
    // Without the roles scope the read is a guaranteed 403 — skip it rather
    // than firing a call this Character can never answer until they opt in.
    if (!hydrated || activeCharacterId === null || !hasRolesScope) return;
    let cancelled = false;
    const settle = (roles: readonly string[]) => {
      if (!cancelled) setSnapshot({ characterId: activeCharacterId, roles });
    };
    // A read that could not complete at all (no live response, nothing cached)
    // leaves the state `unknown` rather than asserting `none`: "this Character
    // holds no corp role" is a claim, and a failed read is no evidence for it.
    // Both render nothing in the nav, so a line member sees no error either
    // way — but a Director who cold-starts offline must not be pinned to `none`
    // for the session by one failed request. `readFailed` lets a `/corp*`
    // route they open say so, with a Retry, instead of spinning for good.
    const fail = () => {
      if (!cancelled) setFailedFor(activeCharacterId);
    };
    void loadCharacterRoles(activeCharacterId).then(({ cached, needsReauth }) => {
      if (cached) settle(corpWideRoles(cached.data));
      // A refused login is not "offline, try again": the app-wide re-login
      // notice (`AuthFailureNotice`) owns that case, so no retry is offered.
      else if (!needsReauth) fail();
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [hydrated, activeCharacterId, hasRolesScope, attempt]);

  const resolved = useMemo<ResolvedCorpAccess>(() => {
    // `useGrantedScopes` answers `undefined` while unknown and `[]` for "granted
    // nothing" — collapsing the two here would offer a re-auth prompt to a
    // Character who may already hold every scope. Keep this in step with
    // `useLockedRoutes`, which reads the same distinction the same way.
    if (granted === undefined) return UNKNOWN_CORP_ACCESS;
    // Known and final: no ESI call happens in this branch, so there is nothing
    // left to wait for.
    if (!hasRolesScope) return NOT_GRANTED_CORP_ACCESS;
    // The id guard is what keeps a previous Character's roles from leaking
    // across a switch: the effect above has already been re-fired for the new
    // id, and until it lands the honest answer is `unknown`.
    if (snapshot === null || snapshot.characterId !== activeCharacterId) return UNKNOWN_CORP_ACCESS;

    const capabilities = corpCapabilities(snapshot.roles);
    const roles = snapshot.roles;
    if (!hasAnyCorpCapability(capabilities)) return { ...NO_CORP_ACCESS, roles };

    const missingScopes = missingCorpScopes(capabilities, granted);
    return {
      state: missingScopes.length === 0 ? 'ready' : 'roles-without-grant',
      capabilities,
      missingScopes,
      roles,
    };
  }, [snapshot, activeCharacterId, granted, hasRolesScope]);

  return useMemo(
    () => ({ ...resolved, readFailed: resolved.state === 'unknown' && readFailed, retry }),
    [resolved, readFailed, retry]
  );
}
