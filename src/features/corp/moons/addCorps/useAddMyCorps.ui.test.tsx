import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { useAddCorpsRunStore } from '../useAddCorpsRun';
import { useMoonsHiddenCorpsStore } from '../moonsHiddenCorps';
import { BOOK_CORPORATION_ID, CORPS, corpName, freshRun } from './addCorpsFixtures';
import { useAddMyCorps } from './useAddMyCorps';

const reload = vi.fn();
const beginOwnCorpGrantLogin = vi.fn();
const removeOwnCorpFeederRemote = vi.fn();
let candidates = CORPS.slice(0, 3);

vi.mock('../useBook', () => ({
  useBook: () => ({
    characterId: 7,
    corporationId: BOOK_CORPORATION_ID,
    canEdit: true,
    reload,
    names: { corporation: (id: number) => corpName(id) },
  }),
}));
const verifyOwnCeoCorp = vi.fn(async () => true);
vi.mock('../useOwnCeoCorps', () => ({
  useOwnCeoCorps: () => ({ corps: candidates, loading: false, error: false }),
  verifyOwnCeoCorp: (...a: unknown[]) => verifyOwnCeoCorp(...(a as [])),
}));
vi.mock('@/app/loginFlow', () => ({
  beginOwnCorpGrantLogin: (...a: unknown[]) => beginOwnCorpGrantLogin(...a),
}));
vi.mock('@/sync/corpSyncGrantApi', () => ({
  removeOwnCorpFeederRemote: (...a: unknown[]) => removeOwnCorpFeederRemote(...a),
}));

function Harness({ rows = [] }: { rows?: MoonOwnerRow[] }) {
  const add = useAddMyCorps(rows);
  return (
    <>
      {add.showButton && <button onClick={add.open}>Add my other corps</button>}
      {add.notices}
      {add.needsYou}
      {add.dialogs}
    </>
  );
}

const at = (state?: unknown) => (
  <MemoryRouter initialEntries={[{ pathname: '/corp/moons/moon-owners', state }]}>
    <Harness rows={[]} />
  </MemoryRouter>
);

beforeEach(async () => {
  cleanup();
  reload.mockReset();
  beginOwnCorpGrantLogin.mockReset().mockResolvedValue(undefined);
  removeOwnCorpFeederRemote.mockReset().mockResolvedValue({ ok: true });
  candidates = CORPS.slice(0, 3);
  await useAddCorpsRunStore.getState().setValue(null);
  await useMoonsHiddenCorpsStore.getState().setValue({ hidden: [], seen: [] });
});

