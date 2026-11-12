/**
 * One Character's corporation standing as the Characters table reads it
 * (issue #6092): which capability-giving roles it holds and how far its grant
 * covers them. Composes `corpCapabilities` and `corpGrantCoverage` — no role
 * or grant logic of its own — for every Character at once, where
 * `useCorpAccess` answers for the active one only.
 */
import { corpCapabilities, hasAnyCorpCapability } from '@/engine/corpRoles';
import { ESI_REGISTRY, type Scope } from '@/esi/registry';
import type { AlertsRowState } from '@/features/notifications/alertsGrant';
import { corpGrantCoverage, CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { corpRoleLabel } from './roles';

/** Read off the registry rather than hand-copied, like every other derived scope constant in this codebase. */
export const CORP_ROLES_SCOPE: Scope = ESI_REGISTRY.getCharacterRoles.scope;

/** Every scope the standing reads: the roles read plus each capability's scopes. */
export const CORP_STANDING_SCOPES: readonly Scope[] = [
  ...new Set<Scope>([CORP_ROLES_SCOPE, ...Object.values(CORP_SCOPES_FOR_CAPABILITY).flat()]),
];

export type CorpStanding =
  /** The roles scope is not granted, so whether a role is held is unknowable. */
  | { kind: 'notGranted' }
  /** No role that opens a Corp Capability. */
  | { kind: 'none' }
  /** The capability-giving roles held (ESI spelling, display-sorted), and the corp scopes the grant still lacks. */
  | { kind: 'roles'; roles: readonly string[]; missingScopes: number };

/**
 * Undefined while unknown: the roles scope is granted but the roles have not
 * been read (still loading, or the read failed with nothing cached).
 */
export function corpStanding({
  rolesScopeGranted,
  roles,
  grantedScopes,
}: {
  rolesScopeGranted: boolean;
  /** The corporation-wide roles; null when not read. */
  roles: readonly string[] | null;
  grantedScopes: readonly string[];
}): CorpStanding | undefined {
  if (!rolesScopeGranted) return { kind: 'notGranted' };
  if (roles === null) return undefined;
  // A role "gives a capability" when it alone opens one — the Corp Capability
  // rule, not a hand-kept list of role names (GLOSSARY.md: Corp Capability).
  const capabilityRoles = roles
    .filter((role) => hasAnyCorpCapability(corpCapabilities([role])))
    .sort((a, b) => corpRoleLabel(a).localeCompare(corpRoleLabel(b)));
  if (capabilityRoles.length === 0) return { kind: 'none' };
  const coverage = corpGrantCoverage(corpCapabilities(roles), grantedScopes);
  return { kind: 'roles', roles: capabilityRoles, missingScopes: coverage.missingScopes.length };
}

/** Ascending puts the gaps first: not granted, then role holders, then no role. */
export function corpRolesRank(standing: CorpStanding | undefined): number | undefined {
  if (!standing) return undefined;
  return standing.kind === 'notGranted' ? 0 : standing.kind === 'roles' ? 1 : 2;
}

/** Ascending puts the gaps first: not granted, then most scopes missing, then ready, then no role. */
export function corpAccessRank(standing: CorpStanding | undefined): number | undefined {
  if (!standing) return undefined;
  if (standing.kind === 'notGranted') return Number.MIN_SAFE_INTEGER;
  if (standing.kind === 'none') return 1;
  return -standing.missingScopes;
}

const ALERTS_RANK: Record<AlertsRowState, number> = { 'needs-reauth': 0, off: 1, on: 2 };

/** Ascending puts the gaps first: needs re-authorizing, then off, then on. */
export function alertsWhenClosedRank(state: AlertsRowState): number {
  return ALERTS_RANK[state];
}
