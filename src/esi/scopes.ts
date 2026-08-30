/**
 * ESI OAuth scopes for NeoCom Desk v1. Read-only by design (see CONTEXT.md).
 * esi-markets.structure_markets.v1 deliberately excluded: v1 trade hubs are
 * NPC stations only, which need no scope.
 *
 * Derived from `registry.ts`, never hand-maintained, so a scope is here only
 * because some endpoint asks for it. `e2e/support/fixtureData.ts` re-exports.
 */
import { ESI_REGISTRY, isScopeRequired, type Scope } from './registry';

export type { Scope };

/**
 * Distinct scopes required by the registry, in first-declared order. Order is
 * cosmetic — the SSO authorize URL's `scope` parameter is order-insensitive.
 */
export const SCOPES: readonly Scope[] = [
  ...new Set(Object.values(ESI_REGISTRY).map((endpoint) => endpoint.scope)),
].filter(isScopeRequired);

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
