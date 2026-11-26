import { ESI_USER_AGENT } from './esiClient.js';
import { INSURGENCY_URL, parseLawlessSystemIds } from './lawlessSystems.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { createR2Put, type R2Put } from './r2Client.js';

export const LAWLESS_SYSTEMS_R2_KEY = 'lawless-systems/systems.json';
const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

export interface PublicLawlessSystemsDeps {
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

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
