import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID } from './corpBookFixture';
import { FullyMinedPanel } from './FullyMinedPanel';
import { MoonDetail } from './MoonDetail';

const editBook = vi.hoisted(() => vi.fn());
vi.mock('../taxBook/bookClient', () => ({ editBook, readAudit: vi.fn().mockResolvedValue([]) }));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

const ORE = [{ typeId: 1, quantity: 210_000 }];
const FLAG = { by: 7, byName: 'Aria Vale', at: '2026-10-20T10:00:00.000Z' };

function renderPanel(patch: Record<string, unknown>, canEdit = true) {
  const view = {
    ...BOOK_VIEW,
    extractions: BOOK_VIEW.extractions.map((x) => (x.id === MOON_ID ? { ...x, ...patch } : x)),
  };
  editBook.mockReset().mockResolvedValue({});
  const edit = editBook;
  const ui = (
    <MemoryRouter>
      <BookProvider
        value={{ ...BOOK_CONTEXT, view, verdict: { ...BOOK_CONTEXT.verdict, canEdit } }}
      >
        <FullyMinedPanel id={MOON_ID} />
      </BookProvider>
    </MemoryRouter>
  );
  return { edit, ...render(ui) };
}

describe('FullyMinedPanel', () => {
  it('not flagged: combined loss labelled residue plus ore never mined; one click marks', async () => {
    const { edit } = renderPanel({ oreLines: ORE, fullyMined: undefined });
    expect(screen.getByText(/residue plus ore never mined/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark fully mined' }));
    expect(edit).toHaveBeenCalledWith(BOOK_CONTEXT.characterId, BOOK_CONTEXT.corporationId, {
      action: 'setFullyMined',
      extractionId: MOON_ID,
      fullyMined: true,
    });
  });

  it('flagged: residue, who and when, and a Clear link that clears', async () => {
    const { edit } = renderPanel({ oreLines: ORE, fullyMined: FLAG });
    expect(screen.getByRole('heading', { name: 'Residue' })).toBeInTheDocument();
    expect(screen.getByText(/Marked fully mined by Aria Vale/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark fully mined' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(edit).toHaveBeenCalledWith(BOOK_CONTEXT.characterId, BOOK_CONTEXT.corporationId, {
      action: 'setFullyMined',
      extractionId: MOON_ID,
      fullyMined: false,
    });
  });

  it('no chunk source: a hint, no figure, no button', () => {
    renderPanel({ oreLines: [], oreSource: 'unknown' });
    expect(screen.getByText(/Loss needs the chunk's ore/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark fully mined' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is read-only without canEdit', () => {
    renderPanel({ oreLines: ORE, fullyMined: FLAG }, false);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('the page hides Left to mine once flagged', () => {
    const view = {
      ...BOOK_VIEW,
      extractions: BOOK_VIEW.extractions.map((x) =>
        x.id === MOON_ID ? { ...x, oreLines: ORE, fullyMined: FLAG } : x
      ),
    };
    render(
      <MemoryRouter>
        <BookProvider value={{ ...BOOK_CONTEXT, view }}>
          <MoonDetail id={MOON_ID} />
        </BookProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('Left to mine, est.')).not.toBeInTheDocument();
  });
});
