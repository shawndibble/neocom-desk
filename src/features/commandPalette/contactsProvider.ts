/**
 * The Command Palette's Contacts group (#2323): every Character's contacts,
 * searchable by name, each opening Public Info.
 *
 * Cache-only end to end — the contact lists and their names are read from
 * what the Contacts page (and every other name lookup) already cached, while
 * the palette is open, so typing never costs a request. A contact whose name
 * has never been resolved on this device is left out rather than fetched.
 */
import { db } from '@/db';
import type { CharacterContact } from '@/esi/endpoints';
import { requiredScopesForEndpoints } from '@/esi/registry';
import {
  loadContactsAcrossCharacters,
  mergeContactsAcrossCharacters,
  type AcrossCharactersRow,
} from '@/features/character/contactsAcrossCharacters';
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

function isPublicInfoKind(type: CharacterContact['contact_type']): type is PublicInfoKind {
  return type === 'character' || type === 'corporation' || type === 'alliance';
}

/**
 * Pure. The Contacts page's across-Characters rows, reduced to what the
 * palette can search and open: factions have no Public Info window, and a
 * contact with no known name cannot be searched for, so both are dropped.
 * `names` is keyed by bare id — EVE entity ids are unique across types.
 */
export function buildPaletteContacts(
  rows: readonly AcrossCharactersRow[],
  names: ReadonlyMap<number, string>
): PaletteContact[] {
  const contacts: PaletteContact[] = [];
  for (const row of rows) {
    const kind = row.contactType;
    const name = names.get(row.contactId);
    if (!isPublicInfoKind(kind) || name === undefined) continue;
    contacts.push({
      kind,
      id: row.contactId,
      name,
      holders: row.held.map((holder) => ({
        characterName: holder.name,
        standing: holder.contact.standing,
      })),
    });
  }
  return contacts;
}

const CONTACTS_SCOPES = requiredScopesForEndpoints(['getCharacterContacts']);

/**
 * The cached contacts of every Character whose grant covers them, with their
 * cached names. No request, even for a lapsed name — a Character without the
 * scope contributes nothing, so with no grant anywhere the group never shows.
 */
export async function loadPaletteContacts(): Promise<PaletteContact[]> {
  const tokens = await db.tokens.toArray();
  const granted = new Set(
    tokens
      .filter((token) => CONTACTS_SCOPES.every((scope) => token.scopes.includes(scope)))
      .map((token) => token.characterId)
  );
  if (granted.size === 0) return [];
  const lists = (await loadContactsAcrossCharacters()).filter((list) =>
    granted.has(list.characterId)
  );
  const names = await readCachedNames(
    lists.flatMap((list) => list.contacts.map((contact) => contact.contact_id))
  );
  return buildPaletteContacts(mergeContactsAcrossCharacters(lists), names);
}

export interface ContactsProviderOptions {
  /** `loadPaletteContacts()`'s answer, kept live while the palette is open; empty until it lands. */
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
    order: 5,
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
