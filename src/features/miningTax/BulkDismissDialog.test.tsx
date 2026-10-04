import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BulkDismissDialog } from './BulkDismissDialog';
import type { DisplayRow } from './groupRows';

const dismissEntries = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('./assignments', () => ({
  dismissEntries: (...args: unknown[]) => dismissEntries(...args),
}));

const ROW = {
  key: 'r1',
  status: 'unassigned',
  assignment: null,
  row: {
    characterId: 1,
    characterName: 'Pilot One',
    entry: { characterId: 1, date: '2026-09-09', solarSystemId: 30000142, oreLines: [] },
    assignments: [],
    unassignedOreLines: [{ typeId: 1230, quantity: 100 }],
  },
} as unknown as DisplayRow;

describe('BulkDismissDialog — a failed save', () => {
  it('says so and stays open', async () => {
    dismissEntries.mockRejectedValueOnce(new Error('quota'));
    const onDismissed = vi.fn();
    const onClose = vi.fn();
    render(
      <BulkDismissDialog
        open
        onClose={onClose}
        rows={[ROW]}
        systemNames={new Map([[30000142, 'Jita']])}
        estimatedValueOf={() => 1_000}
        showCharacter={false}
        onDismissed={onDismissed}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss 1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onDismissed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dismiss 1' })).toBeEnabled();
  });
});
