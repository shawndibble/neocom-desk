import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import * as routeChunks from '@/app/routeChunks';
import { mswServer } from '@/test/msw';
import { stubViewport } from '@/test/viewport';
import { Contacts } from '@/routes/Contacts';
import { renderPageRoute } from '@/test/renderPage';

export const CHAR_ID = 91;
export const CHAR_ID_2 = 92;
export const ESI = 'https://esi.evetech.net';

export async function addSecondCharacter() {
  await db.characters.put({
    characterId: CHAR_ID_2,
    name: 'Pilot Two',
    ownerHash: 'oh2',
    addedAt: 2,
  });
  await db.tokens.put({
    characterId: CHAR_ID_2,
    accessToken: 'access-token-2',
    refreshToken: 'refresh-2',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_contacts.v1'],
  });
}

export const contactsPayload = [
  { contact_id: 1001, contact_type: 'character' as const, standing: 10, is_watched: true },
  { contact_id: 1002, contact_type: 'corporation' as const, standing: 0 },
  { contact_id: 1003, contact_type: 'alliance' as const, standing: -10, is_blocked: true },
  { contact_id: 1004, contact_type: 'corporation' as const, standing: -5 },
  { contact_id: 1005, contact_type: 'character' as const, standing: 0 },
];

const affiliationPayload = [
  { character_id: 1001, corporation_id: 2001 },
  { character_id: 1005, corporation_id: 1004 },
  { character_id: CHAR_ID, corporation_id: 2001, alliance_id: 3001 },
];

export async function showAllCharacters() {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'This character' }));
  await user.click(await screen.findByRole('menuitemradio', { name: /^All characters · 2$/ }));
}

export function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
}

export function useNarrowViewport(): void {
  stubViewport(NARROW_QUERY);
}

export const server = mswServer(
  http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.json(contactsPayload)),
  http.post(`${ESI}/characters/affiliation`, () => HttpResponse.json(affiliationPayload)),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 1001, name: 'Good Friend', category: 'character' },
      { id: 1002, name: 'Neutral Corp', category: 'corporation' },
      { id: 1003, name: 'Bad Alliance', category: 'alliance' },
      { id: 1004, name: 'Hostile Corp', category: 'corporation' },
      { id: 1005, name: 'Stranger Pilot', category: 'character' },
      { id: 2001, name: 'Home Corp', category: 'corporation' },
      { id: 3001, name: 'Home Alliance', category: 'alliance' },
    ])
  )
);

async function seed() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_contacts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/contacts');
}

export async function cacheSecondCharacterContacts(contacts: unknown[]) {
  await db.esiCache.put({
    characterId: CHAR_ID_2,
    key: 'contacts',
    value: contacts,
    fetchedAt: Date.now(),
  });
}

export function renderContactsRoute() {
  return renderPageRoute('/contacts', <Contacts />);
}

export function installContactsHarness(): void {
  beforeAll(async () => {
    await routeChunks.loadContacts();
    await seed();
    const { unmount } = renderContactsRoute();
    await screen.findByText('Good Friend', {}, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(seed);
}
