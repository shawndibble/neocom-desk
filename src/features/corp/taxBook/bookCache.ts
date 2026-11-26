import { DAY_MS } from '@/lib/age';
import {
  BOOK_VERSION_FIELD,
  COLLECTION_VERSIONS_FIELD,
} from '../../../../functions/src/corpTaxBookVersionKeys';

export const BOOK_CACHE_MAX_AGE_MS = DAY_MS;

export interface BookVersions {
  book: string;
  collections: Record<string, string>;
}

export function bookVersionsOf(d: Record<string, unknown> | undefined): BookVersions | null {
  const book = d?.[BOOK_VERSION_FIELD];
  if (typeof book !== 'string') return null;
  const raw = d?.[COLLECTION_VERSIONS_FIELD];
  const collections: Record<string, string> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [name, stamp] of Object.entries(raw)) {
      if (typeof stamp === 'string') collections[name] = stamp;
    }
  }
  return { book, collections };
}

export interface Copy {
  version: string;
  at: number;
  data: unknown;
}

export interface PartStore {
  load(slot: string): Promise<Copy | undefined>;
  save(slot: string, copy: Copy): Promise<void>;
  forget(slot: string): Promise<void>;
}

const copies = new Map<string, Map<string, Copy>>();

export function clearBookCache(): void {
  copies.clear();
}

export const forgetMemoryCopies = (key: string): void => void copies.delete(key);

export const memoryCopy = (key: string, slot: string): Copy | undefined =>
  copies.get(key)?.get(slot);

export function setMemoryCopy(key: string, slot: string, copy: Copy | undefined): void {
  if (!copy) copies.get(key)?.delete(slot);
  else {
    if (!copies.has(key)) copies.set(key, new Map());
    copies.get(key)!.set(slot, copy);
  }
}

export async function cachedPart<T>(
  key: string,
  collection: string,
  versions: BookVersions | null,
  read: () => Promise<T>,
  {
    now = Date.now(),
    slot = collection,
    store,
  }: { now?: number; slot?: string; store?: PartStore } = {}
): Promise<T> {
  const version = versions?.collections[collection];
  const fresh = (c: Copy | undefined): c is Copy =>
    version !== undefined &&
    c?.version === version &&
    c.at <= now &&
    now - c.at <= BOOK_CACHE_MAX_AGE_MS;
  let held = copies.get(key)?.get(slot);
  if (!fresh(held) && version !== undefined && store) {
    held = await store.load(slot).catch(() => undefined);
    if (fresh(held)) {
      if (!copies.has(key)) copies.set(key, new Map());
      copies.get(key)!.set(slot, held);
    }
  }
  if (fresh(held)) return structuredClone(held.data as T);
  const data = await read();
  if (version === undefined) {
    copies.get(key)?.delete(slot);
    await store?.forget(slot).catch(() => {});
  } else {
    const copy = { version, at: now, data: structuredClone(data) };
    if (!copies.has(key)) copies.set(key, new Map());
    copies.get(key)!.set(slot, copy);
    await store?.save(slot, copy).catch(() => {});
  }
  return data;
}
