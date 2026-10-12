import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';
import { configureClipboard } from '@/lib/clipboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { Communities } from './Communities';

const store = vi.hoisted(() => ({
  loadMyCommunities: vi.fn(),
  loadCommunityMembers: vi.fn(),
  createCommunity: vi.fn(),
  leaveCommunity: vi.fn(),
  deleteCommunity: vi.fn(),
  revokeInvite: vi.fn(),
  regenerateInvite: vi.fn(),
  removeMember: vi.fn(),
  transferAdmin: vi.fn(),
}));
vi.mock('@/features/communities/communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/communities/communityStore')>()),
  ...store,
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));

const c = en.communities;
const ME = 91;
const community = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Pals',
  adminUid: `char:${ME}`,
  inviteCode: 'CODE123',
  memberCount: 2,
  ...over,
});
const members = [
  { uid: `char:${ME}`, characterName: 'Me', joinedAt: 1 },
  { uid: 'char:92', characterName: 'Friend', joinedAt: 2 },
];

function renderPage(path = '/communities') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Communities />
    </MemoryRouter>
  );
}

async function seed() {
  Object.values(store).forEach((fn) => fn.mockReset());
  store.loadMyCommunities.mockResolvedValue([]);
  store.loadCommunityMembers.mockResolvedValue(members);
  await db.characters.clear();
  await db.characters.put({ characterId: ME, name: 'Me', ownerHash: 'h', addedAt: 1 });
  useActiveCharacter.setState({ activeCharacterId: ME, hydrated: true });
}

// The worker's first render of the page, its dialogs and its Toast pays the
// cold module load; do it once here, under its own timeout, so it never lands
// on whichever test happens to run first.
beforeAll(async () => {
  await seed();
  store.loadMyCommunities.mockResolvedValue([community()]);
  configureClipboard(async () => {});
  const view = renderPage('/communities?community=c1');
  // Copy raises the page's Toast, the one piece the other tests meet cold.
  await userEvent.click(await screen.findByRole('button', { name: c.copyLink }));
  await screen.findByText(c.copied, undefined, { timeout: 20_000 });
  view.unmount();
  configureClipboard(null);
}, 30_000);

beforeEach(seed);

describe('Communities page', () => {
  it('shows the empty state when the Character is in no Community', async () => {
    renderPage();
    expect(await screen.findByText(c.empty)).toBeInTheDocument();
  });

  it('creates a Community under the Character’s name and opens it', async () => {
    store.createCommunity.mockResolvedValue({ communityId: 'c1', inviteCode: 'CODE123' });
    store.loadMyCommunities.mockResolvedValueOnce([]).mockResolvedValue([community()]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: c.create }));
    await user.type(screen.getByLabelText(c.nameLabel), '  Pals ');
    await user.click(screen.getByRole('button', { name: c.createAction }));
    await waitFor(() => expect(store.createCommunity).toHaveBeenCalledWith(ME, 'Pals', 'Me'));
    expect(await screen.findByRole('heading', { name: 'Pals' })).toBeInTheDocument();
  });

  it('tells the Character when it is in too many Communities', async () => {
    store.createCommunity.mockRejectedValue({ code: 'functions/resource-exhausted' });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: c.create }));
    await user.type(screen.getByLabelText(c.nameLabel), 'Pals');
    await user.click(screen.getByRole('button', { name: c.createAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent(c.tooMany);
  });

  describe('as admin', () => {
    beforeEach(() => {
      store.loadMyCommunities.mockResolvedValue([community()]);
    });

    it('copies the invite link', async () => {
      const writer = vi.fn(async () => {});
      configureClipboard(writer);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await user.click(await screen.findByRole('button', { name: c.copyLink }));
      expect(writer).toHaveBeenCalledWith(expect.stringContaining('/communities/join/CODE123'));
      expect(await screen.findByText(c.copied)).toBeInTheDocument();
      configureClipboard(null);
    });

    it('regenerates and revokes the link after a confirm', async () => {
      store.regenerateInvite.mockResolvedValue({ inviteCode: 'NEW' });
      store.revokeInvite.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await user.click(await screen.findByRole('button', { name: c.regenerate }));
      const regen = await screen.findByRole('dialog');
      await user.click(within(regen).getByRole('button', { name: c.regenerateAction }));
      await waitFor(() => expect(store.regenerateInvite).toHaveBeenCalledWith(ME, 'c1'));

      await user.click(await screen.findByRole('button', { name: c.revoke }));
      const revoke = await screen.findByRole('dialog');
      await user.click(within(revoke).getByRole('button', { name: c.revokeAction }));
      await waitFor(() => expect(store.revokeInvite).toHaveBeenCalledWith(ME, 'c1'));
    });

    it('offers only Regenerate once the link is revoked', async () => {
      store.loadMyCommunities.mockResolvedValue([community({ inviteCode: null })]);
      renderPage('/communities?community=c1');
      expect(await screen.findByText(c.inviteOff)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: c.copyLink })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: c.regenerate })).toBeInTheDocument();
    });

    it('removes another Member from their ⋮ menu, and gives the admin row none', async () => {
      store.removeMember.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await screen.findByText('Friend');
      expect(screen.getAllByRole('button', { name: /More actions/ })).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: /More actions/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Remove Friend/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: c.removeAction }));
      await waitFor(() => expect(store.removeMember).toHaveBeenCalledWith(ME, 'c1', 'char:92'));
    });

    it('transfers the admin role to another Member', async () => {
      store.transferAdmin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await screen.findByText('Friend');
      await user.click(screen.getByRole('button', { name: /More actions/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Make Friend admin/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: c.makeAdminAction }));
      await waitFor(() => expect(store.transferAdmin).toHaveBeenCalledWith(ME, 'c1', 'char:92'));
    });

    it('deletes the Community and closes it', async () => {
      store.deleteCommunity.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await user.click(await screen.findByRole('button', { name: c.delete }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: c.deleteAction }));
      await waitFor(() => expect(store.deleteCommunity).toHaveBeenCalledWith(ME, 'c1'));
    });
  });

  describe('as a Member', () => {
    beforeEach(() => {
      store.loadMyCommunities.mockResolvedValue([community({ adminUid: 'char:92' })]);
    });

    it('shows no invite link or Member actions, and lets the Character leave', async () => {
      store.leaveCommunity.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await screen.findByText('Friend');
      expect(screen.queryByRole('button', { name: c.copyLink })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: c.leave }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: c.leaveAction }));
      await waitFor(() => expect(store.leaveCommunity).toHaveBeenCalledWith(ME, 'c1'));
    });
  });
});
