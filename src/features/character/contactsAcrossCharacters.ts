/**
 * Every Character's contact list side by side: who each of them knows, and
 * where they disagree.
 *
 * The question this answers is one no single-character view can: you blocked a
 * scammer on your main three months ago and never did it on the hauler alt
 * that actually accepts the contracts.
 *
 * A convenience layer over the existing per-character loader, in the same
 * shape as `roster.ts` — cache-only by default, live on request, never a
 * reimplementation of read-through.
 */
import { db } from '@/db';
import { readCachedRows } from '@/esi/cache';
import type { CharacterContact } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadContacts } from './contacts';

/** One character's list, as the merge below wants it. */
export interface CharacterContactList {
  characterId: number;
  name: string;
  contacts: readonly CharacterContact[];
}

export interface ContactHolder {
  characterId: number;
  name: string;
  /** That character's own entry — its standing, and its blocked/watched flags. */
  contact: CharacterContact;
}

export interface AcrossCharactersRow {
  contactId: number;
  contactType: CharacterContact['contact_type'];
  /** In the order the characters were supplied, so every row reads the same way. */
  held: ContactHolder[];
  missing: { characterId: number; name: string }[];
  /** Distinct standings, ascending. One value means every holder agrees. */
  standings: number[];
  /**
   * Not every character holds it, or the holders set it differently. Always
   * false for a single character: one list cannot disagree with itself, and a
   * pilot flying one character should not be shown a column of warnings.
   */
  disagrees: boolean;
}

function rowKey(contact: CharacterContact): string {
  return `${contact.contact_type}:${contact.contact_id}`;
}

/**
 * Pure. Ids are only unique within a type, so rows are keyed on the pair —
 * the same collision `buildContactStandingIndex` guards against.
 */
export function mergeContactsAcrossCharacters(
  lists: readonly CharacterContactList[]
): AcrossCharactersRow[] {
  const byKey = new Map<string, AcrossCharactersRow>();
  for (const list of lists) {
    for (const contact of list.contacts) {
      const key = rowKey(contact);
      let row = byKey.get(key);
      if (!row) {
        row = {
          contactId: contact.contact_id,
          contactType: contact.contact_type,
          held: [],
          missing: [],
          standings: [],
          disagrees: false,
        };
        byKey.set(key, row);
      }
      row.held.push({ characterId: list.characterId, name: list.name, contact });
    }
  }

  const rows = [...byKey.values()];
  for (const row of rows) {
    const holders = new Set(row.held.map((h) => h.characterId));
    row.missing = lists
      .filter((list) => !holders.has(list.characterId))
      .map((list) => ({ characterId: list.characterId, name: list.name }));
    row.standings = [...new Set(row.held.map((h) => h.contact.standing))].sort((a, b) => a - b);
    row.disagrees = lists.length > 1 && (row.missing.length > 0 || row.standings.length > 1);
  }
  return rows;
}

/** A character with no cached contacts reads as an empty list, not as absent — it is a gap. */
async function loadCacheOnly(
  characters: readonly { characterId: number; name: string }[]
): Promise<CharacterContactList[]> {
  const rows = await readCachedRows<CharacterContact[]>(
    characters.map((c) => c.characterId),
    'contacts'
  );
  return characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    contacts: rows.get(c.characterId)?.data ?? [],
  }));
}

/**
 * One entry per character, capped the way every other fan-out is. A character
 * whose fetch fails keeps whatever the loader could read from cache, and an
 * outright failure leaves it an empty list rather than sinking the page.
 */
async function loadLive(
  characters: readonly { characterId: number; name: string }[]
): Promise<CharacterContactList[]> {
  const lists: CharacterContactList[] = characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    contacts: [],
  }));
  await mapWithConcurrencyLimit(lists, ESI_FANOUT_CONCURRENCY, async (list) => {
    try {
      const { cached } = await loadContacts(list.characterId);
      list.contacts = cached?.data ?? [];
    } catch {
      // Stays empty, which the merge reports as a gap rather than hiding.
    }
  });
  return lists;
}

/** Every Character on the device, in the order they were added. */
export async function loadContactsAcrossCharacters(opts?: {
  live?: boolean;
}): Promise<CharacterContactList[]> {
  const characters = (await db.characters.toArray())
    .sort((a, b) => a.addedAt - b.addedAt)
    .map((c) => ({ characterId: c.characterId, name: c.name }));
  if (characters.length === 0) return [];
  return opts?.live ? loadLive(characters) : loadCacheOnly(characters);
}
