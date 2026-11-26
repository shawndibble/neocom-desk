import { describe, it, expect } from 'vitest';
import appSource from './App.tsx?raw';
import {
  ROUTE_REQUIREMENTS,
  UNGATED,
  isGatedRoute,
  missingScopesForRoute,
  permissionsForRoute,
  requiredScopesForRoute,
  type AppRoutePath,
  type RouteRequirement,
} from './routeScopes';
import { SCOPES } from '@/esi/scopes';

const paths = Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[];

describe('scope derivation', () => {
  it('derives a gated route’s scopes from the registry, not from a copied string', () => {
    expect(requiredScopesForRoute('/mail')).toEqual(['esi-mail.read_mail.v1']);
    expect(requiredScopesForRoute('/assets')).toEqual(['esi-assets.read_assets.v1']);
    expect(requiredScopesForRoute('/clones')).toEqual(['esi-clones.read_clones.v1']);
  });

  it('drops PUBLIC endpoints, so a route reading only public data needs nothing', () => {
    expect(requiredScopesForRoute('/assets')).toHaveLength(1);
  });

  it('requires nothing for an ungated route, including the character-agnostic Market Browser', () => {
    expect(requiredScopesForRoute('/market')).toEqual([]);
    expect(requiredScopesForRoute('/overview')).toEqual([]);
    expect(requiredScopesForRoute('/skills')).toEqual([]);
    expect(requiredScopesForRoute('/industry')).toEqual([]);
    expect(requiredScopesForRoute('/contracts')).toEqual([]);
  });

  it('only names scopes the app actually asks for at login', () => {
    for (const path of paths) {
      for (const scope of requiredScopesForRoute(path)) {
        expect(SCOPES, path).toContain(scope);
      }
    }
  });
});

describe('missingScopesForRoute', () => {
  it('is empty when the grant covers the route', () => {
    expect(missingScopesForRoute('/mail', ['esi-mail.read_mail.v1'])).toEqual([]);
  });

  it('names what is absent when it does not', () => {
    expect(missingScopesForRoute('/mail', ['esi-assets.read_assets.v1'])).toEqual([
      'esi-mail.read_mail.v1',
    ]);
  });

  it('never gates an ungated route, even with an empty grant', () => {
    expect(missingScopesForRoute('/market', [])).toEqual([]);
    expect(missingScopesForRoute('/overview', [])).toEqual([]);
  });

  it('is empty for every route when the full SCOPES set is granted', () => {
    for (const path of paths) {
      expect(missingScopesForRoute(path, SCOPES), path).toEqual([]);
    }
  });
});

describe('gated routes', () => {
  it('are exactly the single-scope D3 views', () => {
    expect(paths.filter(isGatedRoute).sort()).toEqual([
      '/assets',
      '/clones',
      '/contacts',
      '/mail',
      '/mining',
      '/wallet/lp-store',
      '/wallet/lp-store/:corporationId',
    ]);
  });

  it('declare only endpoints whose scope requirement is not PUBLIC-only', () => {
    for (const path of paths.filter(isGatedRoute)) {
      expect(requiredScopesForRoute(path).length, path).toBeGreaterThan(0);
    }
  });
});

describe('every route must declare its scope requirement', () => {
  const elementBlock = /const ROUTE_ELEMENTS = \{([\s\S]*?)\n\} satisfies/.exec(appSource)?.[1];

  it('finds the route element table in App.tsx (guards the parsing below)', () => {
    expect(elementBlock).toBeDefined();
  });

  it('declares a requirement for every route App.tsx renders', () => {
    const declared = [...(elementBlock ?? '').matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...paths].sort());
  });

  it('has no hand-written feature <Route path="...">, which would skip both checks', () => {
    const literalPaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    expect(literalPaths.sort()).toEqual([
      '*',
      '/',
      '/apply/:corpId',
      '/callback',
      '/communities/join/:code',
      '/corp-tax-book/remove-now/:code',
      '/corp-tax-book/verify/:token',
      '/error',
      '/login',
      '/s/:shareId',
      '/share/:shareId',
      '/share/fitting',
      '/survey',
    ]);
  });
});

describe('permissionsForRoute', () => {
  it('names the one Permission a gated route’s re-login banner should ask for', () => {
    expect(permissionsForRoute('/mail')).toEqual(['mail']);
    expect(permissionsForRoute('/assets')).toEqual(['assets']);
    expect(permissionsForRoute('/clones')).toEqual(['characterDetails']);
  });

  it('names nothing for an ungated route — no identifiable Permission to ask for (AC 3)', () => {
    expect(permissionsForRoute('/overview')).toEqual([]);
    expect(permissionsForRoute('/market')).toEqual([]);
  });
});

describe('type-level guarantees', () => {
  it('rejects a route table that omits a declared route', () => {
    // @ts-expect-error – missing every route but /characters
    const incomplete: Record<AppRoutePath, RouteRequirement> = { '/characters': UNGATED };
    expect(incomplete).toBeDefined();
  });

  it('closes the route-path union, so an undeclared path is not assignable', () => {
    // @ts-expect-error – '/not-a-route' has no entry in ROUTE_REQUIREMENTS
    const stray: AppRoutePath = '/not-a-route';
    expect(stray).toBe('/not-a-route');
  });
});
