import { defineSecret } from 'firebase-functions/params';
import type { R2Config } from './r2Publisher.js';

export const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
export const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');

/**
 * The R2 connection for jobs whose only store is R2 (LP offers, open prices): throws when the config is missing so the run fails
 * loudly.
 */
export function r2ConfigOrThrow(): R2Config {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint?.startsWith('https://') || !bucket) {
    throw new Error('R2_ENDPOINT (https) / R2_BUCKET not set');
  }
  return {
    endpoint,
    bucket,
    accessKeyId: R2_ACCESS_KEY_ID.value(),
    secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
  };
}
