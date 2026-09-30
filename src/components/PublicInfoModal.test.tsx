import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';

// The Character tab is Pilot Lookup's view; its zKillboard reads and type catalog are stubbed.
vi.mock('@/lib/zkillboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zkillboard')>()),
  fetchPilotStats: vi.fn(async () => ({ kind: 'no-history' })),
  fetchPilotKillmails: vi.fn(async () => ({ ok: true, entries: [] })),
}));
vi.mock('@/sde/loadSde', () => ({ loadTypes: vi.fn(async () => ({})) }));
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { PublicInfoModal } from './PublicInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
  // No live affiliation by default, so a character's public record decides its corp and alliance.
  server.use(
    http.post(`${ESI_BASE_URL}/characters/affiliation`, () => HttpResponse.json([])),
    http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.json([]))
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockCharacter(id: number, body: Record<string, unknown>) {
  server.use(http.get(`${ESI_BASE_URL}/characters/${id}`, () => HttpResponse.json(body)));
}
function mockCorporation(id: number, body: Record<string, unknown>) {
  server.use(http.get(`${ESI_BASE_URL}/corporations/${id}`, () => HttpResponse.json(body)));
}
function mockAlliance(id: number, body: Record<string, unknown>) {
  server.use(http.get(`${ESI_BASE_URL}/alliances/${id}`, () => HttpResponse.json(body)));
}
const probe: { navigate: (path: string) => void } = { navigate: () => {} };
function NavigateProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    probe.navigate = navigate;
  }, [navigate]);
  return null;
}
const navigateTo = (path: string) => probe.navigate(path);

function renderModal() {
  render(
    <MemoryRouter initialEntries={['/contacts']}>
      <PublicInfoModal />
      <NavigateProbe />
    </MemoryRouter>
  );
}

function mockNames(entries: { id: number; name: string }[]) {
  server.use(
    http.post(`${ESI_BASE_URL}/universe/names`, () =>
      HttpResponse.json(entries.map((e) => ({ ...e, category: 'character' })))
    )
  );
}

