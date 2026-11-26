import { ESI_REGISTRY, type EsiEndpointId } from './registry';

export const ENDPOINT_ROUTES: Readonly<Record<EsiEndpointId, string>> = Object.fromEntries(
  Object.entries(ESI_REGISTRY).map(([id, spec]) => [id, spec.route])
) as Record<EsiEndpointId, string>;
