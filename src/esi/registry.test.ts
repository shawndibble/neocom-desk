import { describe, it, expect } from 'vitest';
import * as endpointsModule from './endpoints';
import {
  ESI_REGISTRY,
  PUBLIC,
  permissionsForEndpoints,
  requiredScopesForEndpoints,
  type EsiEndpointSpec,
} from './registry';

const wrapperNames = Object.entries(endpointsModule)
  .filter(([, value]) => typeof value === 'function')
  .map(([name]) => name)
  .sort();

const entries = Object.entries(ESI_REGISTRY) as [string, EsiEndpointSpec][];

describe('ESI_REGISTRY covers endpoints.ts exactly', () => {
  it('has one entry per exported endpoint wrapper', () => {
    expect(Object.keys(ESI_REGISTRY).sort()).toEqual(wrapperNames);
  });

  it('finds a non-trivial number of wrappers (guards the reflection above)', () => {
    expect(wrapperNames.length).toBeGreaterThan(20);
  });
});

describe('route templates', () => {
  it('are unique across the whole registry', () => {
    const routes = entries.map(([, spec]) => spec.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('are absolute paths whose only variables are {snake_case} placeholders', () => {
    for (const [id, spec] of entries) {
      expect(spec.route, id).toMatch(/^\/[a-z/{}_-]*$/);
      for (const placeholder of spec.route.match(/\{[^}]*\}/g) ?? []) {
        expect(placeholder, id).toMatch(/^\{[a-z]+(_[a-z]+)*\}$/);
      }
    }
  });
});

describe('scope declarations', () => {
  it('declares either a well-formed ESI scope or the explicit PUBLIC marker', () => {
    for (const [id, spec] of entries) {
      if (spec.scope === PUBLIC) continue;
      expect(spec.scope, id).toMatch(
        /^(esi-[a-z_]+\.[a-z_]+\.v\d+|esi\.[a-z_]+\.[a-z_]+:[a-z_]+)$/
      );
    }
  });
});

describe('permissionsForEndpoints', () => {
  it('names the one Permission an endpoint belongs to', () => {
    expect(permissionsForEndpoints(['getCharacterMailHeaders'])).toEqual(['mail']);
  });

  it('dedupes across endpoints sharing a Permission', () => {
    expect(permissionsForEndpoints(['getCharacterWallet', 'getCharacterWalletJournal'])).toEqual([
      'wallet',
    ]);
  });

  it('returns nothing for a Core Grant endpoint — there is no Permission to name', () => {
    expect(permissionsForEndpoints(['getCharacterSkills'])).toEqual([]);
  });

  it('returns nothing for a PUBLIC-only endpoint', () => {
    expect(permissionsForEndpoints(['getUniverseStation'])).toEqual([]);
  });

  it('names every distinct Permission across a mixed endpoint list', () => {
    expect(
      [...permissionsForEndpoints(['getCharacterMailHeaders', 'getCharacterContracts'])].sort()
    ).toEqual(['contracts', 'mail']);
  });
});

describe('requiredScopesForEndpoints', () => {
  it('names the scope an endpoint requires', () => {
    expect(requiredScopesForEndpoints(['getCharacterImplants'])).toEqual([
      ESI_REGISTRY.getCharacterImplants.scope,
    ]);
  });

  it('dedupes a scope shared across endpoints', () => {
    expect(requiredScopesForEndpoints(['getCharacterWallet', 'getCharacterWalletJournal'])).toEqual(
      [ESI_REGISTRY.getCharacterWallet.scope]
    );
  });

  it('drops PUBLIC-only endpoints', () => {
    expect(requiredScopesForEndpoints(['getUniverseStation'])).toEqual([]);
  });
});
