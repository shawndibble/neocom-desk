/**
 * The lawless-systems job for the GitHub Actions runner (`scripts/public-data/lawless-systems.mjs`,
 * `.github/workflows/public-data-lawless-systems.yml`): fetches CCP's insurgency feed and
 * publishes the lawless system ids to R2, where the app reads them with a plain fetch.
 * `syncLawlessSystems` keeps the Firestore doc as the fallback until it is removed.
 */
import { ESI_USER_AGENT } from './esiNotifications.js';
import { INSURGENCY_URL, parseLawlessSystemIds } from './lawlessSystems.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { createR2Put, type R2Put } from './r2Client.js';

/** What the app reads: `{ systemIds, updatedAt }`, the shape of `systemConditions/lawless`. */
export const LAWLESS_SYSTEMS_R2_KEY = 'lawless-systems/systems.json';
/** Runs are 15 minutes apart: five minutes is the longest a CDN copy is worth keeping. */
const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

export interface PublicLawlessSystemsDeps {
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Fetches the feed and publishes it; true when it wrote. Every run writes, so `updatedAt` is "last confirmed". */
export async function publishLawlessSystems(deps: PublicLawlessSystemsDeps): Promise<boolean> {
  const response = await (deps.fetchImpl ?? fetch)(INSURGENCY_URL, {
    headers: {
      'User-Agent': ESI_USER_AGENT,
      'X-User-Agent': ESI_USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return false;
  const body: unknown = await response.json().catch(() => null);
  // A changed or broken body is not "nothing lawless": publish nothing, let the object age.
  if (!Array.isArray(body)) return false;
  const next = { systemIds: parseLawlessSystemIds(body), updatedAt: (deps.now ?? Date.now)() };
  await deps.put(LAWLESS_SYSTEMS_R2_KEY, JSON.stringify(next), HEADERS);
  return true;
}

export async function runPublicLawlessSystems(
  env: Record<string, string | undefined>
): Promise<void> {
  const written = await publishLawlessSystems({ put: createR2Put(r2ConfigFromEnv(env)) });
  if (!written) throw new Error('Lawless systems: the insurgency feed failed; nothing published');
}
