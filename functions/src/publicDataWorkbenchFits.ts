import { setTimeout as sleep } from 'node:timers/promises';
import { ESI_USER_AGENT } from './esiClient.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { createR2Get, createR2Put } from './r2Client.js';
import { runWorkbenchSync, type WorkbenchSyncDeps } from './workbenchFits.js';
import { r2WorkbenchStore } from './workbenchFitsStore.js';

const FETCH_BUDGET_MS = 900_000;
const REQUEST_GAP_MS = 250;
const REQUEST_TIMEOUT_MS = 30_000;

export async function runPublicWorkbenchFits(
  env: Record<string, string | undefined>,
  over: Partial<WorkbenchSyncDeps> = {}
) {
  const config = r2ConfigFromEnv(env);
  const result = await runWorkbenchSync({
    store: r2WorkbenchStore({ get: createR2Get(config), put: createR2Put(config) }),
    fetchJson: async (url) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'User-Agent': ESI_USER_AGENT,
          'X-User-Agent': ESI_USER_AGENT,
          Accept: 'application/json',
        },
      });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
    },
    now: Date.now,
    sleep,
    budgetMs: FETCH_BUDGET_MS,
    requestGapMs: REQUEST_GAP_MS,
    ...over,
  });
  console.info('EVE Workbench fits sync', result);
  return result;
}
