/**
 * The single resolved answer every corp surface branches on.
 *
 * Corp data is gated on two axes at once — granted scopes (knowable offline
 * from the JWT) and in-game roles (only knowable by asking ESI). Composing them
 * at each call site would mean four states re-derived four ways, so the rule is
 * settled once here and consumers branch on `state`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  corpCapabilities,
  hasAnyCorpCapability,
  NO_CORP_CAPABILITIES,
  type CorpCapabilities,
} from '@/engine/corpRoles';
import type { EsiScopeName } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { corpWideRoles, loadCharacterRoles } from './roles';
import { missingCorpScopes } from './corpScopes';

/**
 * - `unknown` — roles or scopes not resolved yet (the first frames of a cold load)
 * - `none` — resolved, and this Character holds no corp role
 * - `roles-without-grant` — holds a role, corp scopes not granted
 * - `ready` — holds a role and the scopes that role needs are granted
 *
 * Only `ready` puts corp UI on screen. `none` and `roles-without-grant` render
 * nothing at all — no nav item, no tab, no lock — and `unknown` renders as
 * `none` rather than a placeholder, because a nav item that flickers into
 * existence on load is worse than one that appears a beat late (CONTEXT.md
 * round 35).
 */
export type CorpAccessState = 'unknown' | 'none' | 'roles-without-grant' | 'ready';

export interface CorpAccess {
  state: CorpAccessState;
  /** What this Character can see. All false unless `state` is `roles-without-grant` or `ready`. */
  capabilities: CorpCapabilities;
  /** Scopes to ask for, for the capabilities this Character actually holds. Empty unless `roles-without-grant`. */
  missingScopes: readonly EsiScopeName[];
}

const UNKNOWN_CORP_ACCESS: CorpAccess = {
  state: 'unknown',
  capabilities: NO_CORP_CAPABILITIES,
  missingScopes: [],
};

const NO_CORP_ACCESS: CorpAccess = { ...UNKNOWN_CORP_ACCESS, state: 'none' };

/** Roles, tagged with the Character they belong to — see the guard in the memo below. */
interface RolesSnapshot {
  characterId: number;
  roles: readonly string[];
}

export function useCorpAccess(): CorpAccess {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const [snapshot, setSnapshot] = useState<RolesSnapshot | null>(null);

  useEffect(() => {
    if (!hydrated || activeCharacterId === null) return;
    let cancelled = false;
    const settle = (roles: readonly string[]) => {
      if (!cancelled) setSnapshot({ characterId: activeCharacterId, roles });
    };
    // A read that could not complete at all (no live response, nothing cached)
    // leaves the state `unknown` rather than asserting `none`: "this Character
    // holds no corp role" is a claim, and a failed read is no evidence for it.
    // Both render nothing, so a line member sees no error either way — but a
    // Director who cold-starts offline must not be pinned to `none` for the
    // session by one failed request. There is deliberately no error state.
    void loadCharacterRoles(activeCharacterId).then(
      ({ cached }) => {
        if (cached) settle(corpWideRoles(cached.data));
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, activeCharacterId]);

  return useMemo(() => {
    // The id guard is what keeps a previous Character's roles from leaking
    // across a switch: the effect above has already been re-fired for the new
    // id, and until it lands the honest answer is `unknown`.
    if (snapshot === null || snapshot.characterId !== activeCharacterId) return UNKNOWN_CORP_ACCESS;
    // `useGrantedScopes` answers `undefined` while unknown and `[]` for "granted
    // nothing" — collapsing the two here would offer a re-auth prompt to a
    // Character who may already hold every scope. Keep this in step with
    // `useLockedRoutes`, which reads the same distinction the same way.
    if (granted === undefined) return UNKNOWN_CORP_ACCESS;

    const capabilities = corpCapabilities(snapshot.roles);
    if (!hasAnyCorpCapability(capabilities)) return NO_CORP_ACCESS;

    const missingScopes = missingCorpScopes(capabilities, granted);
    return {
      state: missingScopes.length === 0 ? 'ready' : 'roles-without-grant',
      capabilities,
      missingScopes,
    };
  }, [snapshot, activeCharacterId, granted]);
}
