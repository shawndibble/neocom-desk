import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { uidForCharacter } from '@/sync/uid';
import { CommunityLibrary } from './CommunityLibrary';

const l = en.communities.library;
const NOW = Date.UTC(2026, 9, 12);
const DAY = 24 * 60 * 60 * 1000;

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: async () => [{ id: 1, name: 'Ships', parentId: null }],
  loadMarketTypes: async () => [
    { typeId: 10, marketGroupId: 1 },
    { typeId: 11, marketGroupId: 1 },
  ],
}));
vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: async () => ({
    '10': { name: 'Rifter Blueprint' },
    '11': { name: 'Merlin Blueprint' },
  }),
}));
vi.mock('./communityStore', () => ({
  loadMemberLibraries: async () => [
    {
      uid: 'ann',
      items: [
        { typeId: 10, me: 0, te: 0, runs: -1, locationName: 'Jita IV', systemName: 'Jita' },
        { typeId: 10, me: 10, te: 20, runs: 7, locationName: 'Efa VII', systemName: 'Efa' },
      ],
    },
  ],
}));

const members = [
  { uid: 'ann', characterName: 'Ann', joinedAt: 1, libraryAsOf: NOW - 40 * DAY },
  { uid: uidForCharacter(1), characterName: 'Me', joinedAt: 2, libraryAsOf: null },
];

function renderLibrary() {
  return render(
    <MemoryRouter>
      <CommunityLibrary
        communityId="c1"
        characterId={1}
        members={members}
        membersFailed={false}
        now={NOW}
      />
    </MemoryRouter>
  );
}

beforeAll(async () => {
  renderLibrary().unmount();
}, 30_000);

describe('CommunityLibrary', () => {
  it('opens on each shared blueprint with its owner, place, ME / TE and runs', async () => {
    renderLibrary();
    expect(
      await screen.findByRole('button', { name: new RegExp(l.shared), pressed: true })
    ).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: l.sharedLabel }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    expect(rows.find((text) => text?.includes('Jita IV'))).toMatch(
      /Rifter Blueprint.*Ann.*Jita IV.*Jita.*0 \/ 0.*BPO/
    );
    expect(rows.find((text) => text?.includes('Efa VII'))).toMatch(/10 \/ 20.*7 runs/);
  });

  it('narrows the shared blueprints by Member, station or system', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('table', { name: l.sharedLabel });
    await user.type(screen.getByRole('searchbox', { name: l.search }), 'efa');
    const table = screen.getByRole('table', { name: l.sharedLabel });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).queryByText('Jita IV')).not.toBeInTheDocument();
  });

  it('missing from the Community lists what nobody holds', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(await screen.findByRole('button', { name: new RegExp(l.missingCommunity) }));
    await user.click(await screen.findByRole('button', { name: /Ships/ }));
    expect(screen.getByText('Merlin Blueprint')).toBeInTheDocument();
    expect(screen.queryByText('Rifter Blueprint')).not.toBeInTheDocument();
  });

  it('missing from me lists what others hold, with the stale Member marked', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(await screen.findByRole('button', { name: new RegExp(l.missingFromMe) }));
    await user.click(screen.getByRole('button', { name: /Ships/ }));
    expect(screen.getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(screen.queryByText('Merlin Blueprint')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Ann shares the original' }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(en.communities.staleBadge)).toBeInTheDocument();
  });

  it('links to BPC Sourcing narrowed to the Community and owned sources', async () => {
    renderLibrary();
    const link = await screen.findByRole('link', { name: en.communities.blueprints.browse });
    expect(link).toHaveAttribute('href', '/industry/sourcing?sourcing.src=community%2Cowned');
  });
});
