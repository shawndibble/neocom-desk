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

/**
 * The picker with a `selectedLabel` the caller can change later — a plan
 * rewriting its own location is what several of these assert.
 */
function renderPicker(onPick = vi.fn(), selectedLabel: string | null = null) {
  function Wrapper({ label }: { label: string | null }) {
    return (
      <BuildLocationPicker
        summary="NPC station · Jita · Highsec"
        selectedLabel={label}
        onPick={onPick}
        activity="manufacturing"
      >
        <label>
          Facility
          <input />
        </label>
      </BuildLocationPicker>
    );
  }
  const view = render(<Wrapper label={selectedLabel} />);
  return {
    onPick,
    rerender: (label: string | null) => view.rerender(<Wrapper label={label} />),
  };
}

const searchBox = () => screen.getByLabelText('Build location');
const optionId = (structureId: number) => `build-location-option-${structureId}`;

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

  it('keeps the summary and the override toggle while the grant is still unknown', () => {
    // The fields behind Override are the whole feature for anyone who never
    // gets the search, so the link is never gated on it.
    grant.scopes = undefined;
    renderPicker();

    expect(screen.getByRole('button', { name: /Override/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByText(/NPC station · Jita · Highsec/)).toBeInTheDocument();
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

    const toggle = screen.getByRole('button', { name: /Override/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Facility')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
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
    expect(searchBuildLocations).toHaveBeenCalledWith(
      91,
      'K2-18',
      'manufacturing',
      expect.any(AbortSignal)
    );
  });

  it("names the plan's own picked location, so a reload does not blank the box", async () => {
    renderPicker(vi.fn(), 'K2-18 R&D');

    await waitFor(() => expect((searchBox() as HTMLInputElement).value).toBe('K2-18 R&D'));
  });

  it('lets typing replace the shown location, then shows the plan again once a pick lands', async () => {
    const user = userEvent.setup();
    renderPicker(vi.fn(), 'Jita IV - Moon 4');

    await user.clear(searchBox());
    await user.type(searchBox(), 'K2-18');
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18');

    await user.click(await screen.findByRole('option', { name: /K2-18 R&D/ }));

    // The place that was chosen, not the fragment typed to find it. This
    // parent never writes the pick back, so what shows is the picker's own
    // hold — the plan's older name takes over once one lands.
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18 R&D');
  });

  it('lets go of the pick the moment the plan says it is somewhere else', async () => {
    // A manual facility or build-system edit clears the plan's stored
    // location; the box must follow it rather than keep naming the structure
    // the job no longer runs in.
    const user = userEvent.setup();
    const { rerender } = renderPicker(vi.fn(), 'Jita IV - Moon 4');

    await user.type(searchBox(), 'K2-18');
    await user.click(await screen.findByRole('option', { name: /K2-18 R&D/ }));
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18 R&D');

    rerender(null);

    expect((searchBox() as HTMLInputElement).value).toBe('');
  });

  it('hands over every field in one call, and names the pick while the plan catches up', async () => {
    // The parent's write is a Dexie round-trip, so the box states the chosen
    // place itself for that gap rather than falling back to the plan's older
    // one — and the result list closes either way.
    const user = userEvent.setup();
    const { onPick } = renderPicker();

    await user.type(searchBox(), 'K2-18');
    await user.click(await screen.findByRole('option', { name: /K2-18 R&D/ }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(AZBEL);
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18 R&D');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('is a combobox with one tab stop: results are not individually reachable by Tab', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    expect(searchBox()).toHaveAttribute('role', 'combobox');
    expect(searchBox()).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(searchBox());

    await user.tab();

    // Only one tab stop for the whole widget: Tab leaves the input directly
    // rather than landing on a result row first.
    expect(document.activeElement).not.toBe(searchBox());
    expect(document.activeElement?.getAttribute('role')).not.toBe('option');
  });

  it('moves a highlighted option with the arrow keys without moving DOM focus off the input', async () => {
    searchBuildLocations.mockResolvedValue([
      AZBEL,
      { ...AZBEL, structureId: 1036, name: 'Second Result' },
    ]);
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    await user.keyboard('{ArrowDown}');
    expect(searchBox()).toHaveAttribute('aria-activedescendant', optionId(AZBEL.structureId));
    expect(document.activeElement).toBe(searchBox());

    await user.keyboard('{ArrowDown}');
    expect(searchBox()).toHaveAttribute('aria-activedescendant', optionId(1036));
  });

  it('picks the highlighted option on Enter', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledExactlyOnceWith(AZBEL);
    // Same as a click: the box names the pick rather than the typed fragment.
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18 R&D');
  });

  it('closes the list on Escape without clearing the typed query', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('option')).toBeNull();
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
    expect((searchBox() as HTMLInputElement).value).toBe('K2-18');
  });

  it('gives the box back to the plan when the search is abandoned', async () => {
    // Escape keeps the typed text while the pilot is still in the field, but
    // walking away from an unpicked fragment must not leave it standing where
    // the plan's own location belongs.
    const user = userEvent.setup();
    renderPicker(vi.fn(), 'Jita IV - Moon 4');

    await user.clear(searchBox());
    await user.type(searchBox(), 'K2-18');
    await user.tab();

    expect((searchBox() as HTMLInputElement).value).toBe('Jita IV - Moon 4');
  });

  it('announces the result count for a screen reader', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    expect(screen.getByRole('status')).toHaveTextContent('1 result');
  });

  it('announces the highlighted option by name once arrowed onto', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchBox(), 'K2-18');
    await screen.findByRole('option', { name: /K2-18 R&D/ });

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('status')).toHaveTextContent('1 result. K2-18 R&D highlighted.');
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
