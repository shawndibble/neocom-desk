import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { vi } from 'vitest';
import { loadDogmaEngine, type DogmaEngine } from '../dogmaFittingEngine';

const require = createRequire(import.meta.url);

async function stubEngineAssets(): Promise<void> {
  const wasmPath = require.resolve('@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm');
  const sdePath = require.resolve('@eveshipfit/sde/dist/sde.dat');
  const [wasm, sde, mutaplasmids, typeEffects] = await Promise.all([
    readFile(wasmPath),
    readFile(sdePath),
    readFile(new URL('../../../../public/data/mutaplasmids.json', import.meta.url)),
    readFile(new URL('../../../../public/data/typeEffects.json', import.meta.url)),
  ]);
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
      if (url.includes('mutaplasmids.json')) return respond(mutaplasmids, 'application/json');
      if (url.includes('typeEffects.json')) return respond(typeEffects, 'application/json');
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

export async function loadRealDogmaEngine(): Promise<DogmaEngine> {
  await stubEngineAssets();
  return loadDogmaEngine();
}
