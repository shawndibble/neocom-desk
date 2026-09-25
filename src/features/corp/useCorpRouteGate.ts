/**
 * The gate every `/corp*` route mounts behind, so the `CorpAccessState` union
 * is pattern-matched once rather than at each route. `unknown` collapses to
 * `loading`; `none` and `roles-without-grant` collapse to `denied` (corp UI
 * hides, it never locks — CONTEXT.md round 35); `ready` carries the resolved
 * capabilities the caller mounts its real view with.
 *
 * `denied` says why (`CorpDenialReason`): a Corporation Permission that was
 * never granted, or roles that were never checked without one, is fixable
 * from the page with a Grant; `none` and a capability miss on a granted
 * Character are not.
 *
 * A route that needs one capability beyond plain `ready` (`/corp/members`,
 * `/corp/assets`) passes it as `requires`, folding that second check into the
 * same three-way result instead of a second branch at the call site.
 */
import { useCorpAccess } from './useCorpAccess';
import type { CorpCapabilities } from '@/engine/corpRoles';

export type CorpDenialReason = 'not-granted' | 'roles-without-grant' | 'none' | 'capability';

export type CorpRouteGate =
  | { status: 'loading' }
  | { status: 'denied'; reason: CorpDenialReason }
  | { status: 'ready'; capabilities: CorpCapabilities };

export function useCorpRouteGate(
  requires?: (capabilities: CorpCapabilities) => boolean
): CorpRouteGate {
  const { state, capabilities } = useCorpAccess();

  if (state === 'unknown') return { status: 'loading' };
  if (state !== 'ready') return { status: 'denied', reason: state };
  if (requires !== undefined && !requires(capabilities)) {
    return { status: 'denied', reason: 'capability' };
  }
  return { status: 'ready', capabilities };
}
