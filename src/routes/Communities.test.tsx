import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  loadMailInviteStatus: vi.fn(),
  loadJoinRequests: vi.fn(),
  setRequireApproval: vi.fn(),
  decideJoinRequest: vi.fn(),
}));
vi.mock('@/features/communities/communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/communities/communityStore')>()),
  ...store,
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));
// The content views have their own tests; here each is a marker, so the page's
// own structure (tabs, the sharing line, My sharing, Manage) is what is under test.
vi.mock('@/features/communities/CommunityLibrary', () => ({
  CommunityLibrary: () => <p>everyone-blueprints</p>,
}));
vi.mock('@/features/communities/CommunitySharedFittings', () => ({
  CommunitySharedFittings: () => <p>everyone-fittings</p>,
}));
vi.mock('@/features/communities/CommunitySharedPlans', () => ({
  CommunitySharedPlans: () => <p>everyone-plans</p>,
}));
vi.mock('@/features/communities/ShareBlueprintsTab', () => ({
  ShareBlueprintsTab: () => <p>mine-blueprints</p>,
}));
vi.mock('@/features/communities/ShareFittingsTab', () => ({
  ShareFittingsTab: () => <p>mine-fittings</p>,
}));
vi.mock('@/features/communities/ShareSkillPlansTab', () => ({
  ShareSkillPlansTab: () => <p>mine-plans</p>,
}));

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

/** The router's current search string, on screen for assertions. */
function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(path = '/communities') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Communities />
      <SearchProbe />
    </MemoryRouter>
  );
}

/**
 * Clicks Copy and flushes the clipboard promise inside `act`, then the caller
 * reads the Toast synchronously. The notice lasts 2.5s, so polling for it
 * (`findByText`) can lose to a starved CI worker; nothing here waits on a timer.
 */
/** Opens the admin's Manage menu and picks an item. */
async function pickFromManage(item: string | RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^Manage/ }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

/** The admin's invite controls live in Manage › Invites. */
async function openInvites() {
  await pickFromManage(/^Invites/);
  return screen.findByRole('dialog', { name: c.manage.invitesTitle });
}

async function clickCopy() {
  fireEvent.click(screen.getByRole('button', { name: c.copyLink }));
  await act(async () => {
    await Promise.resolve();
  });
}

