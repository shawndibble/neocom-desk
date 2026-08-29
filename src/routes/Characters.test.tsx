import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { Characters } from './Characters';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id', ({ params }) => {
    if (params.id === '91') {
      return HttpResponse.json({
        name: 'Pilot One',
        corporation_id: 1001,
        alliance_id: 2001,
        birthday: '2015-01-01T00:00:00Z',
        bloodline_id: 1,
        gender: 'female',
        race_id: 1,
      });
    }
    // Character 92: simulate offline / ESI failure.
    return HttpResponse.error();
  }),
  http.get('https://esi.evetech.net/corporations/:id', () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get('https://esi.evetech.net/alliances/:id', () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  usePublicInfo.setState({ byCharacterId: {} });
  await db.characters.bulkPut([
    { characterId: 91, name: 'Pilot One', ownerHash: 'oh-1', addedAt: 1 },
    { characterId: 92, name: 'Pilot Two', ownerHash: 'oh-2', addedAt: 2 },
  ]);
});

function renderCharacters() {
  return render(
    <MemoryRouter initialEntries={['/characters']}>
      <Routes>
        <Route path="/characters" element={<Characters />} />
        <Route path="/overview" element={<div>overview page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Characters', () => {
  it('renders character cards from Dexie with portraits', async () => {
    renderCharacters();
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
    const portrait = screen.getByAltText('Portrait of Pilot One');
    expect(portrait).toHaveAttribute(
      'src',
      'https://images.evetech.net/characters/91/portrait?size=128'
    );
  });

  it('shows corp/alliance names when public info loads, dashes when offline', async () => {
    renderCharacters();
    expect(await screen.findByText('Test Corp')).toBeInTheDocument();
    expect(screen.getByText('Test Alliance')).toBeInTheDocument();
    // Pilot Two's fetch failed: corp and alliance both fall back to a dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('selecting a character persists it as active and navigates to /overview', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Select Pilot One' }));

    expect(await screen.findByText('overview page')).toBeInTheDocument();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(91);
    expect((await db.settings.get(ACTIVE_CHARACTER_KEY))?.value).toBe(91);
  });

  it('add character starts a new EVE login', async () => {
    const { beginEveLogin } = await import('@/app/loginFlow');
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: /add character/i }));
    expect(beginEveLogin).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when no characters exist', async () => {
    await db.characters.clear();
    renderCharacters();
    expect(await screen.findByText(/no characters yet/i)).toBeInTheDocument();
  });
});
