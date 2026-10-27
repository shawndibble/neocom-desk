import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';
import { clearLoginReturnTo, takeLoginReturnTo } from '@/auth/loginReturnTo';
import { loadShareSelection } from '@/features/communities/shareSelection';
import { CommunityJoin } from './CommunityJoin';

vi.mock('@/features/communities/useOwnedBlueprintTypes', () => ({
  useOwnedBlueprintTypes: () => ({
    status: 'ready',
    groups: [{ id: 1, name: 'Ships', parentId: null }],
    owned: [
      { typeId: 10, name: 'Rifter Blueprint', marketGroupId: 1 },
      { typeId: 11, name: 'Merlin Blueprint', marketGroupId: 1 },
    ],
  }),
}));
const store = vi.hoisted(() => ({ previewInvite: vi.fn(), joinCommunity: vi.fn() }));
vi.mock('@/features/communities/communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/communities/communityStore')>()),
  ...store,
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));
const login = vi.hoisted(() => ({ beginAddCharacterLogin: vi.fn(), beginGrant: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginAddCharacterLogin: login.beginAddCharacterLogin }));
vi.mock('@/app/grantAction', () => ({ beginGrant: login.beginGrant }));

const j = en.communities.join;
const BLUEPRINT_SCOPE = 'esi-characters.read_blueprints.v1';
const preview = { name: 'Pals', adminName: 'Boss', memberCount: 7 };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/communities/join/CODE1']}>
      <Routes>
        <Route path="/communities/join/:code" element={<CommunityJoin />} />
        <Route path="/communities" element={<p>communities page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function seedCharacters(withBlueprints: number[], all: number[] = withBlueprints) {
  await db.characters.clear();
  await db.tokens.clear();
  for (const [index, id] of all.entries()) {
    await db.characters.put({
      characterId: id,
      name: `Pilot ${id}`,
      ownerHash: 'h',
      addedAt: index,
    });
    await db.tokens.put({
      characterId: id,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 0,
      scopes: withBlueprints.includes(id) ? [BLUEPRINT_SCOPE] : [],
    });
  }
}

// The worker's first render of the page pays the cold module load; pay it once
// here, under its own timeout, instead of on whichever test runs first.
beforeAll(async () => {
  store.previewInvite.mockResolvedValue(preview);
  await seedCharacters([]);
  const view = renderPage();
  await screen.findByText('Pals');
  view.unmount();
}, 30_000);

beforeEach(async () => {
  store.previewInvite.mockReset().mockResolvedValue(preview);
  store.joinCommunity.mockReset();
  login.beginAddCharacterLogin.mockReset().mockResolvedValue(undefined);
  login.beginGrant.mockReset().mockResolvedValue(undefined);
  clearLoginReturnTo();
  await seedCharacters([]);
  await db.characters.clear();
});

describe('Community invite page', () => {
  it('previews the Community to a signed-out visitor and logs in, returning here', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Pals')).toBeInTheDocument();
    expect(screen.getByText(/Boss/)).toBeInTheDocument();
    expect(screen.getByText('7 Members')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: j.logIn }));
    expect(login.beginAddCharacterLogin).toHaveBeenCalled();
    expect(takeLoginReturnTo()).toBe('/communities/join/CODE1');
  });

  it('says so when the link no longer works', async () => {
    store.previewInvite.mockRejectedValue({ code: 'functions/not-found' });
    renderPage();
    expect(await screen.findByText(j.gone)).toBeInTheDocument();
  });

  it('says so when the preview cannot load', async () => {
    store.previewInvite.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(j.unavailable);
  });

  describe('signed in', () => {
    beforeEach(async () => {
      await seedCharacters([1], [1, 2]);
    });

    it('lists a Character without the blueprints scope as needing permission', async () => {
      const user = userEvent.setup();
      renderPage();
      expect(await screen.findByText(j.needsPermission)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Pilot 2/ })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: /Pilot 1/ })).toBeChecked();
      await user.click(screen.getByRole('button', { name: j.grant }));
      expect(login.beginGrant).toHaveBeenCalledWith(2, ['getCharacterBlueprints']);
      expect(takeLoginReturnTo()).toBe('/communities/join/CODE1');
    });

    it('joins each chosen Character under its own name and opens the Community', async () => {
      store.joinCommunity.mockResolvedValue({ communityId: 'c1', alreadyMember: false });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /Join and share/ }));
      await waitFor(() => expect(store.joinCommunity).toHaveBeenCalledWith(1, 'CODE1', 'Pilot 1'));
      expect(store.joinCommunity).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('communities page')).toBeInTheDocument();
    });

    it('shares nothing by default, and joins sharing what was chosen', async () => {
      store.joinCommunity.mockResolvedValue({ communityId: 'c1', alreadyMember: false });
      const user = userEvent.setup();
      renderPage();
      expect(
        await screen.findByRole('button', { name: 'Join and share 0 blueprints' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Choose what to share \(0\)/ }));
      await user.click(await screen.findByRole('button', { name: en.communities.share.all }));
      const join = await screen.findByRole('button', {
        name: 'Join and share 2 blueprints',
      });
      await user.click(join);
      await waitFor(async () =>
        expect([...(await loadShareSelection(1, 'c1'))].sort()).toEqual([10, 11])
      );
    });

    it('says the admin has to approve, and does not open the Community, when the join waits', async () => {
      store.joinCommunity.mockResolvedValue({
        communityId: 'c1',
        alreadyMember: false,
        pending: true,
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /Join and share/ }));
      expect(await screen.findByText(j.pending)).toBeInTheDocument();
      expect(screen.queryByText('communities page')).not.toBeInTheDocument();
    });

    it('stays on the page and names the cap when a join is refused', async () => {
      store.joinCommunity.mockRejectedValue({
        code: 'functions/resource-exhausted',
        details: { reason: 'community-full' },
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /Join and share/ }));
      expect(await screen.findByText(j.full)).toBeInTheDocument();
      expect(screen.queryByText('communities page')).not.toBeInTheDocument();
    });

    it('lets the visitor add another Character from the same page', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: j.another }));
      expect(login.beginAddCharacterLogin).toHaveBeenCalled();
      expect(takeLoginReturnTo()).toBe('/communities/join/CODE1');
    });
  });
});
