import type { CourierEndpoint } from '@/engine/contracts/courierSearch';

export function endpointName(endpoint: CourierEndpoint): string {
  return endpoint.name ?? `#${endpoint.locationId}`;
}

export function endpointSystemName(endpoint: CourierEndpoint): string {
  return endpoint.systemName ?? endpoint.name ?? `#${endpoint.locationId}`;
}
