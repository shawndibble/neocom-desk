import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { PublicInfoModal } from './PublicInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
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
function mockNames(entries: { id: number; name: string }[]) {
  server.use(
    http.post(`${ESI_BASE_URL}/universe/names`, () =>
      HttpResponse.json(entries.map((e) => ({ ...e, category: 'character' })))
    )
  );
}

describe('PublicInfoModal', () => {
  it('renders nothing when no request is open', () => {
    render(<PublicInfoModal />);
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

    render(<PublicInfoModal />);
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
    mockNames([{ id: 102, name: 'Linked CEO' }]);

    render(<PublicInfoModal />);
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

    render(<PublicInfoModal />);
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

    render(<PublicInfoModal />);
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

    render(<PublicInfoModal />);
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

    render(<PublicInfoModal />);
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
});
