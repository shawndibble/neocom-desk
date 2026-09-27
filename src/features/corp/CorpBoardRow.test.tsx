/**
 * Covers the visible "More actions" button (WCAG 2.1.1 fix for
 * keyboard-unreachable row actions) and that it lists the same items as the
 * right-click menu.
 */
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

const structureItem: CorpBoardItem = {
  id: 'structure-1',
  kind: 'structureFuel',
  subject: 'Keepstar',
  detail: '',
  deadlineMs: null,
  remainingMs: null,
  timing: 'untimed',
  severity: 'clear',
  typeId: null,
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
  it('gives the row a focusable "More actions" button naming its subject', () => {
    renderRow(jobItem);
    expect(
      screen.getByRole('button', { name: 'More actions for Rifter Blueprint' })
    ).toBeInTheDocument();
  });

  it('opens the same items from the button as from the context menu', async () => {
    const user = userEvent.setup();
    renderRow(jobItem);

    await user.click(screen.getByRole('button', { name: 'More actions for Rifter Blueprint' }));
    const buttonItems = screen.getAllByRole('menuitem').map((el) => el.textContent);
    await user.keyboard('{Escape}');

    fireEvent.contextMenu(screen.getByText('Rifter Blueprint'));
    const contextItems = screen.getAllByRole('menuitem').map((el) => el.textContent);

    expect(buttonItems).toEqual(['Copy name', 'Show info', 'View in Market']);
    expect(contextItems).toEqual(buttonItems);
  });

  it('omits Show info and View in Market for a row with no market item', async () => {
    const user = userEvent.setup();
    renderRow(structureItem);

    await user.click(screen.getByRole('button', { name: 'More actions for Keepstar' }));
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy name']);
  });

  it("calls the page's showInfo with the item's typeId from the button menu", async () => {
    const user = userEvent.setup();
    const actions = fakeItemActions();
    renderRow(jobItem, actions);

    await user.click(screen.getByRole('button', { name: 'More actions for Rifter Blueprint' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));

    expect(actions.showInfo).toHaveBeenCalledWith(587, 'Rifter Blueprint');
  });

  it('titles the truncated subject and detail lines with their full text', () => {
    renderRow(jobItem);

    expect(screen.getByText('Rifter Blueprint')).toHaveAttribute('title', 'Rifter Blueprint');
    expect(screen.getByText('Job finished, waiting on delivery')).toHaveAttribute(
      'title',
      'Job finished, waiting on delivery'
    );
  });
});
