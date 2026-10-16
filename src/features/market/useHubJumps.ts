/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub (#3878); the slice that implements this file removes it */
/**
 * Jumps between a Hauling lane's two Trade Hubs (issue #3878), by the user's
 * route preference — what the trip rail's profit per jump divides by. Null
 * system ids (an Any hub end) give `none`: each row has its own lane then.
 *
 * CONTRACT STUB — implemented in slice S1.
 */
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';

export type HubJumps =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'known'; jumps: number; preference: RoutePreferenceKind }
  | { status: 'unknown' };

export function useHubJumps(_fromSystemId: number | null, _toSystemId: number | null): HubJumps {
  return { status: 'none' };
}
