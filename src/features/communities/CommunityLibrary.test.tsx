import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
    '10': { name: 'Rifter Blueprint', products: [{ typeID: 587, quantity: 1 }] },
    '11': { name: 'Merlin Blueprint', products: [{ typeID: 603, quantity: 1 }] },
  }),
}));
const JITA = 30000142;
const EFA = 30003070;
const systems = vi.hoisted(() => ({ readable: true, pending: false }));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () => (systems.pending ? new Promise(() => {}) : loadSystems()),
}));
async function loadSystems() {
  return systems.readable
    ? new Map([
        [JITA, { id: JITA, name: 'Jita', security: 0.95, regionId: 1 }],
        [EFA, { id: EFA, name: 'Efa', security: -0.2, regionId: 2 }],
      ])
    : null;
}
// Jita is 3 jumps out; Efa has no stargate route from here.
const jumps = new Map([[JITA, 3]]);
vi.mock('@/features/route/currentSystem', () => ({
  useCurrentSystem: () => ({ systemId: 30000144, loaded: true }),
  useJumpRangeFilter: () => ({ status: 'off', allowed: null, jumps, jumpsStatus: 'ready' }),
}));
const live = vi.hoisted(() => ({ offline: false, unreadable: false }));
vi.mock('./communityStore', () => ({
  loadMemberLibrariesFor: async () => {
    if (live.offline) throw new TypeError('Failed to fetch');
    return {
      libraries: [
        {
          uid: 'ann',
          items: [
            { typeId: 10, me: 0, te: 0, runs: -1, locationName: 'Jita IV', systemName: 'Jita' },
            { typeId: 10, me: 10, te: 20, runs: 7, locationName: 'Efa VII', systemName: 'Efa' },
          ],
        },
      ],
      failedUids: live.unreadable ? ['ann'] : [],
    };
  },
}));

const members = [
  { uid: 'ann', characterName: 'Ann', joinedAt: 1, libraryAsOf: NOW - 40 * DAY },
  { uid: uidForCharacter(1), characterName: 'Me', joinedAt: 2, libraryAsOf: null },
];

function Where() {
  const location = useLocation();
  return <output aria-label="where">{location.pathname + location.search}</output>;
}

