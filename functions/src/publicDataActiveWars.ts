import { runActiveWarsSweep, type ActiveWarsDoc } from './activeWarsSweep.js';
import { createR2Get, createR2Put, r2ConfigFromEnv, type R2Get, type R2Put } from './r2Client.js';

export { r2ConfigFromEnv };

export const ACTIVE_WARS_R2_KEY = 'active-wars/wars.json';
export const ACTIVE_WARS_STATE_R2_KEY = 'active-wars/state.json';
const LIST_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};
const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export interface PublicActiveWarsDeps {
  get: R2Get;
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
  budget?: number;
}

export async function publishActiveWars(deps: PublicActiveWarsDeps): Promise<boolean> {
  const outcome = await runActiveWarsSweep({
    fetchImpl: deps.fetchImpl ?? fetch,
    now: deps.now ?? Date.now,
    ...(deps.budget === undefined ? {} : { budget: deps.budget }),
    read: async () => ((await deps.get(ACTIVE_WARS_STATE_R2_KEY)) ?? undefined) as ActiveWarsDoc,
    write: async (doc, { complete }) => {
      if (complete) {
        await deps.put(
          ACTIVE_WARS_R2_KEY,
          JSON.stringify({ updatedAt: doc.updatedAt, wars: doc.wars }),
          LIST_HEADERS
        );
      }
      await deps.put(ACTIVE_WARS_STATE_R2_KEY, JSON.stringify(doc), STATE_HEADERS);
    },
  });
  return outcome !== null;
}

export async function runPublicActiveWars(env: Record<string, string | undefined>): Promise<void> {
  const config = r2ConfigFromEnv(env);
  const written = await publishActiveWars({ get: createR2Get(config), put: createR2Put(config) });
  if (!written) throw new Error('Active wars: ESI would not list wars; nothing published');
}
