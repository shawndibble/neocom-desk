import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';

const store = vi.hoisted(() => ({
  shared: new Map<string, number>(),
  sharePlan: vi.fn(),
  unsharePlan: vi.fn(),
  syncSharedPlans: vi.fn(),
}));

vi.mock('./sharedPlans', () => ({
  loadMySharedPlans: async () => new Map(store.shared),
  sharePlan: store.sharePlan,
  unsharePlan: store.unsharePlan,
  syncSharedPlans: store.syncSharedPlans,
}));

import { ShareSkillPlansTab } from './ShareSkillPlansTab';

const p = en.communities.plans;

const record = (id: string, name: string, skills = 2) => ({
  id,
  characterId: 1,
  name,
  entries: Array.from({ length: skills }, (_, i) => ({ skillTypeID: 100 + i, targetLevel: 3 })),
  remapCount: 0,
  updatedAt: 1,
});

/** Opens Add Skill plans and returns the dialog. */
async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: p.add }));
  return screen.findByRole('dialog', { name: p.addTitle });
}

function renderTab() {
  render(
    <MemoryRouter>
      <ShareSkillPlansTab characterId={1} communityId="c1" />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  store.shared = new Map();
  store.sharePlan.mockResolvedValue(true);
  store.unsharePlan.mockResolvedValue(undefined);
  store.syncSharedPlans.mockResolvedValue(undefined);
  await db.skillPlans.clear();
  await db.skillPlans.bulkPut([
    record('a', 'Alpha Plan'),
    record('b', 'Beta Plan', 5),
    record('c', 'Gamma Plan'),
  ]);
});

describe('ShareSkillPlansTab', () => {
  it('offers no share-all: nothing is shared until a plan is picked, one at a time', async () => {
    renderTab();
    expect(await screen.findByText(p.noneShared)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/never all at once/)).toBeInTheDocument();
  });

  it('refreshes the shared copies of edited plans when it opens', async () => {
    renderTab();
    await screen.findByText(p.noneShared);
    expect(store.syncSharedPlans).toHaveBeenCalledWith(1, 'c1');
  });

  it('adds a plan from the Add Skill plans dialog, which lists its skill count', async () => {
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    expect(within(dialog).getByText('Alpha Plan')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('searchbox'), 'beta');
    const row = within(dialog).getByText('Beta Plan').closest('li')!;
    expect(within(row).getByText('5 skills')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: p.share }));
    await waitFor(() =>
      expect(store.sharePlan).toHaveBeenCalledWith(1, 'c1', expect.objectContaining({ id: 'b' }))
    );
    expect(await screen.findByText('1 plan shared')).toBeInTheDocument();
  });

  it('stops sharing a plan from its row', async () => {
    store.shared = new Map([['a', 1]]);
    const user = userEvent.setup();
    renderTab();
    const row = (await screen.findByText('Alpha Plan')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: p.stop }));
    await waitFor(() => expect(store.unsharePlan).toHaveBeenCalledWith(1, 'c1', 'a'));
    await waitFor(() => expect(screen.queryByText('Alpha Plan')).not.toBeInTheDocument());
  });

  it('says so when a plan cannot be shared', async () => {
    store.sharePlan.mockResolvedValue(false);
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    const row = within(dialog).getByText('Gamma Plan').closest('li')!;
    await user.click(within(row).getByRole('button', { name: p.share }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(p.cannot);
  });

  it('reloads the truth when an update fails', async () => {
    store.shared = new Map([['a', 1]]);
    store.unsharePlan.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderTab();
    const row = (await screen.findByText('Alpha Plan')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: p.stop }));
    expect(await screen.findByRole('alert')).toHaveTextContent(p.failed);
    expect(await screen.findByText('Alpha Plan')).toBeInTheDocument();
  });

  it('says there is nothing to share when the Character has no plans, and where to make one', async () => {
    await db.skillPlans.clear();
    const user = userEvent.setup();
    renderTab();
    expect(await screen.findByText(p.noPlans)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: p.makePlan })).toHaveAttribute('href', '/skills/plans');
    // Add stays where it always is.
    const dialog = await openAdd(user);
    expect(within(dialog).getByText(p.noPlans)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: p.makePlan })).toBeInTheDocument();
  });
});
