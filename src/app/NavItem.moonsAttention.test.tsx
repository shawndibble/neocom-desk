import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const remote = vi.hoisted(() => ({
  status: undefined as Record<string, unknown> | undefined,
  count: 0 as number | null | Error,
}));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncAuth: () => ({ currentUser: { uid: 'char:1' } }),
  getSyncFirestore: () => ({}),
}));
vi.mock('@/features/corp/moons/moonsAttentionCount', () => ({
  loadNeedsYouCount: async () => {
    if (remote.count instanceof Error) throw remote.count;
    return remote.count;
  },
}));
vi.mock('@/sync/uid', () => ({ uidForCharacter: (id: number) => `char:${id}` }));
vi.mock('firebase/firestore/lite', () => ({
  doc: () => ({}),
  getDoc: async () => ({ data: () => remote.status }),
}));

import {
  publishMoonsAttention,
  refreshMoonsAttention,
} from '@/features/corp/moons/moonsNavAttention';
import { NavItem } from './NavItem';
import { useNavBadges } from './navBadges';

const CORP = 98000001;

function Entry() {
  const badge = useNavBadges();
  return <NavItem to="/corp/moons" label="Moons" locked={false} {...badge('/corp/moons')} />;
}

const renderEntry = () =>
  render(
    <MemoryRouter>
      <Entry />
    </MemoryRouter>
  );

beforeEach(async () => {
  remote.status = undefined;
  remote.count = 0;
  await db.settings.clear();
  await db.characters.clear();
  await db.characters.put({ characterId: 1, corporationId: CORP } as never);
  useActiveCharacter.setState({ activeCharacterId: 1 });
});

describe('the corp Moons nav dot (#6208)', () => {
  it('shows while an editor’s Needs you has a card, and clears when it is empty', async () => {
    renderEntry();
    expect(await screen.findByRole('link', { name: 'Moons' })).toBeInTheDocument();
    await act(() => publishMoonsAttention(1, CORP, { needsYou: 2, syncStopped: false }));
    expect(await screen.findByRole('link', { name: 'Moons, needs attention' })).toBeInTheDocument();
    await act(() => publishMoonsAttention(1, CORP, { needsYou: 0, syncStopped: false }));
    expect(await screen.findByRole('link', { name: 'Moons' })).toBeInTheDocument();
  });

  it('shows while Automatic sync has stopped, even with nothing in Needs you', async () => {
    await publishMoonsAttention(1, CORP, { needsYou: 0, syncStopped: true });
    renderEntry();
    expect(await screen.findByRole('link', { name: 'Moons, needs attention' })).toBeInTheDocument();
  });

  it('is never shown for a viewer: their visit clears it', async () => {
    await publishMoonsAttention(1, CORP, { needsYou: 3, syncStopped: false });
    await publishMoonsAttention(1, CORP, null);
    renderEntry();
    expect(await screen.findByRole('link', { name: 'Moons' })).toBeInTheDocument();
  });

  it('picks up a stop the server recorded after the editor’s last visit', async () => {
    await publishMoonsAttention(1, CORP, { needsYou: 0, syncStopped: false });
    renderEntry();
    remote.status = {
      status: 'stopped',
      characterId: 1,
      characterName: 'Holder',
      stoppedReason: 'role-lost',
    };
    await act(() => refreshMoonsAttention(1, CORP));
    expect(await screen.findByRole('link', { name: 'Moons, needs attention' })).toBeInTheDocument();
  });

  it('reads nothing for a Character with no editor visit on record', async () => {
    remote.status = { status: 'stopped', characterId: 1, characterName: 'Holder' };
    await refreshMoonsAttention(1, CORP);
    expect(await db.settings.count()).toBe(0);
  });

  it('lights for Needs you work that arrived after the visit, and clears once it is handled', async () => {
    await publishMoonsAttention(1, CORP, { needsYou: 0, syncStopped: false });
    renderEntry();
    remote.count = 2;
    await act(() => refreshMoonsAttention(1, CORP));
    expect(await screen.findByRole('link', { name: 'Moons, needs attention' })).toBeInTheDocument();
    remote.count = 0;
    await act(() => refreshMoonsAttention(1, CORP));
    expect(await screen.findByRole('link', { name: 'Moons' })).toBeInTheDocument();
  });

  it('keeps the last count when the book cannot be read, and drops it when the book is off', async () => {
    await publishMoonsAttention(1, CORP, { needsYou: 3, syncStopped: false });
    remote.count = new Error('offline');
    await refreshMoonsAttention(1, CORP);
    expect((await db.settings.toArray())[0]?.value).toEqual({ needsYou: 3, syncStopped: false });
    remote.count = null;
    await refreshMoonsAttention(1, CORP);
    expect((await db.settings.toArray())[0]?.value).toEqual({ needsYou: 0, syncStopped: false });
  });
});
