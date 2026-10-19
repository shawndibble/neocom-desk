/**
 * The SigV4 reads and uploads to Cloudflare R2's S3-compatible API. Kept free of
 * relative runtime imports so the one-off backfill script can load it under
 * plain Node type stripping (see marketOpenPrices.ts).
 */
import { AwsClient } from 'aws4fetch';

export type R2Put = (
  key: string,
  body: Buffer | string,
  headers: Record<string, string>
) => Promise<void>;

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function connect(config: R2Config): { client: AwsClient; base: string } {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return { client, base: `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}` };
}

export function createR2Put(config: R2Config): R2Put {
  const { client, base } = connect(config);
  return async (key, body, headers) => {
    const response = await client.fetch(`${base}/${key}`, { method: 'PUT', headers, body });
    if (!response.ok) throw new Error(`R2 PUT ${key} failed: ${response.status}`);
  };
}

/** Reads one object as parsed JSON: `null` when it does not exist, a throw on any other failure. */
export type R2Get = (key: string) => Promise<unknown | null>;

export function createR2Get(config: R2Config): R2Get {
  const { client, base } = connect(config);
  return async (key) => {
    const response = await client.fetch(`${base}/${key}`, { method: 'GET' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 GET ${key} failed: ${response.status}`);
    return response.json();
  };
}

/** Deletes one object; a missing one is not an error. */
export type R2Delete = (key: string) => Promise<void>;

export function createR2Delete(config: R2Config): R2Delete {
  const { client, base } = connect(config);
  return async (key) => {
    const response = await client.fetch(`${base}/${key}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 DELETE ${key} failed: ${response.status}`);
    }
  };
}
