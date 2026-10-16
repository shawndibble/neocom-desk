import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FittingRecord } from '@/db';
import type { CharacterFitting } from '@/esi/endpoints';
import { FittingPreview } from './FittingPreview';
import { setDogmaEngineStatus } from './dogmaEngineStatus';
import type { LibraryRow } from './useLibraryFittings';

// The numbers and the Ring are other modules' jobs; this proves what the preview offers per row.
vi.mock('./FittingRing', () => ({ FittingRing: () => <div data-testid="ring" /> }));
const compared = vi.hoisted(() => ({
  state: { values: [null] as unknown[], failed: [false], retry: vi.fn() },
}));
vi.mock('./useCompareStats', () => ({ useCompareStats: () => compared.state }));
vi.mock('./useCompareFittings', () => ({ useCompareFittings: () => [] }));
const pilot = vi.hoisted(() => ({
  state: { profile: null as unknown, failed: false, skillsKnown: true, retry: vi.fn() },
}));
vi.mock('./fittingPilotProfile', () => ({ usePilotProfile: () => pilot.state }));
vi.mock('./FittingPreviewPanels', () => ({
  DefensePanel: () => null,
  FitMeters: () => null,
  NotesPanel: ({ text }: { text: string }) => <p>{text}</p>,
  OffensePanel: () => null,
  SkillsPanel: () => null,
}));

function inGameRow(description: string): LibraryRow {
  const inGame: CharacterFitting = {
    fitting_id: 1,
    name: 'Drake 2022',
    description,
    ship_type_id: 24698,
    items: [],
  };
  return { id: 'game-1', name: inGame.name, hull: 'Drake', source: 'inGame', inGame };
}

function savedRow(hull: string | null): LibraryRow {
  const record: FittingRecord = {
    id: 'r1',
    characterId: 7,
    name: 'Kite',
    code: '1.abc',
    updatedAt: 1,
  };
  return { id: 'r1', name: 'Kite', hull, source: 'saved', record };
}

const noop = () => {};
function show(row: LibraryRow) {
  render(
    <FittingPreview
      row={row}
      characterId={7}
      catalogue={null}
      onOpen={noop}
      onCompare={noop}
      onRename={noop}
      onDelete={noop}
      onSaveNotes={noop}
    />
  );
}

describe('FittingPreview', () => {
  const heading = (name: string) => screen.queryByRole('heading', { name });

  it('shows the Ring, then Offense, Defense and Skills as boxes, with Notes when an In-game fitting has a description', () => {
    show(inGameRow('Kite the frigates.'));
    expect(screen.getByTestId('ring')).toBeInTheDocument();
    for (const name of ['Offense', 'Defense', 'Skills', 'Notes']) {
      expect(heading(name)).toBeInTheDocument();
    }
    expect(screen.getByText('Kite the frigates.')).toBeInTheDocument();
  });

  it('leaves Notes out when there is no description to show', () => {
    show(inGameRow('   '));
    expect(heading('Offense')).toBeInTheDocument();
    expect(heading('Notes')).not.toBeInTheDocument();
  });

  it('always offers Notes on a saved fitting, so notes can be written', () => {
    show(savedRow('Rifter'));
    expect(heading('Notes')).toBeInTheDocument();
  });

  it('says an unreadable saved fitting cannot be read, with no Ring or boxes', () => {
    show(savedRow(null));
    expect(screen.getByText(/can no longer be read/)).toBeInTheDocument();
    expect(screen.queryByTestId('ring')).not.toBeInTheDocument();
    expect(heading('Offense')).not.toBeInTheDocument();
  });

  describe('when no numbers come', () => {
    afterEach(() => {
      compared.state = { values: [null], failed: [false], retry: vi.fn() };
      pilot.state = { profile: null, failed: false, skillsKnown: true, retry: vi.fn() };
      setDogmaEngineStatus('idle');
      Reflect.deleteProperty(navigator, 'onLine');
    });

    it('says the calculation failed, not "Calculating…", and Retry calculates again', async () => {
      compared.state = { values: [null], failed: [true], retry: vi.fn() };
      show(savedRow('Rifter'));
      expect(screen.getByRole('alert')).toHaveTextContent('Stats unavailable');
      expect(screen.queryByText('Calculating…')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(compared.state.retry).toHaveBeenCalledOnce();
    });

    it('offline with the ship data never downloaded: the one-time download copy', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      setDogmaEngineStatus('failed');
      compared.state = { values: [null], failed: [true], retry: vi.fn() };
      show(savedRow('Rifter'));
      expect(screen.getByRole('alert')).toHaveTextContent('Connect once to enable them.');
    });

    it('does not calculate forever when the pilot skills could not be loaded', async () => {
      pilot.state = { profile: null, failed: true, skillsKnown: true, retry: vi.fn() };
      show(savedRow('Rifter'));
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this Character's skills");
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(pilot.state.retry).toHaveBeenCalledOnce();
    });

    it('notes that skills are unknown beside numbers that assume none', () => {
      compared.state = { values: [{}], failed: [false], retry: vi.fn() };
      pilot.state = { profile: {}, failed: false, skillsKnown: false, retry: vi.fn() };
      show(savedRow('Rifter'));
      expect(screen.getByText('Pilot skills unknown: stats assume no skills.')).toBeVisible();
    });
  });
});
