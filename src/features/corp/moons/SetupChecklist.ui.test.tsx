import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { renderInRouter } from '@/test/render';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW } from './corpBookFixture';
import { SetupChecklist } from './SetupChecklist';

type Context = typeof BOOK_CONTEXT;

/** The page's settings host, which the checklist opens rather than its own copy. */
const openSettings = vi.fn();

const render = (context: Context = BOOK_CONTEXT) =>
  renderInRouter(
    <BookProvider value={{ ...context, openSettings }}>
      <SetupChecklist />
    </BookProvider>
  );

describe('SetupChecklist', () => {
  beforeEach(() => {
    localStorage.clear();
    openSettings.mockClear();
  });

  it('lists each step, with a button only on a step to do', async () => {
    render();
    expect(screen.getByText('3 of 4 done')).toBeInTheDocument();
    expect(screen.getByText('10% for every Miner without a rate of their own')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Statements' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(openSettings).toHaveBeenCalledWith('access');
  });

  it('offers the Statements tab while no Statement has been issued', () => {
    render({
      ...BOOK_CONTEXT,
      view: { ...BOOK_VIEW, input: { ...BOOK_VIEW.input, statements: [] } },
    });
    expect(screen.getByRole('button', { name: 'Go to Statements' })).toBeInTheDocument();
  });

  it('stays hidden once dismissed, for this book', async () => {
    const first = render();
    await userEvent.click(screen.getByRole('button', { name: 'Hide the setup checklist' }));
    expect(screen.queryByText('Set up the book')).not.toBeInTheDocument();
    first.unmount();
    render();
    expect(screen.queryByText('Set up the book')).not.toBeInTheDocument();
  });

  it('is not shown to a viewer who cannot edit the book', () => {
    render({ ...BOOK_CONTEXT, verdict: { ...BOOK_CONTEXT.verdict, canEdit: false } });
    expect(screen.queryByText('Set up the book')).not.toBeInTheDocument();
  });

  it('hides itself once every step is done, and stays hidden if a step later lapses', () => {
    const done = render({
      ...BOOK_CONTEXT,
      data: {
        ...(BOOK_CONTEXT.data as object),
        scheduledSync: { status: 'active', characterId: 1, characterName: 'A', enabledAt: 0 },
      } as never,
    });
    expect(screen.queryByText('Set up the book')).not.toBeInTheDocument();
    done.unmount();
    render();
    expect(screen.queryByText('Set up the book')).not.toBeInTheDocument();
  });
});
