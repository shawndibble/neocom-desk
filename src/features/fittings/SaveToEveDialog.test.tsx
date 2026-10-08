import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SaveToEveDialog } from './SaveToEveDialog';
import type { Fitting } from '@/engine/fittings/types';
import type { CharacterFitting } from '@/esi/endpoints';

const loadInGameFittingsMock = vi.hoisted(() => vi.fn());
vi.mock('./inGameFittings', () => ({ loadInGameFittings: loadInGameFittingsMock }));

const saveFittingToEveMock = vi.hoisted(() => vi.fn());
vi.mock('./saveToEve', async () => {
  const actual = await vi.importActual<typeof import('./saveToEve')>('./saveToEve');
  return { ...actual, saveFittingToEve: saveFittingToEveMock };
});

const FITTING: Fitting = {
  name: 'PvP Rifter',
  shipTypeId: 587,
  modules: [],
  drones: [],
  cargo: [],
};

function existingFitting(overrides: Partial<CharacterFitting> = {}): CharacterFitting {
  return {
    fitting_id: 1,
    name: 'Old Rifter',
    description: '',
    ship_type_id: 587,
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadInGameFittingsMock.mockResolvedValue({
    cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
    needsReauth: false,
  });
});

describe('SaveToEveDialog', () => {
  it("sends the saved fitting's notes as the description", async () => {
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 1, overwriteError: null });
    render(
      <SaveToEveDialog
        open
        onClose={vi.fn()}
        characterId={1}
        fitting={FITTING}
        description="Kite the frigates."
        onSaved={vi.fn()}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(saveFittingToEveMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Kite the frigates.' })
    );
  });

  it('saves as a new In-game Fitting by default, then closes and reports success', async () => {
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 1, overwriteError: null });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <SaveToEveDialog open onClose={onClose} characterId={1} fitting={FITTING} onSaved={onSaved} />
    );

    expect(await screen.findByDisplayValue('PvP Rifter')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveFittingToEveMock).toHaveBeenCalledWith({
      characterId: 1,
      fitting: FITTING,
      name: 'PvP Rifter',
      description: '',
      overwriteFittingId: undefined,
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('offers existing In-game Fittings to overwrite, names the one replaced, and passes its id along', async () => {
    loadInGameFittingsMock.mockResolvedValue({
      cached: {
        data: [existingFitting({ fitting_id: 7, name: 'Old Rifter' })],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 9, overwriteError: null });
    render(
      <SaveToEveDialog open onClose={vi.fn()} characterId={1} fitting={FITTING} onSaved={vi.fn()} />
    );

    await userEvent.click(await screen.findByRole('combobox', { name: 'Save as' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Replace "Old Rifter"' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This deletes "Old Rifter" from your in-game Fittings and replaces it with this one.'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(saveFittingToEveMock).toHaveBeenCalledWith(
      expect.objectContaining({ overwriteFittingId: 7 })
    );
  });

  it('shows ESI’s error and keeps the dialog open when the save fails', async () => {
    saveFittingToEveMock.mockResolvedValue({ ok: false, message: 'ESI is down' });
    const onClose = vi.fn();
    render(
      <SaveToEveDialog open onClose={onClose} characterId={1} fitting={FITTING} onSaved={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/ESI is down/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers to grant the Fittings permission, in place of a bare error, when the grant lacks it', async () => {
    saveFittingToEveMock.mockResolvedValue({
      ok: false,
      message: 'Forbidden',
      needsPermission: true,
    });
    render(
      <SaveToEveDialog open onClose={vi.fn()} characterId={1} fitting={FITTING} onSaved={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/needs the Fittings permission/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grant fittings permission/i })).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
  });

  it('reports a failed overwrite delete instead of silently closing, since the pilot now has both fittings', async () => {
    saveFittingToEveMock.mockResolvedValue({
      ok: true,
      fittingId: 9,
      overwriteError: 'Fitting not found',
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <SaveToEveDialog open onClose={onClose} characterId={1} fitting={FITTING} onSaved={onSaved} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/EVE wouldn't remove the Fitting it was replacing: Fitting not found/)
    ).toBeInTheDocument();
  });

  it('also saves to My Fittings after the EVE save, checked by default', async () => {
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 1, overwriteError: null });
    const saveToMine = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <SaveToEveDialog
        open
        onClose={onClose}
        characterId={1}
        fitting={FITTING}
        onSaved={vi.fn()}
        onSaveToMyFittings={saveToMine}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Also save to My Fittings' })).toBeChecked();
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(saveToMine).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('skips My Fittings when unchecked, and when the EVE save fails', async () => {
    const saveToMine = vi.fn().mockResolvedValue(true);
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 1, overwriteError: null });
    const { unmount } = render(
      <SaveToEveDialog
        open
        onClose={vi.fn()}
        characterId={1}
        fitting={FITTING}
        onSaved={vi.fn()}
        onSaveToMyFittings={saveToMine}
      />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also save to My Fittings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(saveToMine).not.toHaveBeenCalled();
    unmount();

    saveFittingToEveMock.mockResolvedValue({ ok: false, message: 'nope', needsPermission: false });
    render(
      <SaveToEveDialog
        open
        onClose={vi.fn()}
        characterId={1}
        fitting={FITTING}
        onSaved={vi.fn()}
        onSaveToMyFittings={saveToMine}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(saveToMine).not.toHaveBeenCalled();
  });

  it('hides the checkbox when no My Fittings save is offered', async () => {
    render(
      <SaveToEveDialog open onClose={vi.fn()} characterId={1} fitting={FITTING} onSaved={vi.fn()} />
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reports a failed My Fittings save without undoing the EVE save', async () => {
    saveFittingToEveMock.mockResolvedValue({ ok: true, fittingId: 1, overwriteError: null });
    const onSaved = vi.fn();
    render(
      <SaveToEveDialog
        open
        onClose={vi.fn()}
        characterId={1}
        fitting={FITTING}
        onSaved={onSaved}
        onSaveToMyFittings={vi.fn().mockRejectedValue(new Error('disk full'))}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText(/couldn't save it to My Fittings/)).toBeInTheDocument();
  });
});
