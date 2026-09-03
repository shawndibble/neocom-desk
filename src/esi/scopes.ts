/**
 * ESI OAuth scopes for NeoCom Desk v1. Read-only by design (see CONTEXT.md).
 * esi-markets.structure_markets.v1 deliberately excluded: v1 trade hubs are
 * NPC stations only, which need no scope.
 *
 * Derived from `registry.ts`, never hand-maintained, so a scope is here only
 * because some endpoint asks for it. `e2e/support/fixtureData.ts` re-exports.
 */
import {
  ESI_REGISTRY,
  isScopeRequired,
  type EsiEndpointSpec,
  type Scope,
  type ScopeGroup,
} from './registry';

export type { Scope };

/**
 * Widened to the interface so the optional `group` reads uniformly. Straight
 * off `ESI_REGISTRY` the values are a union of literal object types, only some
 * of which have the field at all.
 */
const SPECS: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

/** Distinct scopes of the endpoints matching `belongs`, in first-declared order. */
function derive(belongs: (spec: EsiEndpointSpec) => boolean): readonly Scope[] {
  return [...new Set(SPECS.filter(belongs).map((spec) => spec.scope))].filter(isScopeRequired);
}

/**
 * What **every** character is asked for at sign-in: the scopes of every
 * endpoint that declares no opt-in group.
 *
 * Grouped scopes are excluded by design (issue #295). Registering a corp
 * endpoint the ordinary way would put "read your corporation's wallets,
 * assets and members" on the consent screen of the ~95% of users who hold no
 * corp role and can never exercise it — a conversion cost paid by everyone
 * for a feature almost nobody uses. `scopesForGroup` supplies the rest, per
 * character, when they ask for it.
 *
 * Order is cosmetic — the SSO authorize URL's `scope` parameter is
 * order-insensitive.
 */
export const SCOPES: readonly Scope[] = derive((spec) => spec.group === undefined);

/**
 * The scopes one opt-in group asks for, derived from the registry exactly as
 * `SCOPES` is — this file stays hand-edit-free (CLAUDE.md).
 *
 * Whole groups are requested rather than individual scopes: a character
 * granting corp access once should not be sent back to SSO the day they gain
 * a second role. `features/corp/corpScopes.ts` still judges *readiness* per
 * capability held, so a Junior_Accountant is `ready` on the wallet scopes
 * alone rather than waiting on ones their roles could never use.
 */
export function scopesForGroup(group: ScopeGroup): readonly Scope[] {
  return derive((spec) => spec.group === group);
}

/** Space-joined form for the SSO authorize URL `scope` parameter. */
export const SCOPES_STRING: string = SCOPES.join(' ');

/**
 * Scopes in `previous` but not `next` — what the character revoked. Empty when
 * the grant is unchanged or *widened*: a wider grant is not a revocation and
 * must stay a no-op, or shipping a new scope would purge every user's cache on
 * their next login.
 *
 * Plain strings, not `Scope`: a JWT's `scp` claim carries whatever CCP put
 * there, and a scope this app does not model (renamed upstream, granted to the
 * same client elsewhere) must still count as removed — filtering through the
 * registry would re-open the leak this closes. By the same reasoning an empty
 * `next` against a populated `previous` is a full revocation and purges.
 *
 * Pure: order-independent, deduplicated, no I/O. Dexie work is in
 * `cachePurge.ts`.
 */
export function revokedScopes(previous: readonly string[], next: readonly string[]): string[] {
  const granted = new Set(next);
  return [...new Set(previous)].filter((scope) => !granted.has(scope));
}
