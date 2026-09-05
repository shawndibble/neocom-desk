/**
 * The picker's own behaviour, with the search and the grant state mocked. The
 * search's ESI path is pinned by `searchBuildLocations.test.ts`; what matters
 * here is the scope prompt, the debounce, and that picking hands over every
 * field in one call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BuildLocationPicker } from './BuildLocationPicker';
import type { BuildLocationOption } from './buildLocations';

const grant = vi.hoisted(() => ({
  scopes: ['esi-search.search_structures.v1'] as string[] | undefined,
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: () => grant.scopes }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number | null }) => unknown) =>
    select({ activeCharacterId: 91 }),
}));

const beginEveLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/loginFlow', () => ({ beginEveLogin }));

const searchBuildLocations = vi.hoisted(() => vi.fn());
vi.mock('./searchBuildLocations', () => ({ searchBuildLocations, MIN_SEARCH_LENGTH: 3 }));

const AZBEL: BuildLocationOption = {
  structureId: 1035,
  name: 'K2-18 R&D',
  facility: 'azbel',
  systemId: 30003888,
  systemName: 'Badivefi',
  security: 'highsec',
};

beforeEach(() => {
  grant.scopes = ['esi-search.search_structures.v1'];
  beginEveLogin.mockReset();
  searchBuildLocations.mockReset();
  searchBuildLocations.mockResolvedValue([AZBEL]);
});

function renderPicker(onPick = vi.fn()) {
  render(
    <BuildLocationPicker summary="NPC station · Jita · Highsec" onPick={onPick}>
      <label>
        Facility
        <input />
      </label>
    </BuildLocationPicker>
  );
  return onPick;
}

const searchBox = () => screen.getByLabelText('Build location');

describe('BuildLocationPicker', () => {
  it('offers a re-auth instead of the search for a token predating the scope', async () => {
    // The scope is in the base grant, so this only ever happens to a Character
    // added before it existed. `/industry` stays usable meanwhile.
    const user = userEvent.setup();
    grant.scopes = [];
    renderPicker();

    expect(screen.queryByLabelText('Build location')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: 91 });
  });

  it('keeps the summary and the override link while the grant is still unknown', () => {
    // The fields behind Override are the whole feature for anyone who never
    // gets the search, so the link is never gated on it.
    grant.scopes = undefined;
    renderPicker();

    expect(screen.getByText(/NPC station · Jita · Highsec/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Override' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Build location')).toBeNull();
  });

  it('states what the plan is set to, with the fields folded away', () => {
    renderPicker();

    expect(screen.getByText(/NPC station · Jita · Highsec/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Facility')).toBeNull();
  });

  it('reveals the fields on Override, and folds them again', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Override' }));
    expect(screen.getByLabelText('Facility')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByLabelText('Facility')).toBeNull();
  });

  it('searches what was typed and lists what came back', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');

    expect(await screen.findByText('K2-18 R&D')).toBeInTheDocument();
    expect(screen.getByText('Azbel · Badivefi')).toBeInTheDocument();
  });

  it('never searches below three characters', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2');

    await waitFor(() => expect(searchBuildLocations).not.toHaveBeenCalled());
  });

  it('debounces a burst of typing into one request', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByText('K2-18 R&D');

    expect(searchBuildLocations).toHaveBeenCalledOnce();
    expect(searchBuildLocations).toHaveBeenCalledWith(91, 'K2-18', expect.any(AbortSignal));
  });

  it('hands over every field in one call, and clears itself', async () => {
    const user = userEvent.setup();
    const onPick = renderPicker();

    await user.type(searchBox(), 'K2-18');
    await user.click(await screen.findByRole('button', { name: /K2-18 R&D/ }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(AZBEL);
    expect((searchBox() as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('K2-18 R&D')).toBeNull();
  });

  it('says the search failed rather than pretending nothing matched', async () => {
    const user = userEvent.setup();
    searchBuildLocations.mockRejectedValue(new Error('offline'));
    renderPicker();

    await user.type(searchBox(), 'K2-18');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search failed. Check your connection and try again.'
    );
    expect(screen.queryByText('Nothing found. Try more of the name.')).toBeNull();
  });

  it('says so when the search finds nothing', async () => {
    const user = userEvent.setup();
    searchBuildLocations.mockResolvedValue([]);
    renderPicker();

    await user.type(searchBox(), 'Nowhere');

    expect(await screen.findByText('Nothing found. Try more of the name.')).toBeInTheDocument();
  });

  it('labels a structure ESI withheld a name for by what and where it is', async () => {
    const user = userEvent.setup();
    searchBuildLocations.mockResolvedValue([{ ...AZBEL, name: null }]);
    renderPicker();

    await user.type(searchBox(), 'K2-18');

    expect(await screen.findByText('Azbel in Badivefi')).toBeInTheDocument();
  });
});
