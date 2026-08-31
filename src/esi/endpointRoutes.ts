/**
 * Runtime lookup from endpoint id to its ESI route template — the consumer
 * `registry.ts`'s `route` field lacked. Derived from `ESI_REGISTRY`, never
 * hand-maintained, mirroring `scopes.ts`'s `SCOPES` derivation, so a route
 * changing upstream updates this for free.
 *
 * Templates only, never a built URL: a built URL folds in query parameters
 * and puts ids in the path. This is what an activity log (issue #32) needs
 * to name the endpoint an event came from without inventing a second
 * registry of its own.
 */
import { ESI_REGISTRY, type EsiEndpointId } from './registry';

/** Every endpoint's route template, keyed by id. */
export const ENDPOINT_ROUTES: Readonly<Record<EsiEndpointId, string>> = Object.fromEntries(
  Object.entries(ESI_REGISTRY).map(([id, spec]) => [id, spec.route])
) as Record<EsiEndpointId, string>;
