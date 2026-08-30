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
