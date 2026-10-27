import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';

const store = vi.hoisted(() => ({ loadCommunityPlans: vi.fn() }));
vi.mock('./sharedPlans', () => ({ loadCommunityPlans: store.loadCommunityPlans }));

import { CommunitySharedPlans } from './CommunitySharedPlans';

const d = en.communities.plansDialog;

const shared = (over: Record<string, unknown>) => ({
  communityId: 'c1',
  id: 'char:2~a',
  ownerUid: 'char:2',
  planId: 'a',
  name: 'Marauder',
  entries: [
    { skillTypeID: 3300, targetLevel: 5 },
    { skillTypeID: 3301, targetLevel: 3 },
  ],
  updatedAt: 1,
  sourceUpdatedAt: 1,
  ...over,
});

function renderList() {
  render(
    <MemoryRouter initialEntries={['/communities']}>
      <Routes>
        <Route
          path="/communities"
          element={
            <CommunitySharedPlans
              characterId={1}
              communityId="c1"
              members={[
                { uid: 'char:2', characterName: 'Kara Voss', joinedAt: 1, libraryAsOf: null },
              ]}
            />
          }
        />
        <Route path="/skills/plans/:id" element={<p>plan page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.skillPlans.clear();
  store.loadCommunityPlans.mockResolvedValue([
    shared({}),
    shared({ id: 'char:2~b', planId: 'b', name: 'Industry basics' }),
  ]);
});

describe('CommunitySharedPlans', () => {
  it('lists the Community’s shared plans with sharer and skill count', async () => {
    renderList();
    expect(await screen.findByText('Marauder')).toBeInTheDocument();
    expect(screen.getAllByText('Kara Voss · 2 skills')).toHaveLength(2);
  });

  it('copies a plan to the pilot’s own plans and opens it', async () => {
    const user = userEvent.setup();
    renderList();
    const row = (await screen.findByText('Marauder')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: d.copy }));
    expect(await screen.findByText('plan page')).toBeInTheDocument();
    await waitFor(async () => {
      const plans = await db.skillPlans.toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({ characterId: 1, name: 'Marauder' });
      expect(plans[0].entries).toHaveLength(2);
    });
  });

  it('says so when the copy cannot be saved, and stays put', async () => {
    const add = vi.spyOn(db.skillPlans, 'add').mockRejectedValueOnce(new Error('quota'));
    const user = userEvent.setup();
    renderList();
    const row = (await screen.findByText('Marauder')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: d.copy }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.communities.everyone.copyFailed);
    expect(screen.queryByText('plan page')).not.toBeInTheDocument();
    add.mockRestore();
  });

  it('says so when nothing is shared yet', async () => {
    store.loadCommunityPlans.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });
});
