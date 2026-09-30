/**
 * The Command Palette's Contacts group (#2323): every Character's contacts,
 * searchable by name, each opening Public Info.
 *
 * Cache-only end to end — the contact lists and their names are read from
 * what the Contacts page (and every other name lookup) already cached, when
 * the palette opens, so typing never costs a request. A contact whose name
 * has never been resolved on this device is left out rather than fetched.
 */
import { db } from '@/db';
import { readCachedRows } from '@/esi/cache';
import type { CharacterContact } from '@/esi/endpoints';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { readCachedNames } from '@/features/character/names';
import type { PublicInfoKind } from '@/stores/publicInfoModal';
import { rankedSearch } from '@/lib/rankedSearch';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface PaletteContactHolder {
  readonly characterName: string;
  readonly standing: number;
}

export interface PaletteContact {
  readonly kind: PublicInfoKind;
  readonly id: number;
  readonly name: string;
  /** Every Character holding this contact, in the order the Characters were added. */
  readonly holders: readonly PaletteContactHolder[];
}

interface ContactList {
  readonly name: string;
  readonly contacts: readonly CharacterContact[];
}

function isPublicInfoKind(type: CharacterContact['contact_type']): type is PublicInfoKind {
  return type === 'character' || type === 'corporation' || type === 'alliance';
}

/**
 * Pure. One row per contact across every list, keyed on type and id (ids are
 * only unique within a type). Factions have no Public Info window, and a
 * contact with no known name cannot be searched for, so both are dropped.
 */
export function buildPaletteContacts(
  lists: readonly ContactList[],
  names: ReadonlyMap<number, string>
): PaletteContact[] {
  const byKey = new Map<string, PaletteContact & { holders: PaletteContactHolder[] }>();
  for (const list of lists) {
    for (const contact of list.contacts) {
      const kind = contact.contact_type;
      const name = names.get(contact.contact_id);
      if (!isPublicInfoKind(kind) || name === undefined) continue;
      const key = `${kind}:${contact.contact_id}`;
      let row = byKey.get(key);
      if (!row) {
        row = { kind, id: contact.contact_id, name, holders: [] };
        byKey.set(key, row);
      }
      row.holders.push({ characterName: list.name, standing: contact.standing });
    }
  }
  return [...byKey.values()];
}

const CONTACTS_SCOPES = requiredScopesForEndpoints(['getCharacterContacts']);

/**
 * The cached contacts of every Character whose grant covers them, with their
 * cached names. No request, even for a lapsed name — a Character without the
 * scope contributes nothing, so with no grant anywhere the group never shows.
 */
export async function loadPaletteContacts(): Promise<PaletteContact[]> {
  const [characters, tokens] = await Promise.all([db.characters.toArray(), db.tokens.toArray()]);
  const granted = new Set(
    tokens
      .filter((token) => CONTACTS_SCOPES.every((scope) => token.scopes.includes(scope)))
      .map((token) => token.characterId)
  );
  const eligible = characters
    .filter((character) => granted.has(character.characterId))
    .sort((a, b) => a.addedAt - b.addedAt);
  if (eligible.length === 0) return [];

  const rows = await readCachedRows<CharacterContact[]>(
    eligible.map((character) => character.characterId),
    'contacts'
  );
  const lists = eligible.map((character) => ({
    name: character.name,
    contacts: rows.get(character.characterId)?.data ?? [],
  }));
  const names = await readCachedNames(
    lists.flatMap((list) => list.contacts.map((contact) => contact.contact_id))
  );
  return buildPaletteContacts(lists, names);
}

export interface ContactsProviderOptions {
  /** `loadPaletteContacts()`'s answer, read once per opening; empty until it lands. */
  readonly contacts: readonly PaletteContact[];
  readonly onOpen: (kind: PublicInfoKind, id: number) => void;
  /** The row's sublabel: its type and each holder's standing. */
  readonly describe: (contact: PaletteContact) => string;
}

/**
 * Synchronous over the already-loaded list, so no keystroke waits on (or
 * shows "Searching…" for) anything, and an empty list hides the group.
 */
export function createContactsProvider({
  contacts,
  onOpen,
  describe,
}: ContactsProviderOptions): PaletteProvider {
  return {
    id: 'contacts',
    labelKey: 'commandPalette.groups.contacts',
    order: 3,
    minQueryLength: 1,
    search: (query): PaletteResult[] =>
      rankedSearch(contacts, query, { primary: (c) => c.name, limit: GROUP_LIMIT }).map((c) => ({
        id: `${c.kind}:${c.id}`,
        label: c.name,
        sublabel: describe(c),
        run: () => onOpen(c.kind, c.id),
      })),
  };
}
