import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { DeleteBookSection } from './DeleteBookSection';
import type { BookContextValue } from './bookContextValue';
import type { OfficerVerdict } from '../taxBook/bookClient';

const deleteBook = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  deleteBook: (...a: unknown[]) => deleteBook(...a),
  editBook: vi.fn(),
}));

const CORP = 98000001;
const ME = 7;

function renderSection(verdict: Partial<OfficerVerdict>, ownerCharacterId: number | null = ME) {
  const reload = vi.fn();
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: ME,
            corporationId: CORP,
            verdict: { isCeo: false, isDirector: false, canEdit: true, ...verdict },
            settings: { ownerCharacterId },
            reload,
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <DeleteBookSection />
      </BookProvider>
    </MemoryRouter>
  );
  return { reload };
}

const openButton = () => screen.queryByRole('button', { name: 'Delete the book…' });

beforeEach(() => {
  deleteBook.mockReset().mockResolvedValue(undefined);
});

describe('DeleteBookSection', () => {
  it.each([
    ['the Director who turned it on', { isDirector: true }, ME, true],
    ['the CEO', { isCeo: true, isDirector: true }, 99, true],
    ['another Director', { isDirector: true }, 99, false],
    ['an Accountant who opened nothing', {}, ME, false],
  ])('for %s', (_who, verdict, owner, shown) => {
    renderSection(verdict, owner);
    if (shown) expect(openButton()).toBeInTheDocument();
    else expect(openButton()).not.toBeInTheDocument();
  });

  it('confirming deletes the book and reloads', async () => {
    const { reload } = renderSection({ isDirector: true });
    await userEvent.click(openButton()!);
    await userEvent.click(screen.getByRole('button', { name: 'Delete the book' }));
    await waitFor(() => expect(deleteBook).toHaveBeenCalledWith(ME, CORP));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
