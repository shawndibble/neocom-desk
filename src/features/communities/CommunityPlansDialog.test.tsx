import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import en from '@/i18n/locales/en.json';

const store = vi.hoisted(() => ({
  loadMyCommunitiesCached: vi.fn(),
  loadCommunityMembers: vi.fn(),
  loadCommunityPlans: vi.fn(),
}));

vi.mock('./communityStore', () => ({
  loadMyCommunitiesCached: store.loadMyCommunitiesCached,
  loadCommunityMembers: store.loadCommunityMembers,
}));
vi.mock('./sharedPlans', () => ({ loadCommunityPlans: store.loadCommunityPlans }));

import { CommunityPlansDialog } from './CommunityPlansDialog';

const d = en.communities.plansDialog;

const shared = (over: Record<string, unknown>) => ({
  communityId: 'c1',
  id: 'char:2~a',
  ownerUid: 'char:2',
  planId: 'a',
  name: 'Marauder',
  entries: [
    { skillTypeID: 3300, targetLevel: 5 },
    { skillTypeID: 3301, targetLevel: 3, priority: 'high' },
  ],
  updatedAt: 1,
  sourceUpdatedAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.loadMyCommunitiesCached.mockResolvedValue([{ id: 'c1', name: 'Pals' }]);
  store.loadCommunityMembers.mockResolvedValue([{ uid: 'char:2', characterName: 'Kara Voss' }]);
  store.loadCommunityPlans.mockResolvedValue([
    shared({}),
    shared({ id: 'char:2~b', planId: 'b', name: 'Industry basics' }),
    shared({ id: 'char:9~c', ownerUid: 'char:9', planId: 'c', name: 'Gone Plan' }),
  ]);
});

function renderDialog() {
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(<CommunityPlansDialog characterId={1} onCopy={onCopy} onClose={onClose} />);
  return { onCopy, onClose };
}

describe('CommunityPlansDialog', () => {
  it('lists every shared plan with who shared it, where, and how many skills', async () => {
    renderDialog();
    expect(await screen.findByText('Marauder')).toBeInTheDocument();
    expect(screen.getAllByText('Kara Voss · Pals · 2 skills')).toHaveLength(2);
    expect(screen.getByText('a former Member', { exact: false })).toBeInTheDocument();
  });

  it('narrows by plan name or sharer', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(await screen.findByRole('searchbox'), 'industry');
    expect(screen.getByText('Industry basics')).toBeInTheDocument();
    expect(screen.queryByText('Marauder')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'kara');
    expect(screen.getByText('Marauder')).toBeInTheDocument();
    expect(screen.queryByText('Gone Plan')).not.toBeInTheDocument();
  });

  it('copies a plan by handing its name and skills back', async () => {
    const user = userEvent.setup();
    const { onCopy } = renderDialog();
    const row = (await screen.findByText('Marauder')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: d.copy }));
    expect(onCopy).toHaveBeenCalledWith({
      name: 'Marauder',
      entries: [
        { skillTypeID: 3300, targetLevel: 5 },
        { skillTypeID: 3301, targetLevel: 3, priority: 'high' },
      ],
    });
  });

  it('says so when nothing is shared yet', async () => {
    store.loadCommunityPlans.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it('says so when it cannot load', async () => {
    store.loadMyCommunitiesCached.mockRejectedValue(new Error('offline'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(d.failed);
  });
});