describe('Add my other corps on the page', () => {
  it('walks pick, confirm and sign-in, starting the run for the chosen corps', async () => {
    render(at());
    await userEvent.click(await screen.findByRole('button', { name: 'Add my other corps' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Connect Ashen Harbor Mining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with 1 corp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect 1 corp' }));
    expect(
      await screen.findByRole('heading', { name: 'Logging in: corp 1 of 1' })
    ).toBeInTheDocument();
    const run = useAddCorpsRunStore.getState().value!;
    expect(run.queue.map((c) => c.corporationId)).toEqual([CORPS[1]!.corporationId]);
    expect(run.coverageFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await userEvent.click(screen.getByRole('button', { name: 'Log in as Mira Soltane with EVE' }));
    expect(beginOwnCorpGrantLogin).toHaveBeenCalledWith({
      characterId: 7,
      expectedCeoCharacterId: CORPS[1]!.ceoCharacterId,
      collectorCorporationId: BOOK_CORPORATION_ID,
      feederCorporationId: CORPS[1]!.corporationId,
      coverageFrom: run.coverageFrom,
    });
  });

  it('marks every candidate seen when the picker opens, so only a later corp is new', async () => {
    render(at());
    await userEvent.click(await screen.findByRole('button', { name: 'Add my other corps' }));
    await waitFor(() =>
      expect(useMoonsHiddenCorpsStore.getState().value.seen).toEqual(
        CORPS.slice(0, 3).map((c) => c.corporationId)
      )
    );
  });

  it('offers a new corp once: Connect it opens the picker with it ticked', async () => {
    await useMoonsHiddenCorpsStore
      .getState()
      .setValue({ hidden: [], seen: CORPS.slice(0, 2).map((c) => c.corporationId) });
    render(at());
    expect(await screen.findByText('New corp found: Cobalt Drift Syndicate.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect it' }));
    expect(screen.getByRole('checkbox', { name: 'Connect Cobalt Drift Syndicate' })).toBeChecked();
  });

  it("Not now hides the banner for the visit and Don't ask again hides the corp for good", async () => {
    await useMoonsHiddenCorpsStore
      .getState()
      .setValue({ hidden: [], seen: [CORPS[0]!.corporationId] });
    render(at());
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/New corp found: Ashen/)).toBeNull();
    expect(screen.getByText(/New corp found: Cobalt/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Don't ask again" }));
    await waitFor(() =>
      expect(useMoonsHiddenCorpsStore.getState().value.hidden).toEqual([CORPS[2]!.corporationId])
    );
  });

  it('Hidden corps opens only from the picker footer, and Add brings a corp back', async () => {
    await useMoonsHiddenCorpsStore
      .getState()
      .setValue({ hidden: [CORPS[2]!.corporationId], seen: [] });
    render(at());
    expect(screen.queryByText('Hidden corps')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Add my other corps' }));
    expect(screen.queryByText('Cobalt Drift Syndicate')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Hidden corps (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Cobalt Drift Syndicate back' }));
    await waitFor(() => expect(useMoonsHiddenCorpsStore.getState().value.hidden).toEqual([]));
  });

  it('back from EVE connected: records it, reloads the book and opens the next corp', async () => {
    await useAddCorpsRunStore.getState().setValue(freshRun());
    render(at({ ownCorpGrant: { status: 'connected', corporationId: CORPS[0]!.corporationId } }));
    expect(
      await screen.findByText('Connected Ironvale Reach. Next up is Ashen Harbor Mining.')
    ).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
    expect(useAddCorpsRunStore.getState().value!.outcomes[CORPS[0]!.corporationId]).toEqual({
      kind: 'connected',
    });
  });

  it('back from EVE as the wrong character: the same corp again, nothing connected', async () => {
    await useAddCorpsRunStore.getState().setValue(freshRun());
    render(
      at({
        ownCorpGrant: {
          status: 'wrong-character',
          corporationId: CORPS[0]!.corporationId,
          signedInAs: 'Dax Orlen',
        },
      })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('You logged in as Dax Orlen.');
    expect(screen.getByRole('heading', { name: 'Logging in: corp 1 of 12' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a closed dialog on a pending run leaves a Continue affordance', async () => {
    await useAddCorpsRunStore.getState().setValue(freshRun());
    render(at());
    await userEvent.click(await screen.findByRole('button', { name: 'Continue (0 of 12)' }));
    expect(screen.getByRole('heading', { name: 'Logging in: corp 1 of 12' })).toBeInTheDocument();
    expect(screen.queryByText(/Next up is/)).toBeNull();
  });

  it('after the last corp the dialog closes and Needs you lists what did not connect', async () => {
    const one = { ...freshRun(), queue: CORPS.slice(0, 1) };
    await useAddCorpsRunStore.getState().setValue(one);
    render(
      at({
        ownCorpGrant: {
          status: 'refused',
          corporationId: CORPS[0]!.corporationId,
          reason: 'not-an-accountant',
        },
      })
    );
    expect(await screen.findByText('Needs you (1)')).toBeInTheDocument();
    expect(screen.getByText('Needs a role')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Signing in/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Log in again for Ironvale Reach' }));
    expect(
      await screen.findByRole('heading', { name: 'Logging in: corp 1 of 1' })
    ).toBeInTheDocument();
  });

  it('removes a corp of his own that went quiet, then reloads the book', async () => {
    const row = {
      id: 'x',
      corporationId: CORPS[2]!.corporationId,
      status: 'cant-read',
      sameOwner: true,
    } as MoonOwnerRow;
    render(
      <MemoryRouter>
        <Harness rows={[row]} />
      </MemoryRouter>
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Cobalt Drift Syndicate' })
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(removeOwnCorpFeederRemote).toHaveBeenCalledWith({
      editorCharacterId: 7,
      collectorCorporationId: BOOK_CORPORATION_ID,
      feederCorporationId: CORPS[2]!.corporationId,
    });
  });

  it('does not send a stale corporation to EVE: it is recorded as not connected', async () => {
    verifyOwnCeoCorp.mockResolvedValueOnce(false);
    render(at());
    await userEvent.click(await screen.findByRole('button', { name: 'Add my other corps' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Connect Ashen Harbor Mining' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with 1 corp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect 1 corp' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Log in as Mira Soltane with EVE' })
    );
    expect(beginOwnCorpGrantLogin).not.toHaveBeenCalled();
    expect(await screen.findByText(/not in this corporation/i)).toBeInTheDocument();
  });
});
