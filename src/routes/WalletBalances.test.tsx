import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { REQUIRED_SCOPES } from '@/features/netWorth/recordSnapshots';
import { installWalletHarness, renderWalletRoute, CHAR_ID, server } from '@/test/walletPage';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/features/character/walletJournalAll', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/character/walletJournalAll')>();
  return { ...actual, loadAllCharactersJournals: vi.fn(actual.loadAllCharactersJournals) };
});

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({
    '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
    '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  })),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

installWalletHarness();

describe('Wallet', () => {
  describe('cross-character balances (issue #607)', () => {
    const CHAR_B = 92;

    async function seedSecondCharacter() {
      await db.characters.put({
        characterId: CHAR_B,
        name: 'Pilot Two',
        ownerHash: 'oh2',
        addedAt: 2,
      });
      await db.tokens.put({
        characterId: CHAR_B,
        accessToken: 'access-token-b',
        refreshToken: 'refresh-b',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['esi-wallet.read_character_wallet.v1'],
      });
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_B}/wallet`, () =>
          HttpResponse.json(1500)
        )
      );
    }

    async function grantSnapshotScopes(...ids: number[]) {
      for (const id of ids) {
        await db.tokens.update(id, {
          scopes: [...REQUIRED_SCOPES, 'esi-characters.read_loyalty.v1'],
        });
      }
    }

    it('renders no character filter for an account with one Character — nothing for it to change', async () => {
      renderWalletRoute();

      expect(await screen.findByText('EverMarks')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
    });

    it('puts the character filter in the page header, and keeps it there across the panel swap', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      renderWalletRoute();

      await screen.findByText('EverMarks');
      const pageHeader = () => screen.getByRole('heading', { level: 1 }).closest('header')!;
      const panelHeader = screen.getByRole('heading', { name: 'Worth' }).closest('header')!;
      expect(within(panelHeader).queryByRole('button', { name: 'This character' })).toBeNull();
      await user.click(within(pageHeader()).getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      await screen.findByRole('table', { name: 'Balance by character' });
      expect(
        within(pageHeader()).getByRole('button', { name: /^All characters/ })
      ).toBeInTheDocument();
    });

    it("shows only the active character's balance by default — no picker-driven fetch", async () => {
      await seedSecondCharacter();
      renderWalletRoute();

      expect(await screen.findByText('EverMarks')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
      expect(screen.queryByText(/1,500\.00/)).not.toBeInTheDocument();
    });

    it('switching to "All characters" shows every character\'s balance and a total', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      renderWalletRoute();

      await screen.findByText('EverMarks');
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
      expect(await screen.findByText('6,000')).toBeInTheDocument();
    });

    it('drills into a Character from its row as route state, and Back returns to all', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      renderWalletRoute();

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));

      await waitFor(() => expect(window.location.search).toContain('drill=92'));
      expect(screen.queryByRole('table', { name: 'Balance by character' })).toBeNull();

      window.history.back();
      expect(
        await screen.findByRole('table', { name: 'Balance by character' })
      ).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).not.toContain('drill='));
    });

    it('ends a drill when the header picker changes', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      renderWalletRoute();

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));
      await waitFor(() => expect(window.location.search).toContain('drill=92'));

      const pageHeader = screen.getByRole('heading', { level: 1 }).closest('header')!;
      await user.click(within(pageHeader).getByRole('button', { name: /^All characters/ }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'This character' }));

      await waitFor(() => expect(window.location.search).not.toContain('drill='));
      expect(window.location.search).not.toContain('char=all');
      expect(
        within(pageHeader).getByRole('button', { name: 'This character' })
      ).toBeInTheDocument();
      expect(screen.queryByText('Pilot Two only')).not.toBeInTheDocument();
    });

    it('offers no Character picker on the LP Store tab', async () => {
      await seedSecondCharacter();
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      window.history.pushState({}, '', '/wallet/lp-store');
      renderWalletRoute();

      const title = await screen.findByRole('heading', { level: 1, name: 'LP Store' });
      expect(
        within(title.closest('header')!).queryByRole('button', { name: /characters?/i })
      ).toBeNull();
    });

    it('moves focus to the drilled back button, then the Character row, never the body', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      renderWalletRoute();

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));
      await waitFor(() => {
        expect(document.activeElement?.tagName).toBe('BUTTON');
        expect(document.activeElement).toHaveTextContent('All characters');
      });

      await user.click(document.activeElement as HTMLElement);
      await waitFor(() =>
        expect(document.activeElement?.closest('[data-row-key]')).toHaveAttribute(
          'data-row-key',
          '92'
        )
      );
    });

    it('opens on "All characters" when the synced default says so, without the pilot touching the picker', async () => {
      await seedSecondCharacter();
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      renderWalletRoute();

      expect(await screen.findByRole('button', { name: /^All characters/ })).toBeInTheDocument();
      const table = await screen.findByRole('table', { name: 'Balance by character' });
      expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
    });

    it('spins in the picker while the page loads, as Mail and Contracts do', async () => {
      await seedSecondCharacter();
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, async () => {
          await gate;
          return HttpResponse.json(1000);
        })
      );
      renderWalletRoute();

      const picker = await screen.findByRole('button', { name: 'This character' });
      expect(picker).toHaveAttribute('aria-busy', 'true');
      release();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'This character' })).not.toHaveAttribute(
          'aria-busy'
        )
      );
    });

    it('only shows a "hasn\'t granted access" notice for a skipped character actually in the selected filter', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      const CHAR_C = 93;
      await db.characters.put({
        characterId: CHAR_C,
        name: 'Pilot Three',
        ownerHash: 'oh3',
        addedAt: 3,
      });
      renderWalletRoute();

      await screen.findByText('EverMarks');
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      expect(
        await screen.findByRole('button', { name: /^All characters.*Not included: Pilot Three$/ })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('link', { name: 'Grant missing Permissions' })
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^All characters/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));

      expect(
        screen.queryByRole('link', { name: 'Grant missing Permissions' })
      ).not.toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Worth' })).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Balance by character' })).not.toBeInTheDocument();
    });
  });
});
