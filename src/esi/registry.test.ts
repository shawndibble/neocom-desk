import { describe, it, expect } from 'vitest';
// Runtime (not type-only) namespace import: the registry itself references
// endpoints.ts only as a type, so this is the test's way of proving at
// runtime what the compiler already enforces at build time.
import * as endpointsModule from './endpoints';
// Raw source of endpoints.ts, for the marker-comment parity check below.
import endpointsSource from './endpoints.ts?raw';
import { ESI_REGISTRY, PUBLIC, type EsiEndpointSpec } from './registry';

/** Names of every exported wrapper function in endpoints.ts. */
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
      // No digits: an interpolated id would show up here instead of a placeholder.
      expect(spec.route, id).toMatch(/^\/[a-z/{}_]*$/);
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
      expect(spec.scope, id).toMatch(/^esi-[a-z_]+\.[a-z_]+\.v\d+$/);
    }
  });
});

describe('parity with the endpoints.ts marker comments', () => {
  // endpoints.ts documents each wrapper with `// --- METHOD /route (scope) ---`,
  // verified against the ESI OpenAPI spec. Pinning the registry against those
  // comments makes the two impossible to drift apart silently.
  // Each match runs from a marker to the wrapper immediately below it, so the
  // route and scope are pinned to a *named* wrapper rather than to an
  // anonymous set — swapping two endpoints' routes has to fail here.
  const markers = [
    ...endpointsSource.matchAll(
      /^\/\/ --- (?:GET|POST) (\S+) \(([^)]+)\) ---$[\s\S]*?^export (?:async )?function (\w+)/gm
    ),
  ].map(([, route, scope, name]) => ({ name, route, scope }));

  it('parses one marker comment per wrapper', () => {
    // Also the proof that the non-greedy match above paired each marker with
    // the right wrapper: a skipped or over-consumed block changes this count.
    expect(markers).toHaveLength(Object.keys(ESI_REGISTRY).length);
  });

  it('matches the route and scope declared for each named wrapper', () => {
    const declared = Object.entries(ESI_REGISTRY).map(([name, spec]) => ({
      name,
      route: (spec as EsiEndpointSpec).route,
      scope: (spec as EsiEndpointSpec).scope,
    }));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    expect(declared.sort(byName)).toEqual([...markers].sort(byName));
  });
});
