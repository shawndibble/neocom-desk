/**
 * ESI OAuth scopes for NeoCom Desk v1. Read-only by design (see CONTEXT.md).
 * esi-markets.structure_markets.v1 deliberately excluded: v1 trade hubs are
 * NPC stations only, which need no scope.
 *
 * Not hand-maintained: derived from `registry.ts`, which declares the scope
 * every endpoint wrapper needs. The list used to be copied in three places and
 * had already drifted, so a scope now exists here only because some endpoint
 * asks for it. `e2e/support/fixtureData.ts` re-exports this list too.
 */
import { ESI_REGISTRY, isScopeRequired, type Scope } from './registry';

export type { Scope };

/**
 * Distinct scopes required by the registry, in first-declared order.
 * Order is cosmetic — it only affects the `scope` parameter of the SSO
 * authorize URL, which is order-insensitive.
 */
export const SCOPES: readonly Scope[] = [
  ...new Set(Object.values(ESI_REGISTRY).map((endpoint) => endpoint.scope)),
].filter(isScopeRequired);

/** Space-joined form for the SSO authorize URL `scope` parameter. */
export const SCOPES_STRING: string = SCOPES.join(' ');

/**
 * Scopes present in `previous` but absent from `next` — i.e. the ones the
 * character revoked. Empty when the grant is unchanged or *widened*: adding
 * scopes is not a revocation, and must stay a no-op or shipping a new scope
 * would purge every user's cache on their next login.
 *
 * Takes plain strings, not `Scope`: a JWT's `scp` claim carries whatever CCP
 * put there, and a scope this app does not model (renamed upstream, or granted
 * to the same client elsewhere) must still count as removed. Filtering the
 * result through the registry would re-open the leak it exists to close. By
 * the same reasoning an empty `next` against a populated `previous` reads as a
 * full revocation and purges — that is correct, not a case to guard against.
 *
 * Pure: order-independent, deduplicated, no I/O. The purge itself is Dexie
 * work and lives in `cachePurge.ts`.
 */
export function revokedScopes(previous: readonly string[], next: readonly string[]): string[] {
  const granted = new Set(next);
  return [...new Set(previous)].filter((scope) => !granted.has(scope));
}