function renderLibrary() {
  return render(
    <MemoryRouter>
      <Where />
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

/** Picks a view from the Show select. */
async function pickView(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole('combobox', { name: l.filterLabel }));
  await user.click(await screen.findByRole('option', { name: new RegExp(label) }));
}

describe('CommunityLibrary', () => {
  it('opens on each shared blueprint with its owner, place, ME / TE and runs', async () => {
    renderLibrary();
    expect(await screen.findByRole('combobox', { name: l.filterLabel })).toHaveTextContent(
      l.shared
    );
    const rows = within(screen.getByRole('table', { name: l.sharedLabel }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    // "Jita IV" already says Jita: no system line under it.
    expect(rows.find((text) => text?.includes('Jita IV'))).toMatch(
      /^Rifter Blueprint.*Ann.*Jita IV3.*0 \/ 0.*BPO/
    );
    expect(rows.find((text) => text?.includes('Efa VII'))).toMatch(/Efa VII—.*10 \/ 20.*7 runs/);
  });

  it('opens Show info from the blueprint name', async () => {
    renderLibrary();
    const table = await screen.findByRole('table', { name: l.sharedLabel });
    const [name] = within(table).getAllByRole('link', { name: 'Rifter Blueprint' });
    expect(name).toHaveAttribute('href', expect.stringContaining('info=type-10'));
  });

  it('links the jumps to the route there, and shows a dash where none is known', async () => {
    renderLibrary();
    const table = await screen.findByRole('table', { name: l.sharedLabel });
    const jita = within(table).getByRole('link', { name: /^3 / });
    expect(jita).toHaveAttribute('href', `/travel/route?stops=${JITA}`);
    const efa = within(table)
      .getAllByRole('row')
      .find((row) => row.textContent?.includes('Efa VII'))!;
    expect(within(efa).getByText('—')).toBeInTheDocument();
  });

  it('shows a dash for every jumps cell when the system list cannot be read', async () => {
    systems.readable = false;
    try {
      renderLibrary();
      const table = await screen.findByRole('table', { name: l.sharedLabel });
      expect(await within(table).findAllByText('—')).toHaveLength(2);
      expect(within(table).queryByText('…')).not.toBeInTheDocument();
    } finally {
      systems.readable = true;
    }
  });

  it('the row menu says View route is still checking while the system list loads', async () => {
    systems.pending = true;
    try {
      const user = userEvent.setup();
      renderLibrary();
      const table = await screen.findByRole('table', { name: l.sharedLabel });
      const [more] = within(table).getAllByRole('button', {
        name: en.common.moreActionsLabel.replace('{{name}}', 'Rifter Blueprint'),
      });
      await user.click(more!);
      expect(screen.getByRole('menuitem', { name: l.viewRouteChecking })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(screen.queryByText(l.systemUnknown)).not.toBeInTheDocument();
    } finally {
      systems.pending = false;
    }
  });

  it('sorts by jumps, the unknown last either way', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const table = await screen.findByRole('table', { name: l.sharedLabel });
    const header = within(table).getByRole('button', { name: new RegExp(l.columns.jumps) });
    // Twice: descending, where a plain number sort would put the unknown first.
    await user.click(header);
    await user.click(header);
    expect(
      within(table).getByRole('columnheader', { name: new RegExp(l.columns.jumps) })
    ).toHaveAttribute('aria-sort', 'descending');
    const places = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => (row.textContent?.includes('Jita IV') ? 'Jita' : 'Efa'));
    expect(places).toEqual(['Jita', 'Efa']);
  });

  it('a row menu shows info, plans a seeded build, sources the blueprint and routes there', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const table = await screen.findByRole('table', { name: l.sharedLabel });
    const efaRow = () =>
      within(screen.getByRole('table', { name: l.sharedLabel }))
        .getAllByRole('row')
        .find((row) => row.textContent?.includes('Efa VII'))!;
    const open = async () =>
      user.click(
        within(efaRow()).getByRole('button', {
          name: en.common.moreActionsLabel.replace('{{name}}', 'Rifter Blueprint'),
        })
      );
    expect(table).toBeInTheDocument();

    await open();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      en.market.contextMenu.showInfo,
      en.openInEve.marketDetails,
      en.industry.contextMenu.buildPlan,
      l.openInSourcing,
      en.travel.waypoints.viewRoute,
    ]);
    await user.click(screen.getByRole('menuitem', { name: en.industry.contextMenu.buildPlan }));
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent(
      '/industry/plans?product=587&me=10&te=20&runs=7'
    );
  });

  it('the row menu opens BPC Sourcing on the blueprint and the route to its system', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const table = await screen.findByRole('table', { name: l.sharedLabel });
    const efaRow = within(table)
      .getAllByRole('row')
      .find((row) => row.textContent?.includes('Efa VII'))!;
    const more = within(efaRow).getByRole('button', {
      name: en.common.moreActionsLabel.replace('{{name}}', 'Rifter Blueprint'),
    });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: l.openInSourcing }));
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent(
      '/industry/sourcing?sourcing.type=10'
    );
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: en.travel.waypoints.viewRoute }));
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent(
      `/travel/route?stops=${EFA}`
    );
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
    await pickView(user, l.missingCommunity);
    await user.click(await screen.findByRole('button', { name: /Ships/ }));
    expect(screen.getByText('Merlin Blueprint')).toBeInTheDocument();
    expect(screen.queryByText('Rifter Blueprint')).not.toBeInTheDocument();
  });

  it('missing from me lists what others hold, with the stale Member marked', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await pickView(user, l.missingFromMe);
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
    // What BPC Sourcing holds is a tooltip beside it, not a sentence on the page.
    expect(
      screen.getByRole('button', { name: en.communities.blueprints.browseAbout })
    ).toBeInTheDocument();
    expect(screen.queryByText(en.communities.blueprints.browseHint)).not.toBeInTheDocument();
  });

  describe('without a connection', () => {
    afterEach(async () => {
      live.offline = false;
      live.unreadable = false;
      await db.settings.clear();
    });

    it('shows the last libraries read, labelled, and saves them as they are read', async () => {
      renderLibrary().unmount();
      await vi.waitFor(async () =>
        expect(await db.settings.get('communitySnapshot:1:libraries:c1')).toBeDefined()
      );

      live.offline = true;
      renderLibrary();
      const table = await screen.findByRole('table', { name: l.sharedLabel });
      expect(within(table).getAllByRole('row')).toHaveLength(3);
      expect(screen.getByText(en.common.offlineTitle)).toBeInTheDocument();
    });

    it('does not show the saved copy for one unreadable Member while online', async () => {
      renderLibrary().unmount();
      await vi.waitFor(async () =>
        expect(await db.settings.get('communitySnapshot:1:libraries:c1')).toBeDefined()
      );
      live.unreadable = true;
      renderLibrary();
      await screen.findByRole('table', { name: l.sharedLabel });
      expect(screen.queryByText(en.common.offlineTitle)).not.toBeInTheDocument();
    });

    it('says so when nothing was saved', async () => {
      live.offline = true;
      renderLibrary();
      expect(await screen.findByText(l.loadFailed)).toBeInTheDocument();
    });
  });
});
