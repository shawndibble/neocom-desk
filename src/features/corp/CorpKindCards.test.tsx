/** A card caps at three rows and its footer expands in place to every row, in order. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpKindCards } from './CorpKindCards';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { CorpBoardItem, CorpBoardItemKind } from '@/engine/corp/board';
import type { CorpCapabilities } from '@/engine/corpRoles';

const fuel = (n: number): CorpBoardItem => ({
  id: `fuel-${n}`,
  kind: 'structureFuel',
  subject: `Structure ${n}`,
  detail: '',
  deadlineMs: null,
  remainingMs: null,
  timing: 'untimed',
  severity: 'clear',
  typeId: null,
  withinStaleWindow: false,
});

describe('CorpKindCards', () => {
  it('expands a capped card to every row and collapses again', async () => {
    const grouped = new Map<CorpBoardItemKind, CorpBoardItem[]>([
      ['structureFuel', [1, 2, 3, 4, 5].map(fuel)],
    ]);
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={grouped}
            capabilities={{ canReadStructures: true } as CorpCapabilities}
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.queryByText('Structure 4')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show all 5' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(screen.getByText('Structure 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Structure 4')).not.toBeInTheDocument();
  });
});
