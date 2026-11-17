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

export interface RawEntry {
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
  if (!entry) {
    entry = {
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
      while (entry.next !== null) {
        const page = await fetchPage(entry.next);
        entry.rows = [...entry.rows, ...page.rows];
        const parties = new Map(entry.parties);
        for (const party of page.parties) parties.set(party.id, party);
        entry.parties = parties;
        entry.next = page.next;
        notify();
      }
    } catch {
      entry.error = true;
    } finally {
      entry.running = false;
      notify();
    }
  })();
}
