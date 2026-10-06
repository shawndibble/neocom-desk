/** A board row is read-only: the subject links where it can, and there is no row menu. */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpBoardRow } from './CorpBoardRow';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { CorpBoardItem } from '@/engine/corp/board';

const jobItem: CorpBoardItem = {
  id: 'job-1',
  kind: 'jobDelivery',
  subject: 'Rifter Blueprint',
  detail: '',
  deadlineMs: null,
  remainingMs: null,
  timing: 'untimed',
  severity: 'clear',
  typeId: 587,
  withinStaleWindow: false,
};

function renderRow(item: CorpBoardItem, actions = fakeItemActions()) {
  return render(
    withItemActions(
      <MemoryRouter>
        <ul>
          <CorpBoardRow item={item} />
        </ul>
      </MemoryRouter>,
      actions
    )
  );
}

describe('CorpBoardRow', () => {
  it('carries no More actions button and no context menu', () => {
    renderRow(jobItem);
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText('Rifter Blueprint'));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('shows the truncated subject and detail lines in full in a tooltip, not a native title', async () => {
    renderRow(jobItem);

    const detail = screen.getByText('Job finished, waiting on delivery');
    expect(detail).not.toHaveAttribute('title');
    await userEvent.hover(detail);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Job finished, waiting on delivery'
    );
  });

  it('links an item subject to its Market listing and leaves other subjects plain', () => {
    renderRow(jobItem);
    expect(screen.getByRole('link', { name: 'Rifter Blueprint' }).getAttribute('href')).toContain(
      '/market/browser'
    );
  });
});
