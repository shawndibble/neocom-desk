/**
 * Enforces a narrowed grant against the ESI mock (issue #1521): `mockEsi.ts`
 * answers 200 to any token, so a spec proving a Core-only Character needs its
 * own route that 403s any endpoint outside the grant it seeded — exactly what
 * a real missing scope does, per `src/esi/client.ts`'s `isAuthFailure`.
 *
 * Registered by the spec itself, after `testBase.ts`'s fixture has already
 * called `installEsiMock` — Playwright tries the most-recently-registered
 * route first, so this one decides first and falls back to the fixture's own
 * 200 responses for anything the grant covers.
 */
import type { Page } from '@playwright/test';
import { ESI_REGISTRY, isScopeRequired } from '../../src/esi/registry';

function routeToRegex(route: string): RegExp {
  const pattern = route
    .split(/(\{[a-z_]+\})/)
    .map((part) => (part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`);
}

/** Every scope-required endpoint's path pattern, derived once from the registry (never hand-copied). */
const SCOPED_ENDPOINTS = Object.values(ESI_REGISTRY)
  .filter((spec) => isScopeRequired(spec.scope))
  .map((spec) => ({ scope: spec.scope, regex: routeToRegex(spec.route) }));

function scopeForPath(pathname: string): string | undefined {
  return SCOPED_ENDPOINTS.find((endpoint) => endpoint.regex.test(pathname))?.scope;
}

/**
 * 403s any ESI request whose endpoint needs a scope outside `granted` — same
 * shape ESI itself returns for a missing scope, which `isAuthFailure` treats
 * as an auth failure. `onUngrantedHit`, if given, is called for every such
 * request, so a spec can assert none happened (e.g. Prefetch/the Foreground
 * Poller must never attempt one).
 */
export async function installScopeGate(
  page: Page,
  granted: readonly string[],
  onUngrantedHit?: (pathname: string, scope: string) => void
): Promise<void> {
  const held = new Set(granted);
  await page.route('https://esi.evetech.net/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const scope = scopeForPath(pathname);
    if (scope !== undefined && !held.has(scope)) {
      onUngrantedHit?.(pathname, scope);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Character does not have required scope: ${scope}` }),
      });
      return;
    }
    await route.fallback();
  });
}
