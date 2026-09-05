/**
 * The "My jobs / Corp jobs" switch (issue #298).
 *
 * A separate file from `ActiveJobsPanel.test.tsx` on purpose: that file is the
 * record of what this panel does for the ~95% of Characters holding no corp
 * role, and AC 1 is that they see exactly what they saw before. It stays
 * byte-identical, and everything the switch adds is asserted here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { db } from '@/db';
import { scopesForGroup } from '@/esi/scopes';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import type { TypeMap } from '@/sde/types';
import { ActiveJobsPanel } from './ActiveJobsPanel';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const TYPES: TypeMap = {
  '100': { name: 'Widget Alpha', groupID: 1, volume: 1 },
  '200': { name: 'Widget Beta', groupID: 1, volume: 1 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
  // The row context menu (issue #409) asks usePiPlannable, which reads this.
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const CHAR_ID = 91;
const OTHER_CHAR_ID = 92;
const CORP_ID = 98000001;
const NOW = Date.now();

const server = setupServer();

/** The Character's own job — the personal side. */
const PERSONAL_JOB = {
  job_id: 1,
  activity_id: 1,
  blueprint_type_id: 100,
  facility_id: 60003760,
  station_id: 60003760,
  runs: 1,
  start_date: new Date(NOW - 30 * 60_000).toISOString(),
  end_date: new Date(NOW + 90 * 60_000).toISOString(),
  status: 'active',
};

/** A corporation job — `location_id` where the personal shape has `station_id`. */
const CORP_JOB = {
  job_id: 2,
  installer_id: CHAR_ID,
  activity_id: 1,
  blueprint_id: 5,
  blueprint_type_id: 200,
  blueprint_location_id: 60003760,
  output_location_id: 60003760,
  facility_id: 60003760,
  location_id: 60003760,
  runs: 4,
  start_date: new Date(NOW - 30 * 60_000).toISOString(),
  end_date: new Date(NOW + 120 * 60_000).toISOString(),
  status: 'active',
};

function personalJobsUrl(characterId: number) {
  return `${ESI_BASE_URL}/characters/${characterId}/industry/jobs`;
}
function rolesUrl(characterId: number) {
  return `${ESI_BASE_URL}/characters/${characterId}/roles`;
}
function corpJobsUrl() {
  return `${ESI_BASE_URL}/corporations/${CORP_ID}/industry/jobs`;
}

/** A Director with the corp grant, whose corporation is already known. */
async function seedCorpCapableCharacter() {
  await db.characters.put({
    characterId: CHAR_ID,
    name: 'Pilot One',
    ownerHash: 'oh',
    addedAt: 1,
    corporationId: CORP_ID,
  });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [...scopesForGroup('corp')],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  server.use(http.get(rolesUrl(CHAR_ID), () => HttpResponse.json({ roles: ['Director'] })));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
  server.use(http.get(personalJobsUrl(CHAR_ID), () => HttpResponse.json([PERSONAL_JOB])));
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
});
afterAll(() => server.close());

describe('ActiveJobsPanel: the switch is hidden without the capability (AC 1)', () => {
  it('renders no switch for a Character with no corp role', async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
      corporationId: CORP_ID,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [...scopesForGroup('corp')],
    });
    server.use(http.get(rolesUrl(CHAR_ID), () => HttpResponse.json({})));

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('group', { name: 'Job owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: /corp jobs/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My jobs' })).toBeNull();
  });

  it('renders no switch for a Director who has not granted the corp scopes', async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
      corporationId: CORP_ID,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-characters.read_corporation_roles.v1'],
    });
    server.use(http.get(rolesUrl(CHAR_ID), () => HttpResponse.json({ roles: ['Director'] })));

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('group', { name: 'Job owner' })).toBeNull();
  });

  /**
   * The corporation is only learned from the public-info read, so on a cold
   * device it is simply absent. A switch whose corp side has no corporation to
   * read must not be on screen — hide, as everywhere else.
   */
  it('renders no switch until the corporation is known', async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [...scopesForGroup('corp')],
    });
    server.use(http.get(rolesUrl(CHAR_ID), () => HttpResponse.json({ roles: ['Director'] })));

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('group', { name: 'Job owner' })).toBeNull();
  });

  /** A Factory_Manager reads corp jobs; an Accountant, on this page, does not. */
  it('renders no switch for a role that opens some other corp surface', async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
      corporationId: CORP_ID,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [...scopesForGroup('corp')],
    });
    server.use(http.get(rolesUrl(CHAR_ID), () => HttpResponse.json({ roles: ['Accountant'] })));

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('group', { name: 'Job owner' })).toBeNull();
  });
});

