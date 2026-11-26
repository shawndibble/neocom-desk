import { parseLazyChunksJson } from '@/app/lazyChunks';

export function lazyChunkUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export async function fetchLazyChunkList(): Promise<string[]> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}lazy-chunks.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return parseLazyChunksJson(await response.json());
  } catch {
    return [];
  }
}

export async function cachedLazyChunks(files: readonly string[]): Promise<Set<string>> {
  const cached = new Set<string>();
  if (typeof caches === 'undefined') return cached;
  await Promise.all(
    files.map(async (file) => {
      try {
        if (await caches.match(lazyChunkUrl(file))) cached.add(file);
      } catch {}
    })
  );
  return cached;
}
