import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { mswServer } from '@/test/msw';
import { stubViewport } from '@/test/viewport';

// Shared harness for the Contacts route tests (src/routes/Contacts*.test.tsx), one
// file per concern so CI runs them in parallel. Each file keeps its own `vi.mock`
// calls (vitest hoists them per file) and calls installContactsHarness() once.

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
  // Stranger Pilot is a 0-standing contact flying for Hostile Corp, which the
  // reader holds at -5 — the "a second entry of yours also covers this pilot"
  // case.
  { contact_id: 1005, contact_type: 'character' as const, standing: 0 },
];

// Good Friend flies for the signed-in pilot's own corp; Stranger Pilot flies
// for Hostile Corp, in no alliance.
export const affiliationPayload = [
  { character_id: 1001, corporation_id: 2001 },
  { character_id: 1005, corporation_id: 1004 },
  { character_id: CHAR_ID, corporation_id: 2001, alliance_id: 3001 },
];

/** Switches the page to every character through the header's character filter. */
export async function showAllCharacters() {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'This character' }));
  await user.click(await screen.findByRole('menuitemradio', { name: /^All characters · 2$/ }));
}

/** Every filter now sits behind the funnel (FilterBar, issue #1282). */
export function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
}

/** Below `md`, `FilterBar` opens its filters in a bottom sheet. */
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

/** Another character's cached contacts: the Across tab compares against it. */
export async function cacheSecondCharacterContacts(contacts: unknown[]) {
  await db.esiCache.put({
    characterId: CHAR_ID_2,
    key: 'contacts',
    value: contacts,
    fetchedAt: Date.now(),
  });
}

/** Registers the cold-render warm-up and the per-test session reset. Call once at module scope. */
export function installContactsHarness(): void {
  beforeAll(async () => {
    // One throwaway render, so no test pays for the first one. A worker's first
    // `App` render (compiling the lazy Layout and route chunks, warming jsdom
    // and React) took seconds under parallel load and landed on whichever test
    // ran first, tipping it past its findBy / test timeout. Done here under the
    // hook's own budget, as IndustryPlanPage.test.tsx does.
    await Promise.all([routeChunks.loadLayout(), routeChunks.loadContacts()]);
    await seed();
    const { unmount } = render(<App />);
    // Wait for real content, not just the shell: the first data load (Dexie, MSW,
    // the ESI cache) is part of the cold cost too.
    await screen.findByText('Good Friend', {}, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(seed);
}
