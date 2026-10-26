/**
 * The active-wars job for the GitHub Actions runner (`scripts/public-data/active-wars.mjs`,
 * `.github/workflows/public-data-active-wars.yml`): runs the sweep and publishes the open
 * list to R2, where the app reads it with a plain fetch. The sweep's bookkeeping
 * lives in a second R2 object next to it.
 */
import { runActiveWarsSweep, type ActiveWarsDoc } from './activeWarsSweep.js';
import { createR2Get, createR2Put, type R2Config, type R2Get, type R2Put } from './r2Client.js';

/** What the app reads: `{ updatedAt, wars }`, what `src/features/wars/activeWars.ts` reads. */
export const ACTIVE_WARS_R2_KEY = 'active-wars/wars.json';
/** The sweep's cursor and the open list it holds; the runner starts from it. */
export const ACTIVE_WARS_STATE_R2_KEY = 'active-wars/state.json';
/** The list moves every 12 h: an hour is the longest a copy is worth keeping. */
const LIST_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};
const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config {
  const missing = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(
    (name) => !env[name]
  );
  if (missing.length > 0) throw new Error(`Missing R2 settings: ${missing.join(', ')}`);
  return {
    endpoint: env.R2_ENDPOINT as string,
    bucket: env.R2_BUCKET as string,
    accessKeyId: env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
  };
}

export interface PublicActiveWarsDeps {
  get: R2Get;
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
  budget?: number;
}

/** Runs one sweep; true when it wrote. */
export async function publishActiveWars(deps: PublicActiveWarsDeps): Promise<boolean> {
  const outcome = await runActiveWarsSweep({
    fetchImpl: deps.fetchImpl ?? fetch,
    now: deps.now ?? Date.now,
    ...(deps.budget === undefined ? {} : { budget: deps.budget }),
    read: async () => ((await deps.get(ACTIVE_WARS_STATE_R2_KEY)) ?? undefined) as ActiveWarsDoc,
    write: async (doc, { complete }) => {
      // No state to start from (the first runs) means a partial list: keep the app on
      // the Firestore doc until the sweep has read back to the horizon.
      // The list first: a failed state write only repeats some reads next run.
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
