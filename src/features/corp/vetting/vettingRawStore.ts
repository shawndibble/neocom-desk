import { MINUTE_MS } from '@/lib/age';
import type {
  VettingParty,
  VettingRawPage,
  VettingRawRow,
  VettingRawSource,
} from '@/engine/vetting';

export const VETTING_CACHE_TTL_MS = 10 * MINUTE_MS;

export interface RawEntry {
  at: number;
  rows: readonly VettingRawRow[];
  parties: ReadonlyMap<number, VettingParty>;
  next: string | null | undefined;
  running: boolean;
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
