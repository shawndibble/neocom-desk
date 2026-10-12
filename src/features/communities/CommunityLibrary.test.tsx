import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      items: [{ typeId: 10, me: 0, te: 0, runs: -1, locationName: 'Jita IV', systemName: 'Jita' }],
    },
  ],
}));

const members = [
  { uid: 'ann', characterName: 'Ann', joinedAt: 1, libraryAsOf: NOW - 40 * DAY },
  { uid: uidForCharacter(1), characterName: 'Me', joinedAt: 2, libraryAsOf: null },
];

function renderLibrary() {
  return render(
    <CommunityLibrary
      communityId="c1"
      characterId={1}
      members={members}
      membersFailed={false}
      now={NOW}
    />
  );
}

beforeAll(async () => {
  renderLibrary().unmount();
}, 30_000);

describe('CommunityLibrary', () => {
  it('defaults to what nobody in the Community holds', async () => {
    const user = userEvent.setup();
    renderLibrary();
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
});
