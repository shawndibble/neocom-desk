import { corpCapabilities, hasAnyCorpCapability } from '@/engine/corpRoles';
import { ESI_REGISTRY, type Scope } from '@/esi/registry';
import type { AlertsRowState } from '@/features/notifications/alertsGrant';
import { corpGrantCoverage, CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { corpRoleLabel } from './roles';

export const CORP_ROLES_SCOPE: Scope = ESI_REGISTRY.getCharacterRoles.scope;

export const CORP_STANDING_SCOPES: readonly Scope[] = [
  ...new Set<Scope>([CORP_ROLES_SCOPE, ...Object.values(CORP_SCOPES_FOR_CAPABILITY).flat()]),
];

export type CorpStanding =
  | { kind: 'notGranted' }
  | { kind: 'none' }
  | { kind: 'roles'; roles: readonly string[]; missingScopes: number };

export function corpStanding({
  rolesScopeGranted,
  roles,
  grantedScopes,
}: {
  rolesScopeGranted: boolean;
  roles: readonly string[] | null;
  grantedScopes: readonly string[];
}): CorpStanding | undefined {
  if (!rolesScopeGranted) return { kind: 'notGranted' };
  if (roles === null) return undefined;
  const capabilityRoles = roles
    .filter((role) => hasAnyCorpCapability(corpCapabilities([role])))
    .sort((a, b) => corpRoleLabel(a).localeCompare(corpRoleLabel(b)));
  if (capabilityRoles.length === 0) return { kind: 'none' };
  const coverage = corpGrantCoverage(corpCapabilities(roles), grantedScopes);
  return { kind: 'roles', roles: capabilityRoles, missingScopes: coverage.missingScopes.length };
}

export function corpRolesRank(standing: CorpStanding | undefined): number | undefined {
  if (!standing) return undefined;
  return standing.kind === 'notGranted' ? 0 : standing.kind === 'roles' ? 1 : 2;
}

export function corpAccessRank(standing: CorpStanding | undefined): number | undefined {
  if (!standing) return undefined;
  if (standing.kind === 'notGranted') return Number.MIN_SAFE_INTEGER;
  if (standing.kind === 'none') return 1;
  return -standing.missingScopes;
}

const ALERTS_RANK: Record<AlertsRowState, number> = { 'needs-reauth': 0, off: 1, on: 2 };

export function alertsWhenClosedRank(state: AlertsRowState): number {
  return ALERTS_RANK[state];
}
