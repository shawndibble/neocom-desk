import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { loadTypeNames } from '@/features/character/typeNames';
import { TypeOverridesDialog } from './TypeOverridesDialog';
import {
  loadManualIgnoredTypeIds,
  loadManualMoonOreTypeIds,
  tagAsIgnored,
  tagAsMoonOre,
} from './typeOverrides';

vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));

const mockedLoadTypeNames = vi.mocked(loadTypeNames);

const CHROMITE = 45501;
const VELDSPAR = 1230;

beforeEach(async () => {
  await db.settings.clear();
  mockedLoadTypeNames.mockClear();
  mockedLoadTypeNames.mockResolvedValue(
    new Map([
      [CHROMITE, 'Chromite'],
      [VELDSPAR, 'Veldspar'],
    ])
  );
});

function renderDialog(onChanged = vi.fn()) {
  render(<TypeOverridesDialog open onClose={vi.fn()} onChanged={onChanged} />);
  return onChanged;
}

describe('TypeOverridesDialog', () => {
  it('lists both override lists under their own headings', async () => {
    await tagAsMoonOre(CHROMITE);
    await tagAsIgnored(VELDSPAR);
    renderDialog();

    expect(await screen.findByText('Chromite')).toBeInTheDocument();
    expect(screen.getByText('Veldspar')).toBeInTheDocument();
    expect(screen.getByText('Tagged as moon ore')).toBeInTheDocument();
    expect(screen.getByText('Ignored')).toBeInTheDocument();
  });

  it('says so when nothing has been tagged by hand', async () => {
    renderDialog();
    expect(
      await screen.findByText("You haven't tagged any ore types by hand.")
    ).toBeInTheDocument();
  });

  it('removes a moon-ore tag from Dexie and tells the route to refresh', async () => {
    await tagAsMoonOre(CHROMITE);
    const onChanged = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove the Chromite tag' }));

    await waitFor(async () => {
      expect(await loadManualMoonOreTypeIds()).toEqual([]);
    });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByText('Chromite')).not.toBeInTheDocument();
  });

  it('removing from one list never touches the other', async () => {
    await tagAsMoonOre(CHROMITE);
    await tagAsIgnored(VELDSPAR);
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove the Veldspar tag' }));

    await waitFor(async () => {
      expect(await loadManualIgnoredTypeIds()).toEqual([]);
    });
    expect(await loadManualMoonOreTypeIds()).toEqual([CHROMITE]);
    expect(screen.getByText('Chromite')).toBeInTheDocument();
  });

  it('falls back to the raw id when a name will not resolve', async () => {
    mockedLoadTypeNames.mockResolvedValue(new Map());
    await tagAsMoonOre(CHROMITE);
    renderDialog();

    expect(await screen.findByText(`#${CHROMITE}`)).toBeInTheDocument();
  });

  it('resolves both lists in one batched name lookup', async () => {
    await tagAsMoonOre(CHROMITE);
    await tagAsIgnored(VELDSPAR);
    renderDialog();

    await screen.findByText('Chromite');
    expect(mockedLoadTypeNames).toHaveBeenCalledTimes(1);
    expect(mockedLoadTypeNames).toHaveBeenCalledWith([CHROMITE, VELDSPAR]);
  });
});
