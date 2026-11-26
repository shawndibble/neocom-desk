import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { popSharingFrom } from '../../../../functions/src/popSharing';
import { SharingTab } from './SharingTab';

const OWNER = 555;
const COMMUNITY = { kind: 'community' as const, communityId: 'c1', name: 'Ore Club' };

const pull = (moonId: number, structureId: number, startedAt: string, owner?: number) => ({
  id: `${structureId}_${moonId}`,
  moonId,
  structureId,
  startedAt,
  ...(owner === undefined ? {} : { sourceCorporationId: owner }),
});

const book = vi.hoisted(() => ({
  edit: vi.fn(async () => ({})),
  feeders: [] as Record<string, unknown>[],
  refineryIds: [] as number[],
}));

vi.mock('./useBook', () => ({
  useBook: () => ({
    characterId: 1,
    corporationId: 98000001,
    view: {
      extractions: [
        pull(40000001, 1001, '2024-11-01T00:00:00Z'),
        pull(40000002, 1002, '2026-11-10T00:00:00Z'),
        pull(40000003, 2001, '2026-11-12T00:00:00Z', 555),
      ],
    },
    data: {
      feeders: book.feeders,
      scheduledSync: { status: 'active', refineryIds: book.refineryIds },
    },
    settings: { rates: [] },
    names: {
      refinery: (id: number) => `Refinery ${id}`,
      moon: (id: number) => `Moon ${id}`,
      corporation: (id: number) => `Corp ${id}`,
      undockable: () => false,
    },
    canEdit: true,
    edit: book.edit,
  }),
}));

vi.mock('@/esi/endpoints/corp', () => ({
  getCorporationPublicInfo: async () => ({ data: { alliance_id: 99000001 } }),
}));

const sharing = vi.hoisted(() => ({ doc: null as unknown }));
vi.mock('./usePopSharing', () => ({
  usePopSharing: () => ({ load: { state: 'ready', doc: sharing.doc }, reload: vi.fn() }),
  usePopSharingCommunities: () => ({ c1: { officer: false, blocked: false } }),
}));
vi.mock('@/features/communities/communityStore', () => ({
  loadMyCommunitiesCached: async () => [{ id: 'c1', name: 'Ore Club' }],
}));

function renderTab(path = '/corp/moons/overview') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SharingTab onOpenSyncSettings={() => {}} />
    </MemoryRouter>
  );
}

const rowOf = (moon: string) => {
  const row = screen.getByText(moon).closest('[data-row-key]');
  if (!row) throw new Error(`no row for ${moon}`);
  return row as HTMLElement;
};

afterEach(() => {
  cleanup();
  book.edit.mockClear();
  book.feeders = [];
  book.refineryIds = [];
  sharing.doc = null;
});

describe('SharingTab', () => {
  it('lists every moon the book holds an Extraction for, an idle refinery included', () => {
    sharing.doc = popSharingFrom({ enabled: true });
    renderTab();
    for (const moon of ['Moon 40000001', 'Moon 40000002', 'Moon 40000003'])
      expect(rowOf(moon)).toBeInTheDocument();
    expect(within(rowOf('Moon 40000003')).getByText('Corp 555')).toBeInTheDocument();
    expect(within(rowOf('Moon 40000001')).getByText('Sharing default')).toBeInTheDocument();
  });

  it('marks a Community with no officer and a moon whose owner opted out', () => {
    sharing.doc = popSharingFrom({ enabled: true, defaults: { audiences: [COMMUNITY] } });
    book.feeders = [{ corporationId: OWNER, status: 'active', popSharingOptOut: { by: 1, at: 2 } }];
    renderTab();
    expect(
      within(rowOf('Moon 40000002')).getByText('No officer in this Community')
    ).toBeInTheDocument();
    const owned = rowOf('Moon 40000003');
    expect(within(owned).getByText('Moon owner turned sharing off')).toBeInTheDocument();
    expect(within(owned).queryByText('Ore Club')).not.toBeInTheDocument();
  });

  it("saves an idle refinery's moon override from its row's dialog", async () => {
    sharing.doc = popSharingFrom({ enabled: true });
    renderTab();
    await userEvent.click(rowOf('Moon 40000001'));
    const dialog = await screen.findByRole('dialog', { name: 'Pop sharing · Moon 40000001' });
    const notes = within(dialog).getByRole('group', { name: 'Notes' });
    await userEvent.click(within(notes).getByRole('checkbox', { name: 'Set for this moon' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Warp to 0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(book.edit).toHaveBeenCalledWith({
      action: 'setPopSharingMoon',
      moonId: 40000001,
      set: { notes: 'Warp to 0' },
      clear: [],
    });
  });

  it('lists a refinery with no Extraction yet apart, with why it cannot be set', () => {
    sharing.doc = popSharingFrom({ enabled: true });
    book.refineryIds = [1001, 1003];
    book.feeders = [{ corporationId: OWNER, status: 'active', refinerySystems: { '2002': 1 } }];
    renderTab();
    const section = screen.getByRole('heading', { name: 'Waiting for a first Extraction' })
      .parentElement as HTMLElement;
    expect(within(section).getByText(/their moon isn't known/)).toBeInTheDocument();
    expect(within(section).getByText('Refinery 1003')).toBeInTheDocument();
    expect(within(section).getByText('Refinery 2002')).toBeInTheDocument();
    expect(within(section).getByText('Corp 555')).toBeInTheDocument();
    expect(within(section).queryByText('Refinery 1001')).not.toBeInTheDocument();
  });

  it('has no waiting list when every refinery has a moon', () => {
    sharing.doc = popSharingFrom({ enabled: true });
    book.refineryIds = [1001, 1002];
    renderTab();
    expect(
      screen.queryByRole('heading', { name: 'Waiting for a first Extraction' })
    ).not.toBeInTheDocument();
  });

  it("pulses the row a share icon's ?highlight=<moonId> link names", () => {
    sharing.doc = popSharingFrom({ enabled: true });
    renderTab('/corp/moons/overview?highlight=40000002');
    expect(rowOf('Moon 40000002').className).toContain('row-pulse');
    expect(rowOf('Moon 40000001').className).not.toContain('row-pulse');
  });
});