async function seed() {
  Object.values(store).forEach((fn) => fn.mockReset());
  store.loadMyCommunities.mockResolvedValue([]);
  store.loadCommunityMembers.mockResolvedValue(members);
  store.loadMailInviteStatus.mockResolvedValue({ remaining: 20, sent: [] });
  store.loadJoinRequests.mockResolvedValue([]);
  await db.characters.clear();
  await db.settings.clear();
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
  await openInvites();
  await screen.findByRole('button', { name: c.copyLink });
  await clickCopy();
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
    await user.click(await screen.findByRole('button', { name: c.createLabel }));
    await user.type(screen.getByLabelText(c.nameLabel), '  Pals ');
    await user.click(screen.getByRole('button', { name: c.createAction }));
    await waitFor(() => expect(store.createCommunity).toHaveBeenCalledWith(ME, 'Pals', 'Me'));
    expect(await screen.findByRole('heading', { name: 'Pals' })).toBeInTheDocument();
  });

  it('tells the Character when it is in too many Communities', async () => {
    store.createCommunity.mockRejectedValue({ code: 'functions/resource-exhausted' });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: c.createLabel }));
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
      renderPage('/communities?community=c1');
      await openInvites();
      await screen.findByRole('button', { name: c.copyLink });
      await clickCopy();
      expect(writer).toHaveBeenCalledWith(expect.stringContaining('/communities/join/CODE123'));
      // The Toast also feeds a live region, so the text can appear twice.
      expect(screen.getAllByText(c.copied).length).toBeGreaterThan(0);
      configureClipboard(null);
    });

    it('regenerates and revokes the link after a confirm', async () => {
      store.regenerateInvite.mockResolvedValue({ inviteCode: 'NEW' });
      store.revokeInvite.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await openInvites();
      await user.click(await screen.findByRole('button', { name: c.regenerate }));
      const regen = await screen.findByRole('dialog', { name: c.regenerateTitle });
      await user.click(within(regen).getByRole('button', { name: c.regenerateAction }));
      await waitFor(() => expect(store.regenerateInvite).toHaveBeenCalledWith(ME, 'c1'));

      await user.click(await screen.findByRole('button', { name: c.revoke }));
      const revoke = await screen.findByRole('dialog', { name: c.revokeTitle });
      // The refetch after the change sees the link revoked, as the backend would.
      store.loadMyCommunities.mockResolvedValue([community({ inviteCode: null })]);
      await user.click(within(revoke).getByRole('button', { name: c.revokeAction }));
      await waitFor(() => expect(store.revokeInvite).toHaveBeenCalledWith(ME, 'c1'));
      // Revoke's own button is gone: focus lands on what the invite controls offer now.
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: c.regenerate }))
      );
    });

    it('offers only Regenerate once the link is revoked', async () => {
      store.loadMyCommunities.mockResolvedValue([community({ inviteCode: null })]);
      renderPage('/communities?community=c1');
      await openInvites();
      expect(await screen.findByText(c.inviteOff)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: c.copyLink })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: c.regenerate })).toBeInTheDocument();
    });

    it('turns approval for new Members on and off from Manage › Invites', async () => {
      store.setRequireApproval.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await openInvites();
      const approve = await screen.findByRole('checkbox', { name: new RegExp(c.approval.title) });
      expect(approve).not.toBeChecked();
      await user.click(approve);
      await waitFor(() => expect(store.setRequireApproval).toHaveBeenCalledWith(ME, 'c1', true));
      await waitFor(() => expect(approve).toBeChecked());
    });

    it('lists the Characters waiting to join, and accepts or declines each', async () => {
      store.loadJoinRequests.mockResolvedValue([
        { uid: 'char:50', characterName: 'Newbie', requestedAt: 1 },
        { uid: 'char:51', characterName: 'Other', requestedAt: 2 },
      ]);
      store.decideJoinRequest.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      // The waiting count shows on Manage, so a request is never out of sight.
      expect(await screen.findByRole('button', { name: 'Manage · 2 waiting' })).toBeInTheDocument();
      await pickFromManage('Invites · 2 waiting');
      const row = (await screen.findByText('Newbie')).closest('li')!;
      await user.click(within(row).getByRole('button', { name: c.requests.accept }));
      await waitFor(() =>
        expect(store.decideJoinRequest).toHaveBeenCalledWith(ME, 'c1', 'char:50', true)
      );
      const other = (await screen.findByText('Other')).closest('li')!;
      await user.click(within(other).getByRole('button', { name: c.requests.decline }));
      await waitFor(() =>
        expect(store.decideJoinRequest).toHaveBeenCalledWith(ME, 'c1', 'char:51', false)
      );
    });

    it('names the cap when accepting is refused', async () => {
      store.loadJoinRequests.mockResolvedValue([
        { uid: 'char:50', characterName: 'Newbie', requestedAt: 1 },
      ]);
      store.decideJoinRequest.mockRejectedValue({
        code: 'functions/resource-exhausted',
        details: { reason: 'community-full' },
      });
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await pickFromManage(/^Invites/);
      await user.click(await screen.findByRole('button', { name: c.requests.accept }));
      expect(await screen.findByText(c.requests.full)).toBeInTheDocument();
    });

    it('removes another Member from their ⋮ menu, and gives the admin row none', async () => {
      store.removeMember.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await user.click(await screen.findByRole('tab', { name: /^Members/ }));
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
      await user.click(await screen.findByRole('tab', { name: /^Members/ }));
      await screen.findByText('Friend');
      await user.click(screen.getByRole('button', { name: /More actions/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Make Friend admin/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: c.makeAdminAction }));
      await waitFor(() => expect(store.transferAdmin).toHaveBeenCalledWith(ME, 'c1', 'char:92'));
    });

    it('transfers the admin role from Manage › Transfer admin', async () => {
      store.transferAdmin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await pickFromManage(c.manage.transfer);
      const picker = await screen.findByRole('dialog', { name: c.manage.transferTitle });
      // The admin is not offered to itself.
      expect(within(picker).queryByText('Me')).not.toBeInTheDocument();
      const row = (await within(picker).findByText('Friend')).closest('li')!;
      await user.click(within(row).getByRole('button', { name: c.makeAdminAction }));
      const confirm = await screen.findByRole('dialog', { name: /Make Friend the admin/ });
      await user.click(within(confirm).getByRole('button', { name: c.makeAdminAction }));
      await waitFor(() => expect(store.transferAdmin).toHaveBeenCalledWith(ME, 'c1', 'char:92'));
    });

    it('deletes the Community and closes it', async () => {
      store.deleteCommunity.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await pickFromManage(c.delete);
      const dialog = await screen.findByRole('dialog', { name: /Delete Pals/ });
      await user.click(within(dialog).getByRole('button', { name: c.deleteAction }));
      await waitFor(() => expect(store.deleteCommunity).toHaveBeenCalledWith(ME, 'c1'));
    });
  });

  describe('content tabs', () => {
    beforeEach(() => {
      store.loadMyCommunities.mockResolvedValue([community()]);
    });

    it('opens on the Blueprints Community Library, with the Member count on its tab', async () => {
      renderPage('/communities?community=c1');
      expect(await screen.findByText('everyone-blueprints')).toBeInTheDocument();
      expect(screen.queryByText('mine-blueprints')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Pals' })).toBeInTheDocument();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        c.tabs.blueprints,
        c.tabs.fittings,
        c.tabs.plans,
        c.tabs.requests,
        c.tabs.payouts,
        `${c.members} 2`,
      ]);
      expect(await screen.findByText(c.sharing.blueprintsNone)).toBeInTheDocument();
    });

    it('says when every blueprint is shared, from the choice on this device', async () => {
      await db.settings.put({ key: `communityShare:${ME}:c1:all`, value: [] });
      renderPage('/communities?community=c1');
      expect(await screen.findByText(c.sharing.blueprintsAll)).toBeInTheDocument();
    });

    it('opens My sharing for the tab over its list, and closes it', async () => {
      const user = userEvent.setup();
      renderPage('/communities?community=c1&tab=fittings');
      expect(await screen.findByText('everyone-fittings')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: c.sharing.open }));
      const panel = await screen.findByRole('dialog', { name: c.sharing.title });
      expect(within(panel).getByText('mine-fittings')).toBeInTheDocument();
      expect(within(panel).getByText(`${c.tabs.fittings} in Pals`)).toBeInTheDocument();
      // The list stays on the page under it.
      expect(screen.getByText('everyone-fittings')).toBeInTheDocument();
      await user.click(within(panel).getByRole('button', { name: en.common.close }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: c.sharing.title })).not.toBeInTheDocument()
      );
      expect(await screen.findByText('everyone-fittings')).toBeInTheDocument();
    });

    it('closes My sharing on the way to Members, which has none', async () => {
      const user = userEvent.setup();
      renderPage('/communities?community=c1&tab=plans&view=mine');
      await screen.findByRole('dialog', { name: c.sharing.title });
      await user.click(screen.getByRole('tab', { name: /^Members/ }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: c.sharing.title })).not.toBeInTheDocument()
      );
      await user.click(screen.getByRole('tab', { name: c.tabs.plans }));
      expect(await screen.findByText('everyone-plans')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: c.sharing.title })).not.toBeInTheDocument();
    });

    it('opens My sharing from an old ?view=mine link', async () => {
      renderPage('/communities?community=c1&tab=plans&view=mine');
      const panel = await screen.findByRole('dialog', { name: c.sharing.title });
      expect(within(panel).getByText('mine-plans')).toBeInTheDocument();
    });

    it('opens Manage › Invites from an old ?tab=invites link, then drops the param', async () => {
      renderPage('/communities?community=c1&tab=invites');
      expect(
        await screen.findByRole('dialog', { name: c.manage.invitesTitle })
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?community=c1'));
      // Still open after the URL changes.
      expect(screen.getByRole('dialog', { name: c.manage.invitesTitle })).toBeInTheDocument();
    });

    it('says there is nobody to transfer to when the admin is the only Member', async () => {
      store.loadCommunityMembers.mockResolvedValue([members[0]]);
      renderPage('/communities?community=c1');
      await pickFromManage(c.manage.transfer);
      const picker = await screen.findByRole('dialog', { name: c.manage.transferTitle });
      expect(await within(picker).findByText(c.manage.transferNobody)).toBeInTheDocument();
    });

    it('offers Retry in Transfer admin when the Members did not load', async () => {
      store.loadCommunityMembers.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderPage('/communities?community=c1');
      await pickFromManage(c.manage.transfer);
      const picker = await screen.findByRole('dialog', { name: c.manage.transferTitle });
      expect(await within(picker).findByRole('alert')).toHaveTextContent(c.membersLoadFailed);
      await user.click(within(picker).getByRole('button', { name: c.retry }));
      expect(await within(picker).findByText('Friend')).toBeInTheDocument();
    });

    it('marks only the Communities the Character admins', async () => {
      store.loadMyCommunities.mockResolvedValue([
        community(),
        community({ id: 'c2', name: 'Other', adminUid: 'char:92' }),
      ]);
      renderPage('/communities');
      const mine = (await screen.findByText('Pals')).closest('button')!;
      const other = screen.getByText('Other').closest('button')!;
      expect(within(mine).getByText(c.adminBadge)).toBeInTheDocument();
      expect(within(other).queryByText(c.adminBadge)).not.toBeInTheDocument();
      expect(within(other).queryByText('Member')).not.toBeInTheDocument();
    });
  });

  describe('switcher', () => {
    it('folds the list into a switcher once a Community is open', async () => {
      store.loadMyCommunities.mockResolvedValue([
        community(),
        community({ id: 'c2', name: 'Other' }),
      ]);
      renderPage('/communities?community=c1');
      expect(await screen.findByRole('combobox', { name: c.switch })).toBeInTheDocument();
      expect(screen.queryByText(c.yourCommunities)).not.toBeInTheDocument();
    });

    it('shows the list, not a switcher, while none is open', async () => {
      store.loadMyCommunities.mockResolvedValue([
        community(),
        community({ id: 'c2', name: 'Other' }),
      ]);
      renderPage('/communities');
      expect(await screen.findByText(c.yourCommunities)).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: c.switch })).not.toBeInTheDocument();
    });
  });

  describe('roster', () => {
    it('offers a name filter only for a long roster', async () => {
      const many = Array.from({ length: 9 }, (_, i) => ({
        uid: `char:${200 + i}`,
        characterName: `Pilot ${i}`,
        joinedAt: i,
      }));
      store.loadMyCommunities.mockResolvedValue([community({ memberCount: 9 })]);
      store.loadCommunityMembers.mockResolvedValue(many);
      const user = userEvent.setup();
      renderPage('/communities?community=c1&tab=members');
      const filter = await screen.findByRole('searchbox', { name: c.memberSearch });
      await user.type(filter, 'pilot 7');
      expect(screen.getByText('Pilot 7')).toBeInTheDocument();
      expect(screen.queryByText('Pilot 3')).not.toBeInTheDocument();
      await user.clear(filter);
      await user.type(filter, 'zzz');
      expect(await screen.findByText(c.noMemberMatch)).toBeInTheDocument();
    });

    it('has no filter on a short roster', async () => {
      store.loadMyCommunities.mockResolvedValue([community()]);
      renderPage('/communities?community=c1&tab=members');
      await screen.findByText('Friend');
      expect(screen.queryByRole('searchbox', { name: c.memberSearch })).not.toBeInTheDocument();
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
      await screen.findByRole('tab', { name: /^Members/ });
      expect(screen.queryByRole('button', { name: /^Manage/ })).not.toBeInTheDocument();
      await user.click(await screen.findByRole('tab', { name: /^Members/ }));
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

describe('Communities page without a connection', () => {
  const offline = new TypeError('Failed to fetch');
  const setOnline = (online: boolean) => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };
  afterEach(() => vi.restoreAllMocks());

  it('saves the list it read, per Character', async () => {
    store.loadMyCommunities.mockResolvedValue([community()]);
    renderPage();
    await screen.findByText('Pals');
    await waitFor(async () =>
      expect((await db.settings.get(`communitySnapshot:${ME}:list`))?.value).toEqual([community()])
    );
  });

  it('shows the last saved list read-only, labelled, with Retry and a disabled Create', async () => {
    await db.settings.put({ key: `communitySnapshot:${ME}:list`, value: [community()] });
    store.loadMyCommunities.mockRejectedValue(offline);
    setOnline(false);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Pals')).toBeInTheDocument();
    expect(screen.getByText(en.common.offlineTitle)).toBeInTheDocument();
    expect(screen.queryByText(c.loadFailed)).not.toBeInTheDocument();
    const create = screen.getByRole('button', { name: c.createLabel });
    expect(create).toHaveAttribute('aria-disabled', 'true');

    // Back online, the live list replaces the saved one.
    store.loadMyCommunities.mockResolvedValue([community({ name: 'Fresh' })]);
    setOnline(true);
    expect(await screen.findByText('Fresh')).toBeInTheDocument();
    expect(screen.queryByText(en.common.offlineTitle)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: c.createLabel }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not show the saved list for a refusal', async () => {
    await db.settings.put({ key: `communitySnapshot:${ME}:list`, value: [community()] });
    store.loadMyCommunities.mockRejectedValue(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    renderPage();
    expect(await screen.findByText(c.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText('Pals')).not.toBeInTheDocument();
  });

  it('forgets a Community’s saved roster when the Character leaves it', async () => {
    await db.settings.put({ key: `communitySnapshot:${ME}:members:c1`, value: members });
    store.loadMyCommunities.mockResolvedValue([community({ adminUid: 'char:92' })]);
    store.leaveCommunity.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage('/communities?community=c1');
    await user.click(await screen.findByRole('tab', { name: /^Members/ }));
    await user.click(await screen.findByRole('button', { name: c.leave }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: c.leaveAction }));
    await waitFor(async () =>
      expect(await db.settings.get(`communitySnapshot:${ME}:members:c1`)).toBeUndefined()
    );
  });

  it('prunes the saved roster of a Community the live list no longer holds', async () => {
    await db.settings.put({ key: `communitySnapshot:${ME}:members:gone`, value: members });
    store.loadMyCommunities.mockResolvedValue([community()]);
    renderPage();
    await screen.findByText('Pals');
    await waitFor(async () =>
      expect(await db.settings.get(`communitySnapshot:${ME}:members:gone`)).toBeUndefined()
    );
  });

  it('does not show another Character’s saved list', async () => {
    await db.settings.put({ key: 'communitySnapshot:5:list', value: [community()] });
    store.loadMyCommunities.mockRejectedValue(offline);
    renderPage();
    expect(await screen.findByText(c.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText('Pals')).not.toBeInTheDocument();
  });

  it('offers Retry when nothing was saved, and loads on the next try', async () => {
    store.loadMyCommunities.mockRejectedValueOnce(offline);
    store.loadMyCommunities.mockResolvedValue([community()]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(c.loadFailed)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.common.retry }));
    expect(await screen.findByText('Pals')).toBeInTheDocument();
  });

  it('opens a Community from the saved list with its saved roster, without Member actions', async () => {
    await db.settings.bulkPut([
      { key: `communitySnapshot:${ME}:list`, value: [community()] },
      { key: `communitySnapshot:${ME}:members:c1`, value: members },
    ]);
    store.loadMyCommunities.mockRejectedValue(offline);
    store.loadCommunityMembers.mockRejectedValue(offline);
    setOnline(false);
    const user = userEvent.setup();
    renderPage('/communities?community=c1');
    await user.click(await screen.findByRole('tab', { name: /^Members/ }));
    expect(await screen.findByText('Friend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Manage/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
