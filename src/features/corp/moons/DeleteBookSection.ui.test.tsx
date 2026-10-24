import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { DeleteBookDialog, DeleteBookSection } from './DeleteBookSection';
import type { BookContextValue } from './bookContextValue';
import type { OfficerVerdict } from '../taxBook/bookClient';

const deleteBook = vi.fn();
const readBookData = vi.fn();
vi.mock('@/esi/endpoints/corp', () => ({
  getCorporationPublicInfo: () => Promise.resolve({ data: { ticker: 'TEST' } }),
}));
vi.mock('../taxBook/bookClient', () => ({
  deleteBook: (...a: unknown[]) => deleteBook(...a),
  readBookData: (...a: unknown[]) => readBookData(...a),
  readFullAudit: () => Promise.resolve([]),
  editBook: vi.fn(),
}));

const CORP = 98000001;
const ME = 7;

function renderSection(
  verdict: Partial<OfficerVerdict>,
  ownerCharacterId: number | null = ME,
  dialog = false
) {
  const reload = vi.fn();
  const onDelete = vi.fn();
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: ME,
            corporationId: CORP,
            verdict: { isCeo: false, isDirector: false, canEdit: true, ...verdict },
            settings: { ownerCharacterId, createdBy: ownerCharacterId },
            reload,
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <DeleteBookSection onDelete={onDelete} />
        {dialog && <DeleteBookDialog onClose={() => {}} />}
      </BookProvider>
    </MemoryRouter>
  );
  return { reload, onDelete };
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

  it('the entry point only asks the page to open the confirmation', async () => {
    const { onDelete } = renderSection({ isDirector: true });
    await userEvent.click(openButton()!);
    expect(onDelete).toHaveBeenCalled();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it('deletes only once the corporation ticker is typed, then reloads', async () => {
    const { reload } = renderSection({ isDirector: true }, ME, true);
    const confirm = await screen.findByRole('button', { name: 'Delete the book' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'test');
    await userEvent.click(confirm);
    await waitFor(() => expect(deleteBook).toHaveBeenCalledWith(ME, CORP));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('offers a copy first, and holds Delete only while that copy is being read', async () => {
    let finish: (value: null) => void = () => {};
    readBookData.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderSection({ isDirector: true }, ME, true);
    const confirm = await screen.findByRole('button', { name: 'Delete the book' });
    await userEvent.type(screen.getByRole('textbox'), 'test');
    expect(confirm).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Download the book (.xlsx)' }));
    expect(confirm).toBeDisabled();
    finish(null);
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(deleteBook).not.toHaveBeenCalled();
  });
});
