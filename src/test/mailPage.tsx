import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { DEFAULT_MAIL_FOLDERS, useMailFolders } from '@/features/character/mailFolderPref';
import { useMailScope } from '@/features/character/mailScopePref';
import { resetMailRefreshThrottle } from '@/features/character/mailAll';
import { DESKTOP_QUERY } from '@/lib/useIsDesktop';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { stubViewport } from '@/test/viewport';

// Shared harness for the Mail route tests (src/routes/Mail*.test.tsx), one file
// per concern so CI runs them in parallel. The `vi.mock` calls stay in each test
// file (vitest hoists them per file).

/**
 * jsdom's `matchMedia` stub (`vitest.setup.dom.ts`) never matches, which
 * `useIsDesktop` reads as narrow/phone. The reading-pane header's empty-state
 * acceptance criteria (issue #2104) are asserted at desktop widths (1024px
 * and 1440px both satisfy `min-width: 64rem`), so force that here.
 */
export function useDesktopViewport(): void {
  stubViewport(DESKTOP_QUERY);
}

export const CHAR_ID = 91;
export const CHAR_ID_2 = 92;

export const headers = [
  {
    mail_id: 1,
    from: 90000001,
    subject: 'Fleet up!',
    timestamp: '2026-08-02T00:00:00Z',
    is_read: false,
    labels: [3],
    recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
  },
  {
    mail_id: 2,
    from: 90000002,
    subject: 'Market report',
    timestamp: '2026-08-01T00:00:00Z',
    is_read: true,
    labels: [],
  },
];

export const mailLabels = {
  labels: [
    { label_id: 1, name: 'Inbox', unread_count: 1 },
    { label_id: 2, name: 'Sent', unread_count: 0 },
    { label_id: 3, name: 'Corp', unread_count: 2 },
    { label_id: 4, name: 'Alliance', unread_count: 0 },
  ],
  total_unread_count: 3,
};

export const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.json(headers)),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/labels`, () =>
    HttpResponse.json(mailLabels)
  ),
  http.get('https://esi.evetech.net/characters/:characterId/mail/lists', () =>
    HttpResponse.json([])
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([
      { id: 90000001, name: 'Fleet Commander', category: 'character' },
      { id: 90000002, name: 'Market Bot', category: 'character' },
      { id: 90000003, name: 'Corp Recruiter', category: 'character' },
    ])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1`, () =>
    HttpResponse.json({
      from: 90000001,
      subject: 'Fleet up!',
      body: 'Undock <b>now</b>.',
      read: false,
      recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
    })
  ),
  // Default success for the mark-read write — tests that care about its
  // request body/URL override this per-test.
  http.put(
    'https://esi.evetech.net/characters/:characterId/mail/:mailId/',
    () => new HttpResponse(null, { status: 204 })
  ),
  // No contacts and no affiliation by default — the standing cross-reference
  // tests below override these per-scenario. `:characterId` rather than a
  // literal id: the character-switch test below re-fires this for CHAR_ID_2.
  http.get('https://esi.evetech.net/characters/:characterId/contacts', () => HttpResponse.json([])),
  http.post('https://esi.evetech.net/characters/affiliation', () => HttpResponse.json([]))
);

export function installMailHarness(): void {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    // One throwaway render, so no test pays for the first one. A worker's first
    // `App` render (compiling the lazy Layout and route chunks, warming jsdom
    // and React) took seconds under parallel load and landed on whichever test
    // ran first, tipping it past its findBy / test timeout. Done here under the
    // hook's own budget, as IndustryPlanPage.test.tsx does.
    await Promise.all([routeChunks.loadLayout(), routeChunks.loadMail()]);
    await seed();
    const { unmount } = render(<App />);
    // Wait for real content, not just the shell: the first data load (Dexie, MSW,
    // the ESI cache) is part of the cold cost too.
    await screen.findByText('Fleet up!', {}, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });
  beforeEach(seed);
}

export async function seed() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });
  // Module-scoped store: without this the folder selection one test makes
  // leaks into the next, and `hydrate` short-circuits on `hydrated`.
  useMailFolders.setState({ value: DEFAULT_MAIL_FOLDERS, hydrated: false });
  useMailScope.setState({ value: 'current', hydrated: false });
  resetMailRefreshThrottle();

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-mail.read_mail.v1', 'esi-mail.organize_mail.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/mail');
}

/** The body paragraph 'Undock <b>now</b>.': bold splits its text across elements. */
export const findUndockBody = () =>
  screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === 'Undock now.');
/** Turns off every folder chip except the named ones. */
export async function onlyFolders(user: ReturnType<typeof userEvent.setup>, keep: string[]) {
  const group = screen.getByRole('group', { name: 'Mail folders' });
  for (const chip of within(group).getAllByRole('button')) {
    if (!keep.some((name) => chip.textContent?.startsWith(name))) await user.click(chip);
  }
}

/** A second signed-in Character (CHAR_ID_2) with the mail scopes. */
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
    scopes: ['esi-mail.read_mail.v1', 'esi-mail.organize_mail.v1'],
  });
}
