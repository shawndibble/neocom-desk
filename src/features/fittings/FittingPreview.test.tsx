import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { FittingRecord } from '@/db';
import type { CharacterFitting } from '@/esi/endpoints';
import { FittingPreview } from './FittingPreview';
import type { LibraryRow } from './useLibraryFittings';

// The numbers and the Ring are other modules' jobs; this proves what the preview offers per row.
vi.mock('./FittingRing', () => ({ FittingRing: () => <div data-testid="ring" /> }));
vi.mock('./useCompareStats', () => ({
  useCompareStats: () => ({ values: [null], failed: [false] }),
}));
vi.mock('./useCompareFittings', () => ({ useCompareFittings: () => [] }));
vi.mock('./fittingPilotProfile', () => ({ usePilotProfile: () => ({ profile: null }) }));
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
    />
  );
}

describe('FittingPreview', () => {
  it('offers Offense, Defense and Skills, and Notes when an In-game fitting has a description', () => {
    show(inGameRow('Kite the frigates.'));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Offense',
      'Defense',
      'Skills',
      'Notes',
    ]);
    expect(screen.getByTestId('ring')).toBeInTheDocument();
  });

  it('leaves Notes out when there is no description to show', () => {
    show(inGameRow('   '));
    expect(screen.queryByRole('tab', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('leaves Notes out for a saved fitting (it has none yet)', () => {
    show(savedRow('Rifter'));
    expect(screen.queryByRole('tab', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('says an unreadable saved fitting cannot be read, with no Ring or tabs', () => {
    show(savedRow(null));
    expect(screen.getByText(/can no longer be read/)).toBeInTheDocument();
    expect(screen.queryByTestId('ring')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
