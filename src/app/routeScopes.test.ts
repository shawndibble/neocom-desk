import { describe, it, expect } from 'vitest';
// Raw source of the route table, for the "no hand-written route" check below.
import appSource from './App.tsx?raw';
import {
  ROUTE_REQUIREMENTS,
  UNGATED,
  isGatedRoute,
  missingScopesForRoute,
  requiredScopesForRoute,
  routeStringsNamespace,
  type AppRoutePath,
  type RouteRequirement,
} from './routeScopes';
import { SCOPES } from '@/esi/scopes';
import en from '@/i18n/locales/en.json';

const paths = Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[];

describe('scope derivation', () => {
  it('derives a gated route’s scopes from the registry, not from a copied string', () => {
    expect(requiredScopesForRoute('/mail')).toEqual(['esi-mail.read_mail.v1']);
    expect(requiredScopesForRoute('/calendar')).toEqual(['esi-calendar.read_calendar_events.v1']);
    expect(requiredScopesForRoute('/assets')).toEqual(['esi-assets.read_assets.v1']);
    expect(requiredScopesForRoute('/contracts')).toEqual([
      'esi-contracts.read_character_contracts.v1',
    ]);
    expect(requiredScopesForRoute('/orders')).toEqual(['esi-markets.read_character_orders.v1']);
    expect(requiredScopesForRoute('/clones')).toEqual(['esi-clones.read_clones.v1']);
  });

  it('drops PUBLIC endpoints, so a route reading only public data needs nothing', () => {
    // /assets also calls getUniverseStation, postUniverseNames and
    // getUniverseType — all PUBLIC, so exactly one scope survives.
    expect(requiredScopesForRoute('/assets')).toHaveLength(1);
  });

  it('requires nothing for an ungated route, including the character-agnostic Market Browser', () => {
    // /market reads SDE + Fuzzwork only. Login-required and scope-required are
    // different things; the gate must not conflate them.
    expect(requiredScopesForRoute('/market')).toEqual([]);
    expect(requiredScopesForRoute('/overview')).toEqual([]);
    expect(requiredScopesForRoute('/skills')).toEqual([]);
    expect(requiredScopesForRoute('/industry')).toEqual([]);
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
      '/calendar',
      '/clones',
      '/contracts',
      '/mail',
      '/orders',
      '/planetary-industry',
    ]);
  });

  it('each name an i18next namespace that carries the three reauth keys', () => {
    const catalog = en as unknown as Record<string, Record<string, string>>;
    for (const path of paths.filter(isGatedRoute)) {
      const namespace = routeStringsNamespace(path);
      expect(catalog[namespace], namespace).toMatchObject({
        reauthTitle: expect.any(String),
        reauthHint: expect.any(String),
        reauthAction: expect.any(String),
      });
    }
  });

  it('declare only endpoints whose scope requirement is not PUBLIC-only', () => {
    for (const path of paths.filter(isGatedRoute)) {
      expect(requiredScopesForRoute(path).length, path).toBeGreaterThan(0);
    }
  });
});

/**
 * Mirrors `App.tsx`'s `satisfies Record<AppRoutePath, ReactElement>`, which
 * cannot be observed at runtime: one test proves the tables agree, one proves
 * nobody bypassed the table with a hand-written route element.
 */
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
    // Everything outside the gated area, listed deliberately: adding a path
    // here asserts the route needs no Character and no scope.
    const literalPaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    expect(literalPaths.sort()).toEqual(['*', '/', '/callback', '/login', '/styleguide']);
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
