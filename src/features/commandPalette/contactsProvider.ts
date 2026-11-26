import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
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
  readonly holders: readonly PaletteContactHolder[];
}

function isPublicInfoKind(type: CharacterContact['contact_type']): type is PublicInfoKind {
  return type === 'character' || type === 'corporation' || type === 'alliance';
}

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

export async function loadPaletteContacts(): Promise<PaletteContact[]> {
  const granted = new Set(await characterIdsWithScopes(CONTACTS_SCOPES));
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
  readonly contacts: readonly PaletteContact[];
  readonly onOpen: (kind: PublicInfoKind, id: number) => void;
  readonly describe: (contact: PaletteContact) => string;
}

export function createContactsProvider({
  contacts,
  onOpen,
  describe,
}: ContactsProviderOptions): PaletteProvider {
  return {
    id: 'contacts',
    labelKey: 'commandPalette.groups.contacts',
    order: 6,
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
