import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';

// Shared harness for the Wallet route tests (src/routes/Wallet*.test.tsx), one file
// per concern so CI runs them in parallel. The `vi.mock` calls stay in each test
// file (vitest hoists them per file).

export const CHAR_ID = 91;

export const journalPage1 = [
  {
    id: 1,
    date: '2026-08-02T00:00:00Z',
    ref_type: 'bounty_prize',
    description: 'Bounty',
    amount: 1000,
    balance: 5000,
  },
];
export const journalPage2 = [
  {
    id: 2,
    date: '2026-08-01T00:00:00Z',
    ref_type: 'player_donation',
    description: 'Donation',
    amount: -500,
    balance: 4000,
  },
];

export const loyaltyPayload = [
  { corporation_id: 1000167, loyalty_points: 5000 },
  { corporation_id: 1000419, loyalty_points: 250 }, // Paragon — EverMarks
];

export const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(4500)),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    return HttpResponse.json(page === '2' ? journalPage2 : journalPage1, {
      headers: { 'X-Pages': '2' },
    });
  }),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
    HttpResponse.json(loyaltyPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
    HttpResponse.json([])
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([{ id: 1000167, name: 'Caldari Navy', category: 'corporation' }])
  )
);

export async function seed() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.walletJournalArchive.clear();
  await db.walletTransactionArchive.clear();
  await db.walletArchiveCoverage.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/wallet');
}

export function installWalletHarness(): void {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    // One throwaway render, so no test pays for the first one. A worker's first
    // `App` render (compiling the lazy Layout and route chunks, warming jsdom
    // and React) took seconds under parallel load and landed on whichever test
    // ran first, tipping it past its findBy / test timeout. Done here under the
    // hook's own budget, as IndustryPlanPage.test.tsx does.
    await Promise.all([
      routeChunks.loadLayout(),
      routeChunks.loadWallet(),
      routeChunks.loadLoyaltyStore(),
    ]);
    await seed();
    const { unmount } = render(<App />);
    // Wait for real content, not just the shell: the first data load (Dexie, MSW,
    // the ESI cache) is part of the cold cost too.
    await screen.findByText('EverMarks', {}, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());
  beforeEach(seed);
}
