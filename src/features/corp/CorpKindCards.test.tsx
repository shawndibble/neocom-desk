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
    // The header carries the total because the card is over the cap.
    expect(screen.getByText('5')).toBeInTheDocument();
    // Read out as text, not as an `aria-label` on a generic span.
    expect(screen.getByText('5 total')).toHaveClass('sr-only');
    expect(document.querySelector('span[aria-label]')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show 2 more' });
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

  it('shows no total and no toggle when the card is within the cap', () => {
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map([['structureFuel', [1, 2, 3].map(fuel)]])}
            capabilities={{ canReadStructures: true } as CorpCapabilities}
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  it('gives an empty readable kind one quiet line, and no card for an unreadable kind', () => {
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map([['structureFuel', [fuel(1)]]])}
            capabilities={{ canReadStructures: true } as CorpCapabilities}
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.getByRole('heading', { name: 'Structure timers' })).toBeInTheDocument();
    const line = screen.getByText('No structure is on a timer.');
    expect(line.tagName).toBe('P');
    expect(line).not.toHaveClass('uppercase');
    expect(screen.queryByRole('heading', { name: 'Industry jobs' })).not.toBeInTheDocument();
  });

  const renderCards = (grouped: Map<CorpBoardItemKind, CorpBoardItem[]>) =>
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={grouped}
            capabilities={
              {
                canReadStructures: true,
                canReadMoonExtractions: true,
                canReadIndustry: true,
              } as CorpCapabilities
            }
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );

  it('folds two empty readable cards into one summary line beside a data card', () => {
    renderCards(new Map([['structureFuel', [fuel(1)]]]));
    expect(screen.getByText('Structure 1')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing due: Structure timers · Moon chunks · Industry jobs')
    ).toBeInTheDocument();
    expect(screen.queryByText('No structure is on a timer.')).not.toBeInTheDocument();
  });

  it('keeps a single empty card as its own quiet line', () => {
    renderCards(
      new Map([
        ['structureFuel', [fuel(1)]],
        ['structureTimer', [fuel(2)]],
        ['moonExtraction', [fuel(3)]],
      ])
    );
    expect(screen.getByText('No job is waiting.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing due/)).not.toBeInTheDocument();
  });

  it('renders only the summary when every card is empty', () => {
    renderCards(new Map());
    expect(
      screen.getByText('Nothing due: Fuel · Structure timers · Moon chunks · Industry jobs')
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('does not fold an unreadable kind into the summary', () => {
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map()}
            capabilities={{ canReadStructures: true } as CorpCapabilities}
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    const summary = screen.getByText(/Nothing due/);
    expect(summary).not.toHaveTextContent('Moon chunks');
    expect(summary).not.toHaveTextContent('Industry jobs');
  });

  it('moves a card out of the summary when it gains rows', () => {
    const { rerender } = renderCards(new Map());
    expect(screen.getByText(/Nothing due: Fuel/)).toBeInTheDocument();
    rerender(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map([['structureFuel', [fuel(1)]]])}
            capabilities={
              {
                canReadStructures: true,
                canReadMoonExtractions: true,
                canReadIndustry: true,
              } as CorpCapabilities
            }
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.getByText('Structure 1')).toBeInTheDocument();
    expect(screen.getByText(/Nothing due: Structure timers/)).toBeInTheDocument();
  });

  it('says "couldn\'t load" for a permitted kind whose read failed, never "every structure is fuelled"', () => {
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map()}
            capabilities={
              {
                canReadStructures: true,
                canReadMoonExtractions: true,
                canReadIndustry: true,
              } as CorpCapabilities
            }
            unreadable={
              new Set<CorpBoardItemKind>(['structureFuel', 'structureTimer', 'jobDelivery'])
            }
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.queryByText('Every structure is fuelled.')).not.toBeInTheDocument();
    expect(screen.queryByText('No structure is on a timer.')).not.toBeInTheDocument();
    expect(screen.queryByText('No job is waiting.')).not.toBeInTheDocument();
    // Three failed cards, each with its title and the load-failed line.
    expect(screen.getAllByText("Couldn't load")).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Fuel' })).toBeInTheDocument();
    // The one kind that did load and is empty keeps its own honest empty line.
    expect(screen.getByText('No moon drill is running.')).toBeInTheDocument();
  });

  it('shows no card for an unpermitted kind even if its read is marked unreadable', () => {
    render(
      withItemActions(
        <MemoryRouter>
          <CorpKindCards
            grouped={new Map()}
            capabilities={{ canReadStructures: true } as CorpCapabilities}
            unreadable={new Set<CorpBoardItemKind>(['jobDelivery'])}
          />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(screen.queryByRole('heading', { name: 'Industry jobs' })).not.toBeInTheDocument();
  });
});