describe('PublicInfoModal', () => {
  it('renders nothing when no request is open', () => {
    renderModal();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opening by character id resolves character, corporation, and alliance tabs', async () => {
    mockCharacter(91, {
      name: 'Some Pilot',
      corporation_id: 2,
      alliance_id: 3,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
      security_status: 1.5,
    });
    mockCorporation(2, {
      name: 'Some Corp',
      ticker: 'SOME',
      ceo_id: 99,
      creator_id: 99,
      member_count: 42,
      tax_rate: 0.1,
      alliance_id: 3,
    });
    mockAlliance(3, {
      name: 'Some Alliance',
      ticker: 'SOAL',
      creator_corporation_id: 2,
      creator_id: 99,
      date_founded: '2019-01-01T00:00:00Z',
    });
    mockNames([{ id: 99, name: 'CEO Pilot' }]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 91));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Corporation' })).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Alliance' })).toBeInTheDocument()
    );

    within(dialog).getByRole('tab', { name: 'Corporation' }).click();
    await screen.findByText('SOME');
    expect(screen.getByText('CEO Pilot')).toBeInTheDocument();
  });

  it('shows resolved corp/alliance names on the Character tab, not bare ids, once the chain resolves', async () => {
    mockCharacter(95, {
      name: 'Linked Pilot',
      corporation_id: 7,
      alliance_id: 8,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    mockCorporation(7, {
      name: 'Linked Corp',
      ticker: 'LINK',
      ceo_id: 102,
      creator_id: 102,
      member_count: 10,
      tax_rate: 0,
      alliance_id: 8,
    });
    mockAlliance(8, {
      name: 'Linked Alliance',
      ticker: 'LKAL',
      creator_corporation_id: 7,
      creator_id: 102,
      date_founded: '2019-01-01T00:00:00Z',
    });
    mockNames([
      { id: 102, name: 'Linked CEO' },
      { id: 7, name: 'Linked Corp' },
      { id: 8, name: 'Linked Alliance' },
    ]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 95));

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: 'Linked Corp' });
    await within(dialog).findByRole('button', { name: 'Linked Alliance' });

    within(dialog).getByRole('button', { name: 'Linked Corp' }).click();
    expect(within(dialog).getByRole('button', { name: 'Linked Alliance' })).toBeInTheDocument();
  });

  it('opening by corporation id skips straight to the Corporation tab, no Character tab', async () => {
    mockCorporation(2, {
      name: 'Some Corp',
      ticker: 'SOME',
      ceo_id: 99,
      creator_id: 99,
      member_count: 42,
      tax_rate: 0.1,
    });
    mockNames([{ id: 99, name: 'CEO Pilot' }]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('corporation', 2));

    const dialog = await screen.findByRole('dialog');
    await screen.findByText('SOME');
    expect(within(dialog).queryByRole('tab', { name: 'Character' })).not.toBeInTheDocument();
  });

  it('hides the Alliance tab for an alliance-less character instead of showing an error', async () => {
    mockCharacter(92, {
      name: 'No Alliance Pilot',
      corporation_id: 4,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    mockCorporation(4, {
      name: 'Solo Corp',
      ticker: 'SOLO',
      ceo_id: 100,
      creator_id: 100,
      member_count: 1,
      tax_rate: 0,
    });
    mockNames([{ id: 100, name: 'Solo CEO' }]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 92));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Corporation' })).toBeInTheDocument()
    );
    expect(within(dialog).queryByRole('tab', { name: 'Alliance' })).not.toBeInTheDocument();
  });

  it('shows an error only on the tab whose fetch failed', async () => {
    mockCharacter(93, {
      name: 'Pilot With Broken Corp',
      corporation_id: 5,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    server.use(http.get(`${ESI_BASE_URL}/corporations/5`, () => HttpResponse.error()));

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 93));

    await screen.findByText('Pilot With Broken Corp');
    const dialog = screen.getByRole('dialog');
    within(dialog).getByRole('tab', { name: 'Corporation' }).click();
    await screen.findByText('Could not load');
  });

  it('switching tabs reuses already-fetched data instead of refetching', async () => {
    let corpCalls = 0;
    mockCharacter(94, {
      name: 'Repeat Pilot',
      corporation_id: 6,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/6`, () => {
        corpCalls += 1;
        return HttpResponse.json({
          name: 'Once Corp',
          ticker: 'ONCE',
          ceo_id: 101,
          creator_id: 101,
          member_count: 1,
          tax_rate: 0,
        });
      })
    );
    mockNames([{ id: 101, name: 'Once CEO' }]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 94));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Corporation' })).toBeInTheDocument()
    );
    await waitFor(() => expect(corpCalls).toBe(1));

    within(dialog).getByRole('tab', { name: 'Corporation' }).click();
    await screen.findByText('ONCE');
    within(dialog).getByRole('tab', { name: 'Character' }).click();
    await screen.findByText('Repeat Pilot');
    within(dialog).getByRole('tab', { name: 'Corporation' }).click();
    await screen.findByText('ONCE');

    expect(corpCalls).toBe(1);
  });
  it("links each tab out to that entity's own zKillboard page", async () => {
    mockCharacter(95, {
      name: 'Killboard Pilot',
      corporation_id: 7,
      alliance_id: 700,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    mockCorporation(7, {
      name: 'Killboard Corp',
      ticker: 'KBC',
      alliance_id: 700,
      ceo_id: 102,
      creator_id: 102,
      member_count: 3,
      tax_rate: 0,
    });
    mockAlliance(700, {
      name: 'Killboard Alliance',
      ticker: 'KBA',
      creator_id: 102,
      creator_corporation_id: 7,
      executor_corporation_id: 7,
      date_founded: '2020-01-01T00:00:00Z',
    });
    mockNames([{ id: 102, name: 'Killboard CEO' }]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 95));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('link', { name: 'zKillboard' })).toHaveAttribute(
      'href',
      'https://zkillboard.com/character/95/'
    );

    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Corporation' })).toBeInTheDocument()
    );
    within(dialog).getByRole('tab', { name: 'Corporation' }).click();
    await waitFor(() =>
      expect(within(dialog).getByRole('link', { name: 'zKillboard' })).toHaveAttribute(
        'href',
        'https://zkillboard.com/corporation/7/'
      )
    );

    await waitFor(() =>
      expect(within(dialog).getByRole('tab', { name: 'Alliance' })).toBeInTheDocument()
    );
    within(dialog).getByRole('tab', { name: 'Alliance' }).click();
    await waitFor(() =>
      expect(within(dialog).getByRole('link', { name: 'zKillboard' })).toHaveAttribute(
        'href',
        'https://zkillboard.com/alliance/700/'
      )
    );
  });

  it("shows Pilot Lookup's view on the Character tab, its links switching tabs", async () => {
    mockCharacter(96, {
      name: 'Lookup Pilot',
      corporation_id: 9,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
      security_status: -4.56,
    });
    mockCorporation(9, {
      name: 'Lookup Corp',
      ticker: 'LOOK',
      ceo_id: 103,
      creator_id: 103,
      member_count: 5,
      tax_rate: 0,
    });
    mockNames([
      { id: 9, name: 'Lookup Corp' },
      { id: 103, name: 'Lookup CEO' },
    ]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 96));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No kills or losses on zKillboard')).toBeInTheDocument();
    expect(within(dialog).getByText('-4.6')).toBeInTheDocument();
    expect(within(dialog).getByText('Character age')).toBeInTheDocument();
    expect(within(dialog).getByText('Recent kills and losses')).toBeInTheDocument();
    // The modal is the public info already; no link back to itself.
    expect(within(dialog).queryByRole('button', { name: 'Public Info' })).not.toBeInTheDocument();

    within(dialog).getByRole('button', { name: 'Lookup Corp' }).click();
    expect(await within(dialog).findByText('LOOK')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Corporation' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it("follows the live affiliation, not a stale public record's corporation", async () => {
    mockCharacter(97, {
      name: 'Moved Pilot',
      corporation_id: 10,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
    });
    server.use(
      http.post(`${ESI_BASE_URL}/characters/affiliation`, () =>
        HttpResponse.json([{ character_id: 97, corporation_id: 11 }])
      )
    );
    mockCorporation(11, {
      name: 'New Home',
      ticker: 'NEW',
      ceo_id: 104,
      creator_id: 104,
      member_count: 2,
      tax_rate: 0,
      // Cached corp record still names an alliance the live affiliation has left.
      alliance_id: 13,
    });
    mockNames([
      { id: 11, name: 'New Home' },
      { id: 104, name: 'New CEO' },
    ]);

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 97));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'New Home' })).toBeInTheDocument();
    (await within(dialog).findByRole('tab', { name: 'Corporation' })).click();
    expect(await within(dialog).findByText('NEW')).toBeInTheDocument();
    expect(within(dialog).queryByText('#13')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Alliance' })).not.toBeInTheDocument();
  });

  it('says a character EVE has no record of was not found, apart from a load failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/98`, () =>
        HttpResponse.json({ error: 'Character not found' }, { status: 404 })
      )
    );

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('character', 98));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText("This character couldn't be found")).toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Corporation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Employment' })).not.toBeInTheDocument();
  });

  it('closes when a link inside it changes page, but not for a query-only change', async () => {
    mockCorporation(2, {
      name: 'Some Corp',
      ticker: 'SOME',
      ceo_id: 99,
      creator_id: 99,
      member_count: 42,
      tax_rate: 0.1,
    });

    renderModal();
    act(() => usePublicInfoModalStore.getState().open('corporation', 2));
    await screen.findByText('SOME');

    act(() => navigateTo('/contacts?tab=all'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => navigateTo('/fittings/edit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(usePublicInfoModalStore.getState().request).toBeNull();
  });

  describe('Employment tab', () => {
    const char = {
      name: 'Hist Pilot',
      corporation_id: 2,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'male',
      race_id: 1,
      security_status: 1.5,
    };
    const corp = {
      name: 'Some Corp',
      ticker: 'SOME',
      ceo_id: 99,
      creator_id: 99,
      member_count: 42,
      tax_rate: 0.1,
    };

    it('lazy-loads the character corporation history only once the tab is opened', async () => {
      let historyRequests = 0;
      mockCharacter(91, char);
      mockCorporation(2, corp);
      server.use(
        http.get(`${ESI_BASE_URL}/characters/91/corporationhistory`, () => {
          historyRequests++;
          return HttpResponse.json([
            { corporation_id: 10, record_id: 1, start_date: '2020-01-01T00:00:00Z' },
            { corporation_id: 2, record_id: 2, start_date: '2022-01-01T00:00:00Z' },
          ]);
        })
      );
      mockNames([
        { id: 10, name: 'Old Corp' },
        { id: 2, name: 'Some Corp' },
        { id: 99, name: 'CEO Pilot' },
      ]);

      renderModal();
      act(() => usePublicInfoModalStore.getState().open('character', 91));

      const dialog = await screen.findByRole('dialog');
      const tab = await within(dialog).findByRole('tab', { name: 'Employment' });
      await within(dialog).findByRole('tab', { name: 'Corporation' });
      expect(historyRequests).toBe(0);

      tab.click();

      expect(await within(dialog).findByText('Old Corp')).toBeInTheDocument();
      expect(within(dialog).getByText('Current')).toBeInTheDocument();
      expect(historyRequests).toBe(1);
    });

    it('shows an empty state for an empty history', async () => {
      mockCharacter(91, char);
      mockCorporation(2, corp);
      mockNames([{ id: 99, name: 'CEO Pilot' }]);
      server.use(
        http.get(`${ESI_BASE_URL}/characters/91/corporationhistory`, () => HttpResponse.json([]))
      );

      renderModal();
      act(() => usePublicInfoModalStore.getState().open('character', 91));

      const dialog = await screen.findByRole('dialog');
      (await within(dialog).findByRole('tab', { name: 'Employment' })).click();

      expect(await within(dialog).findByText('No employment history')).toBeInTheDocument();
    });

    it('shows the error state when the history is unreadable and uncached', async () => {
      mockCharacter(91, char);
      mockCorporation(2, corp);
      mockNames([{ id: 99, name: 'CEO Pilot' }]);
      server.use(
        http.get(`${ESI_BASE_URL}/characters/91/corporationhistory`, () => HttpResponse.error())
      );

      renderModal();
      act(() => usePublicInfoModalStore.getState().open('character', 91));

      const dialog = await screen.findByRole('dialog');
      (await within(dialog).findByRole('tab', { name: 'Employment' })).click();

      expect(await within(dialog).findByText('Could not load')).toBeInTheDocument();
    });

    it('has no Employment tab for a corporation request', async () => {
      mockCorporation(2, corp);
      mockNames([{ id: 99, name: 'CEO Pilot' }]);

      renderModal();
      act(() => usePublicInfoModalStore.getState().open('corporation', 2));

      const dialog = await screen.findByRole('dialog');
      await screen.findByText('SOME');
      expect(within(dialog).queryByRole('tab', { name: 'Employment' })).not.toBeInTheDocument();
    });
  });
});
