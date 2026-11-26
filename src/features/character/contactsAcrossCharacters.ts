import { db } from '@/db';
import { readCachedRows } from '@/esi/cache';
import type { CharacterContact } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadContacts } from './contacts';

export interface CharacterContactList {
  characterId: number;
  name: string;
  contacts: readonly CharacterContact[];
  truncated: boolean;
  read: boolean;
}

export interface ContactHolder {
  characterId: number;
  name: string;
  contact: CharacterContact;
}

export interface AcrossCharactersRow {
  contactId: number;
  contactType: CharacterContact['contact_type'];
  held: ContactHolder[];
  missing: { characterId: number; name: string }[];
  standings: number[];
  disagrees: boolean;
}

function rowKey(contact: CharacterContact): string {
  return `${contact.contact_type}:${contact.contact_id}`;
}

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
    truncated: rows.get(c.characterId)?.truncated ?? false,
    read: rows.has(c.characterId),
  }));
}

async function loadLive(
  characters: readonly { characterId: number; name: string }[]
): Promise<CharacterContactList[]> {
  const lists: CharacterContactList[] = characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    contacts: [],
    truncated: false,
    read: false,
  }));
  await mapWithConcurrencyLimit(lists, ESI_FANOUT_CONCURRENCY, async (list) => {
    try {
      const { cached } = await loadContacts(list.characterId);
      list.contacts = cached?.data ?? [];
      list.truncated = cached?.truncated ?? false;
      list.read = cached !== null;
    } catch {}
  });
  return lists;
}

export async function loadContactsAcrossCharacters(opts?: {
  live?: boolean;
}): Promise<CharacterContactList[]> {
  const characters = (await db.characters.toArray())
    .sort((a, b) => a.addedAt - b.addedAt)
    .map((c) => ({ characterId: c.characterId, name: c.name }));
  if (characters.length === 0) return [];
  return opts?.live ? loadLive(characters) : loadCacheOnly(characters);
}
