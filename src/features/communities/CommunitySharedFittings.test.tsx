import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { uidForCharacter } from '@/sync/uid';

const store = vi.hoisted(() => ({ loadCommunityFittings: vi.fn() }));
vi.mock('./sharedFittings', () => ({ loadCommunityFittings: store.loadCommunityFittings }));

import { CommunitySharedFittings } from './CommunitySharedFittings';

const e = en.communities.everyone;
const ME = uidForCharacter(1);

const fitting = (over: Record<string, unknown>) => ({
  communityId: 'c1',
  id: 'char:2~saved-a',
  ownerUid: 'char:2',
  source: 'saved',
  name: 'Brawl Rifter',
  hull: 'Rifter',
  code: 'code-a',
  updatedAt: 1,
  ...over,
});

const members = [
  { uid: 'char:2', characterName: 'Kara Voss', joinedAt: 1, libraryAsOf: null },
  { uid: ME, characterName: 'Me', joinedAt: 2, libraryAsOf: null },
];

function renderList() {
  render(
    <MemoryRouter>
      <CommunitySharedFittings characterId={1} communityId="c1" members={members} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.loadCommunityFittings.mockResolvedValue([
    fitting({}),
    fitting({
      id: `${ME}~game-9`,
      ownerUid: ME,
      source: 'game',
      name: 'Mining Venture',
      hull: 'Venture',
      code: 'code-v',
    }),
    fitting({ id: 'char:7~saved-z', ownerUid: 'char:7', name: 'Old Fit', hull: 'Merlin' }),
  ]);
});

describe('CommunitySharedFittings', () => {
  it('lists every Member’s Fittings with hull and sharer, each opening the editor', async () => {
    renderList();
    const link = await screen.findByRole('link', { name: /Brawl Rifter/ });
    expect(link).toHaveAttribute('href', '/ships/fittings/edit?f=code-a');
    expect(link).toHaveTextContent('Rifter · Kara Voss');
    expect(screen.getByRole('link', { name: /Mining Venture/ })).toHaveTextContent(
      `Venture · ${en.communities.you}`
    );
    expect(screen.getByRole('link', { name: /Old Fit/ })).toHaveTextContent(
      en.communities.plansDialog.formerMember
    );
  });

  it('narrows by Fitting, hull or sharer', async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(await screen.findByRole('searchbox', { name: e.fittingsSearch }), 'kara');
    expect(screen.getByRole('link', { name: /Brawl Rifter/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mining Venture/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'merlin');
    expect(screen.getByRole('link', { name: /Old Fit/ })).toBeInTheDocument();
  });

  it('matches the sharer as shown, so "you" finds this Character’s own', async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(
      await screen.findByRole('searchbox', { name: e.fittingsSearch }),
      en.communities.you
    );
    expect(screen.getByRole('link', { name: /Mining Venture/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Brawl Rifter/ })).not.toBeInTheDocument();
  });

  it('says so when nothing is shared yet', async () => {
    store.loadCommunityFittings.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(e.noFittings)).toBeInTheDocument();
  });

  it('says so when it cannot load', async () => {
    store.loadCommunityFittings.mockRejectedValue(new Error('offline'));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent(e.fittingsFailed);
  });
});
