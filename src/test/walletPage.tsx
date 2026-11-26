import { beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import * as routeChunks from '@/app/routeChunks';
import { Wallet } from '@/routes/Wallet';
import { LoyaltyStore } from '@/routes/LoyaltyStore';
import { renderPageRoutes } from '@/test/renderPage';

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
  { corporation_id: 1000419, loyalty_points: 250 },
];

export const server = mswServer(
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

export function renderWalletRoute() {
  return renderPageRoutes([
    ['/wallet', <Wallet />],
    ['/wallet/lp-store', <LoyaltyStore />],
    ['/wallet/lp-store/:corporationId', <LoyaltyStore />],
  ]);
}

export function installWalletHarness({ warmApp = false }: { warmApp?: boolean } = {}): void {
  beforeAll(async () => {
    await Promise.all([
      routeChunks.loadWallet(),
      routeChunks.loadLoyaltyStore(),
      ...(warmApp ? [routeChunks.loadLayout()] : []),
    ]);
    await seed();
    const App = warmApp ? (await import('@/app/App')).App : null;
    const { unmount } = App ? render(<App />) : renderWalletRoute();
    await screen.findByText('EverMarks', {}, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  beforeEach(seed);
}
