/**
 * The kept rows of one review's source, loaded a page at a time and held for the session, so
 * switching back to a source does not read it again. A review's rows never change after the read.
 * The store lives outside React so a page that arrives after its tab was left still lands in the
 * right place, and a second visit never starts a second load of the same cursor.
 */
import type {
  VettingParty,
  VettingRawPage,
  VettingRawRow,
  VettingRawSource,
} from '@/engine/vetting';

/** How long kept rows are served from memory: a role lost or a review deleted is re-checked after. */
export const VETTING_CACHE_TTL_MS = 10 * 60_000;

export interface RawEntry {
  /** When the entry was made: past the TTL it is dropped and read again. */
  at: number;
  rows: readonly VettingRawRow[];
  parties: ReadonlyMap<number, VettingParty>;
  /** The cursor of the next page: undefined before the first, null after the last. */
  next: string | null | undefined;
  running: boolean;
  /** The last page failed; what loaded is kept. */
  error: boolean;
  listeners: Set<() => void>;
}

const entries = new Map<string, RawEntry>();

export const rawKey = (
  characterId: number,
  corporationId: number,
  reviewId: string,
  source: VettingRawSource
) => `${characterId}:${corporationId}:${reviewId}:${source}`;

export function clearVettingRawStore(): void {
  entries.clear();
}

export function rawEntry(key: string): RawEntry {
  let entry = entries.get(key);
  if (entry && !entry.running && Date.now() - entry.at > VETTING_CACHE_TTL_MS) {
    entries.delete(key);
    entry = undefined;
  }
  if (!entry) {
    entry = {
      at: Date.now(),
      rows: [],
      parties: new Map(),
      next: undefined,
      running: false,
      error: false,
      listeners: new Set(),
    };
    entries.set(key, entry);
  }
  return entry;
}

/** Loads every remaining page, in sequence. Does nothing while a load runs or after the last page. */
export function loadRawPages(
  entry: RawEntry,
  fetchPage: (cursor: string | undefined) => Promise<VettingRawPage>
): void {
  if (entry.running || entry.next === null) return;
  entry.running = true;
  entry.error = false;
  const notify = () => entry.listeners.forEach((listener) => listener());
  notify();
  void (async () => {
    try {
      // A cursor seen twice would loop forever: treat it as the end.
      const seen = new Set<string>();
      do {
        const page = await fetchPage(entry.next ?? undefined);
        entry.rows = [...entry.rows, ...page.rows];
        const parties = new Map(entry.parties);
        for (const party of page.parties) parties.set(party.id, party);
        entry.parties = parties;
        const next = page.next ?? null;
        entry.next = next === null || seen.has(next) ? null : next;
        if (next !== null) seen.add(next);
        notify();
      } while (entry.next !== null);
    } catch {
      entry.error = true;
    } finally {
      entry.running = false;
      notify();
    }
  })();
}
