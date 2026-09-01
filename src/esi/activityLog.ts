/**
 * One-way notification of ESI request activity, decoupled from
 * `stores/activityLog.ts` the same way `authFailureSignal.ts` decouples auth
 * failures: `client.ts` must not import zustand or hold UI state
 * (docs/ARCHITECTURE.md §2).
 *
 * `ActivityEvent` is a closed union by construction — `endpointId` is
 * `EsiEndpointId` (`keyof ESI_REGISTRY`) and `outcome` is one of three
 * literals, so an unmodelled event cannot be constructed, let alone logged.
 * It carries only what a support conversation needs: which endpoint, which
 * character, when, and how it went — never a built URL, a query parameter, a
 * token, or ESI's own error text (issue #32).
 */
import type { EsiEndpointId } from './registry';

export type ActivityOutcome = 'success' | 'authFailure' | 'error';

export interface ActivityEvent {
  readonly endpointId: EsiEndpointId;
  /** Absent for a public call — there is no character in play. */
  readonly characterId?: number;
  readonly timestamp: number;
  readonly outcome: ActivityOutcome;
}

type ActivityListener = (event: ActivityEvent) => void;

const listeners = new Set<ActivityListener>();

/** Returns an unsubscribe. */
export function onEsiActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitEsiActivity(event: ActivityEvent): void {
  // A throwing listener must not fail the ESI read that reported it.
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // ignored
    }
  }
}