describe('ActiveJobsPanel: the corp side (AC 2, AC 3)', () => {
  it('shows the switch, fetches nothing until it is flipped, then shows corp jobs', async () => {
    let corpRequests = 0;
    server.use(
      http.get(corpJobsUrl(), () => {
        corpRequests += 1;
        return HttpResponse.json([CORP_JOB]);
      })
    );
    await seedCorpCapableCharacter();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    const corpChip = await screen.findByRole('button', { name: 'Corp jobs' });
    await screen.findByText('Widget Alpha');
    // Opt-in means opt-in: a visit that never flips the switch never touches
    // the role-gated, rate-limited corp endpoint.
    expect(corpRequests).toBe(0);

    await user.click(corpChip);

    expect(await screen.findByText('Widget Beta')).toBeInTheDocument();
    expect(screen.queryByText('Widget Alpha')).toBeNull();
    expect(corpRequests).toBe(1);
    // Same table, different owner — the corp rows render through the very same
    // columns, runs count included.
    expect(
      within(screen.getByRole('row', { name: /Widget Beta/ })).getByText('4')
    ).toBeInTheDocument();
  });

  it('gives the corp side its own DataAgeBadge value, not the personal side', async () => {
    const corpFetchedAt = NOW - 5 * 60_000;
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'industryJobs'),
      value: [CORP_JOB],
      fetchedAt: corpFetchedAt,
    });
    await seedCorpCapableCharacter();
    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Widget Alpha');
    const personalBadge = container.querySelector('header time')?.getAttribute('dateTime');
    expect(personalBadge).not.toBe(new Date(corpFetchedAt).toISOString());

    await user.click(await screen.findByRole('button', { name: 'Corp jobs' }));

    await screen.findByText('Widget Beta');
    expect(container.querySelector('header time')?.getAttribute('dateTime')).toBe(
      new Date(corpFetchedAt).toISOString()
    );
  });

  it('shows a corp-specific empty state rather than the personal one', async () => {
    server.use(http.get(corpJobsUrl(), () => HttpResponse.json([])));
    await seedCorpCapableCharacter();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Corp jobs' }));

    expect(await screen.findByText('No active corp jobs')).toBeInTheDocument();
  });

  /**
   * A 403 here is CCP's in-game role gate, which logging in again cannot open.
   * A `ReauthBanner` over it is the failure CONTEXT.md round 35 rules out.
   */
  it('does not offer a re-login over the corp role gate (403)', async () => {
    server.use(
      http.get(corpJobsUrl(), () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 }))
    );
    await seedCorpCapableCharacter();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Corp jobs' }));

    expect(await screen.findByText('No active jobs cached')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see jobs')).toBeNull();
  });
});

describe('ActiveJobsPanel: the selection resets on a character switch (AC 4)', () => {
  it('returns to My jobs, and hides the switch, when the new Character holds no role', async () => {
    server.use(
      http.get(corpJobsUrl(), () => HttpResponse.json([CORP_JOB])),
      http.get(personalJobsUrl(OTHER_CHAR_ID), () => HttpResponse.json([PERSONAL_JOB])),
      http.get(rolesUrl(OTHER_CHAR_ID), () => HttpResponse.json({}))
    );
    await seedCorpCapableCharacter();
    await db.characters.put({
      characterId: OTHER_CHAR_ID,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
      corporationId: CORP_ID,
    });
    await db.tokens.put({
      characterId: OTHER_CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [...scopesForGroup('corp')],
    });
    const user = userEvent.setup();

    // Mirrors /industry: the panel is always handed the active Character.
    function Harness() {
      const characterId = useActiveCharacter((state) => state.activeCharacterId);
      return characterId === null ? null : (
        <MemoryRouter>
          <ActiveJobsPanel
            characterId={characterId}
            onAddToQuickbar={() => {}}
            quickbarAvailable={true}
            onShowInfo={() => {}}
          />
        </MemoryRouter>
      );
    }

    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Corp jobs' }));
    expect(await screen.findByText('Widget Beta')).toBeInTheDocument();

    act(() => {
      useActiveCharacter.setState({ activeCharacterId: OTHER_CHAR_ID, hydrated: true });
    });

    // Back on the personal side, with no switch at all for the new Character.
    expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Job owner' })).toBeNull();
    });
  });
});
