import { describe, it, expect } from 'vitest';
import { ESI_REGISTRY } from './registry';
import { ENDPOINT_ROUTES } from './endpointRoutes';

describe('ENDPOINT_ROUTES', () => {
  it('has exactly one entry per registry endpoint', () => {
    expect(Object.keys(ENDPOINT_ROUTES).sort()).toEqual(Object.keys(ESI_REGISTRY).sort());
  });

  it('matches the route template declared in the registry for every endpoint', () => {
    for (const [id, spec] of Object.entries(ESI_REGISTRY)) {
      expect(ENDPOINT_ROUTES[id as keyof typeof ENDPOINT_ROUTES]).toBe(spec.route);
    }
  });

  it('resolves a known endpoint id to its route template', () => {
    expect(ENDPOINT_ROUTES.getCharacterWallet).toBe('/characters/{character_id}/wallet');
  });

  it('resolves a public, unparameterized endpoint id', () => {
    expect(ENDPOINT_ROUTES.getMarketsPrices).toBe('/markets/prices');
  });
});
