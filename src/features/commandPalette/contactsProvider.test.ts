import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, writeCached } from '@/esi/cache';
import type { CharacterContact } from '@/esi/endpoints';
import {
  buildPaletteContacts,
  createContactsProvider,
  loadPaletteContacts,
  type PaletteContact,
} from './contactsProvider';
import type { PaletteProvider, PaletteResult } from './types';

const CONTACTS_SCOPE = 'esi-characters.read_contacts.v1';
const signal = new AbortController().signal;

function contact(
  contact_id: number,
  contact_type: CharacterContact['contact_type'],
  standing: number
): CharacterContact {
  return { contact_id, contact_type, standing } as CharacterContact;
}

function answer(provider: PaletteProvider, query: string): readonly PaletteResult[] {
  const result = provider.search(query, signal);
  if (!Array.isArray(result)) throw new Error('contacts answered asynchronously');
  return result as readonly PaletteResult[];
}

describe('buildPaletteContacts', () => {
  it('merges every Character’s list into one row per contact, with each holder’s standing', () => {
    const rows = buildPaletteContacts(
      [
        { name: 'Main', contacts: [contact(10, 'character', 10)] },
        {
          name: 'Alt',
          contacts: [contact(10, 'character', -5), contact(20, 'corporation', 5)],
        },
      ],
      new Map([
        [10, 'Scam Artist'],
        [20, 'Honest Corp'],
      ])
    );
    expect(rows).toEqual<PaletteContact[]>([
      {
        kind: 'character',
        id: 10,
        name: 'Scam Artist',
        holders: [
          { characterName: 'Main', standing: 10 },
          { characterName: 'Alt', standing: -5 },
        ],
      },
      {
        kind: 'corporation',
        id: 20,
        name: 'Honest Corp',
        holders: [{ characterName: 'Alt', standing: 5 }],
      },
    ]);
  });

  it('drops factions (no Public Info for them) and contacts whose name is not cached', () => {
    const rows = buildPaletteContacts(
      [
        {
          name: 'Main',
          contacts: [contact(500001, 'faction', 5), contact(30, 'alliance', 0)],
        },
      ],
      new Map([[500001, 'Caldari State']])
    );
    expect(rows).toEqual([]);
  });
});

describe('createContactsProvider', () => {
  const CONTACTS: PaletteContact[] = [
    {
      kind: 'character',
      id: 10,
      name: 'Scam Artist',
      holders: [
        { characterName: 'Main', standing: 10 },
        { characterName: 'Alt', standing: -5 },
      ],
    },
    {
      kind: 'alliance',
      id: 30,
      name: 'Goonswarm',
      holders: [{ characterName: 'Main', standing: 0 }],
    },
  ];

  function provider(overrides: Partial<Parameters<typeof createContactsProvider>[0]> = {}) {
    return createContactsProvider({
      contacts: CONTACTS,
      onOpen: vi.fn(),
      describe: (c) =>
        `${c.kind} · ${c.holders.map((h) => `${h.standing} ${h.characterName}`).join(', ')}`,
      ...overrides,
    });
  }

  it('finds a contact by part of its name, with its standings in the sublabel', () => {
    const results = answer(provider(), 'scam');
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Scam Artist');
    expect(results[0].sublabel).toBe('character · 10 Main, -5 Alt');
  });

  it('opens Public Info for the entity it names', () => {
    const onOpen = vi.fn();
    const [result] = answer(provider({ onOpen }), 'goon');
    result.run();
    expect(onOpen).toHaveBeenCalledWith('alliance', 30);
  });

  it('answers nothing, so the group hides, before the list has loaded', () => {
    expect(answer(provider({ contacts: [] }), 'scam')).toEqual([]);
  });

  it('is a group only searched once the pilot types', () => {
    expect(provider().minQueryLength).toBe(1);
  });
});

describe('loadPaletteContacts', () => {
  const fetchSpy = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    await Promise.all([db.characters.clear(), db.tokens.clear(), db.esiCache.clear()]);
    await db.characters.bulkPut([
      { characterId: 1, name: 'Main', ownerHash: 'a', addedAt: 1 },
      { characterId: 2, name: 'Alt', ownerHash: 'b', addedAt: 2 },
    ] as never);
    await writeCached(1, 'contacts', [contact(10, 'character', 10)], Date.now());
    await writeCached(2, 'contacts', [contact(20, 'corporation', -10)], Date.now());
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'name:10', 'Scam Artist', Date.now());
    // Lapsed on purpose: a stale name must still not trigger a refresh here.
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'name:20', 'Honest Corp', 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function grant(characterId: number, scopes: string[]) {
    await db.tokens.put({
      characterId,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 60_000,
      scopes,
    });
  }

  it('reads only Characters that granted the contacts scope, from cache alone', async () => {
    await grant(1, [CONTACTS_SCOPE]);
    await grant(2, ['esi-skills.read_skills.v1']);
    const rows = await loadPaletteContacts();
    expect(rows.map((r) => r.name)).toEqual(['Scam Artist']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is empty when no Character granted the scope', async () => {
    await grant(1, []);
    expect(await loadPaletteContacts()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses a lapsed cached name without refreshing it', async () => {
    await grant(1, [CONTACTS_SCOPE]);
    await grant(2, [CONTACTS_SCOPE]);
    const rows = await loadPaletteContacts();
    expect(rows.map((r) => r.name).sort()).toEqual(['Honest Corp', 'Scam Artist']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
