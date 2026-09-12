/**
 * How the two ends of a haul are worded, in the two registers the surfaces
 * need — shared so the table and the detail modal can never disagree about
 * what an unplaced endpoint is called.
 *
 * Both fallback chains are reachable and mean different things. A station
 * whose *system* the snapshot did not resolve still has its own name, which is
 * a better answer than nothing; a location nothing local names at all — a
 * player structure — shows the bare id, the same fallback the item results use
 * for an unnamed type.
 */
import type { CourierEndpoint } from '@/engine/contracts/courierSearch';

/** The station itself, which is what a modal has the width to say. */
export function endpointName(endpoint: CourierEndpoint): string {
  return endpoint.name ?? `#${endpoint.locationId}`;
}

/**
 * The *system*, which is how a haul is read — Jita → Amarr. The full "Jita IV
 * - Moon 4 - Caldari Navy Assembly Plant" costs two lines to say the same
 * thing, so the table column and the modal's own title both name systems and
 * leave the exact station to the modal body.
 */
export function endpointSystemName(endpoint: CourierEndpoint): string {
  return endpoint.systemName ?? endpoint.name ?? `#${endpoint.locationId}`;
}
