import type { Page } from '@playwright/test';
import { ESI_REGISTRY, isScopeRequired } from '../../src/esi/registry';

function routeToRegex(route: string): RegExp {
  const pattern = route
    .split(/(\{[a-z_]+\})/)
    .map((part) => (part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`);
}

const SCOPED_ENDPOINTS = Object.values(ESI_REGISTRY)
  .filter((spec) => isScopeRequired(spec.scope))
  .map((spec) => ({ scope: spec.scope, regex: routeToRegex(spec.route) }));

function scopeForPath(pathname: string): string | undefined {
  return SCOPED_ENDPOINTS.find((endpoint) => endpoint.regex.test(pathname))?.scope;
}

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
