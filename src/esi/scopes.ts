import {
  ESI_REGISTRY,
  isScopeRequired,
  PERMISSIONS,
  SCOPE_GROUPS,
  type EsiEndpointSpec,
  type Scope,
  type ScopeGroup,
} from './registry';

export type { Scope };

const SPECS: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

function derive(belongs: (spec: EsiEndpointSpec) => boolean): readonly Scope[] {
  return [...new Set(SPECS.filter(belongs).map((spec) => spec.scope))].filter(isScopeRequired);
}

export const CORE_GRANT: readonly Scope[] = derive((spec) => spec.group === undefined);

export const DEFAULT_ON_GROUPS: readonly ScopeGroup[] = SCOPE_GROUPS.filter(
  (group) => PERMISSIONS[group].defaultOn
);

export const SCOPES: readonly Scope[] = [
  ...new Set([...CORE_GRANT, ...DEFAULT_ON_GROUPS.flatMap((group) => scopesForGroup(group))]),
];

export function scopesForGroup(group: ScopeGroup): readonly Scope[] {
  return derive((spec) => spec.group === group);
}

const GROUP_BY_SCOPE: ReadonlyMap<string, ScopeGroup> = new Map(
  SPECS.flatMap((spec) =>
    spec.group !== undefined && isScopeRequired(spec.scope)
      ? [[spec.scope, spec.group] as const]
      : []
  )
);

export function permissionForScope(scope: string): ScopeGroup | undefined {
  return GROUP_BY_SCOPE.get(scope);
}

export function isPermissionGranted(group: ScopeGroup, granted: readonly string[]): boolean {
  const held = new Set(granted);
  return scopesForGroup(group).every((scope) => held.has(scope));
}

export function revokedScopes(previous: readonly string[], next: readonly string[]): string[] {
  const granted = new Set(next);
  return [...new Set(previous)].filter((scope) => !granted.has(scope));
}
