import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { ReclaimBookSection } from './ReclaimBookSection';
import { AuditFeed } from './AuditFeed';
import type { BookContextValue } from './bookContextValue';
import type { OfficerVerdict } from '../taxBook/bookClient';

const reclaimBook = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  reclaimBook: (...a: unknown[]) => reclaimBook(...a),
  editBook: vi.fn(),
}));

const CORP = 98000001;
const ME = 7;

function renderSection(verdict: Partial<OfficerVerdict>) {
  const reload = vi.fn();
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: ME,
            corporationId: CORP,
            verdict: { isCeo: false, isDirector: false, canEdit: true, ...verdict },
            reload,
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <ReclaimBookSection />
      </BookProvider>
    </MemoryRouter>
  );
  return { reload };
}

const openButton = () => screen.queryByRole('button', { name: 'Reclaim the book…' });

beforeEach(() => {
  reclaimBook.mockReset().mockResolvedValue({ officersRevoked: 3 });
});

describe('ReclaimBookSection', () => {
  it('shows the action to the CEO only', () => {
    renderSection({ isCeo: true });
    expect(openButton()).toBeInTheDocument();
  });

  it.each([
    ['a Director', { isDirector: true }],
    ['an Accountant', { isDirector: false }],
  ])('hides the action from %s', (_who, verdict) => {
    renderSection(verdict);
    expect(openButton()).not.toBeInTheDocument();
  });

  it('confirming reclaims the book, reloads it and shows how many officers must re-verify', async () => {
    const { reload } = renderSection({ isCeo: true });
    await userEvent.click(openButton()!);
    expect(screen.getByText(/Every other officer loses access/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reclaim the book' }));
    expect(reclaimBook).toHaveBeenCalledWith(ME, CORP);
    expect(reload).toHaveBeenCalled();
    expect(await screen.findByText('Book reclaimed; 3 officers must re-verify')).toBeVisible();
  });

  it('cancelling calls nothing', async () => {
    renderSection({ isCeo: true });
    await userEvent.click(openButton()!);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reclaimBook).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the confirm step", async () => {
    reclaimBook.mockRejectedValue(new Error('This corporation has no Corp Tax Book'));
    renderSection({ isCeo: true });
    await userEvent.click(openButton()!);
    await userEvent.click(screen.getByRole('button', { name: 'Reclaim the book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This corporation has no Corp Tax Book'
    );
  });
});

describe('AuditFeed reclaim entry', () => {
  it('reads as a reclaim with the revoked count', () => {
    render(
      <AuditFeed
        entries={[
          {
            id: 'a1',
            at: Date.parse('2026-10-18T12:00:00Z'),
            by: ME,
            byName: 'Pilot 7',
            action: 'reclaim',
            detail: { officersRevoked: 2 },
          },
        ]}
      />
    );
    expect(screen.getByText(/reclaimed the book/)).toBeInTheDocument();
    expect(screen.getByText(/2 officers must re-verify/)).toBeInTheDocument();
  });
});
