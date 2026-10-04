/**
 * Test-only: the real pinned engine and SDE (ADR 0016) through the real
 * `loadDogmaEngine`, with fetch and Cache Storage stubbed to serve them from
 * node_modules. Callers `vi.unstubAllGlobals()` in their own `afterAll`.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { vi } from 'vitest';
import { loadDogmaEngine, type DogmaEngine } from '../dogmaFittingEngine';

const require = createRequire(import.meta.url);

/** Serves the pinned engine and SDE from node_modules to `loadDogmaEngine`'s fetch. */
export async function stubEngineAssets(): Promise<void> {
  const wasmPath = require.resolve('@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm');
  const sdePath = require.resolve('@eveshipfit/sde/dist/sde.dat');
  const [wasm, sde] = await Promise.all([readFile(wasmPath), readFile(sdePath)]);
  const respond = (bytes: Buffer, type: string) =>
    new Response(new Uint8Array(bytes), {
      headers: { 'content-type': type, 'content-length': String(bytes.byteLength) },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.wasm')) return respond(wasm, 'application/wasm');
      if (url.includes('sde.dat')) return respond(sde, 'application/octet-stream');
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
  const cache = { match: async () => undefined, put: async () => {} };
  vi.stubGlobal('caches', {
    open: async () => cache,
    keys: async () => [],
    delete: async () => false,
  });
}

/** The real engine, ready. */
export async function loadRealDogmaEngine(): Promise<DogmaEngine> {
  await stubEngineAssets();
  return loadDogmaEngine();
}
