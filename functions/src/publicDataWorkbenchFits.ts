/**
 * The EVE Workbench fits job for the GitHub Actions runner
 * (`scripts/public-data/workbench-fits.mjs`, `.github/workflows/public-data-workbench-fits.yml`).
 * It replaces the `syncWorkbenchFits` Cloud Function: same walk (`runWorkbenchSync`), same
 * `workbench-fits/<shipTypeId>.json` objects. The resume checkpoint, which the function kept
 * in Firestore, is an R2 object next to the output. Touches no Firestore.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { ESI_USER_AGENT } from './esiNotifications.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { createR2Get, createR2Put } from './r2Client.js';
import { runWorkbenchSync, type WorkbenchSyncDeps } from './workbenchFits.js';
import { r2WorkbenchStore } from './workbenchFitsStore.js';

/** Fetching stops here; the flush to R2 gets the rest of the workflow's 30 minutes. */
const FETCH_BUDGET_MS = 900_000;
/** ≤ 4 requests a second against a free, unauthenticated API on a shared runner IP. */
const REQUEST_GAP_MS = 250;
/** A hung socket must not run past the fetch budget and lose the unflushed fits to the job timeout. */
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
